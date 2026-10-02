
(function(){
  "use strict";
  var $ = function(s){ return document.querySelector(s); };
  /* the interface's language (i18n.js, loaded just before this file): _t("Read aloud") is "Voorlezen"
     while the interface is Dutch and "Read aloud" otherwise; _tn(n, "1 book", "{n} books") for a count;
     _tc(ctx, s) where one English word has two Dutch ones. Named _t, not t: t is a common local name
     here. I18N has the rest: num, date, time, dateTime, rel, ago, list, locale, lang, apply */
  var I18N = window.LL_I18N || (function(){
    function fill(s, v){ return v ? String(s).replace(/\{(\w+)\}/g, function(m, k){ return v[k] !== undefined && v[k] !== null ? String(v[k]) : m; }) : s; }
    function tn(n, one, other, v){ var o = { n: n }; for (var k in v || {}) o[k] = v[k]; return fill(Number(n) === 1 ? one : other, o); }
    return { t: fill, tn: tn, tc: function(c, s, v){ return fill(s, v); }, lang: function(){ return "en"; }, setting: function(){ return "en"; }, locale: function(){ return undefined; },
             num: function(n){ return String(n); }, date: function(d, o){ return new Date(d).toLocaleDateString(undefined, o); }, time: function(d, o){ return new Date(d).toLocaleTimeString(undefined, o); },
             dateTime: function(d, o){ return new Date(d).toLocaleString(undefined, o); }, rel: function(v, u){ return Math.abs(v) + " " + u + (Math.abs(v) === 1 ? "" : "s") + (v < 0 ? " ago" : ""); },
             ago: function(w){ return new Date(w).toLocaleDateString(); }, list: function(a){ return a.join(", "); }, apply: function(){} };
  })();
  var _t = I18N.t, _tn = I18N.tn, _tc = I18N.tc;
  /* the English a string on screen was translated from, for the few places that read a label's own
     words (the menu's toggles, the toast's icon); the string itself while the interface is English,
     or when the table has no single entry for it (a message with a name filled in) */
  var _en = (function(){
    var rev = null, own = Object.prototype.hasOwnProperty;
    return function(s){
      if (I18N.lang() !== "nl" || !I18N.NL) return s;
      if (!rev){
        rev = {};
        for (var k in I18N.NL) if (own.call(I18N.NL, k) && !own.call(rev, I18N.NL[k])) rev[I18N.NL[k]] = k.replace(/^[\w-]+\|/, "");
      }
      return own.call(rev, s) ? rev[s] : s;
    };
  })();
  /* localStorage can throw (Safari with all cookies blocked, some private modes); treat it as optional */
  var Store = {
    get: function(k){ try { return localStorage.getItem(k); } catch(_){ return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch(_){} },
    remove: function(k){ try { localStorage.removeItem(k); } catch(_){} }
  };
  /* phones: a window 560px wide or less, the width at which the popovers, panels and cards become
     bottom sheets; held in one hand: the same with a finger as the pointer (PhoneBar) */
  var PHONE_MQ = window.matchMedia ? window.matchMedia("(max-width:560px)") : null;
  function isPhone(){ return !!(PHONE_MQ && PHONE_MQ.matches); }
  /* a book is named by its own title (an EPUB's metadata, the first heading of a Markdown, HTML or
     DOCX file, a DOCX's core title); without one, by its file name less the extension */
  function bareName(n){ n = String(n || ""); return n.replace(/\.[A-Za-z0-9]{1,8}$/, "") || n; }
  function bookName(b){ return b ? (b.title || bareName(b.name)) : ""; }
  /* the title in the bar. Its text is the title alone — the notes export, printing, About and the
     lock-screen controls read it; the section follows it from a data attribute (Section) */
  function setFname(t){
    var f = document.getElementById("fname");
    f.textContent = "";
    if (t){ var sp = document.createElement("span"); sp.className = "fn-t"; sp.textContent = t; f.appendChild(sp); }
  }

  /* a long press (about half a second on the spot) runs `fn` instead of the tap: the click the
     finger's lift would send is swallowed, and so is the context menu a long press brings up on
     some phones. Keys keep the tap (the same actions have their own keys and buttons) */
  function longPress(el, fn, ms){
    if (!el) return;
    var timer = null, x = 0, y = 0, fired = 0;
    function clear(){ clearTimeout(timer); timer = null; }
    el.addEventListener("pointerdown", function(e){
      if (e.button !== undefined && e.button !== 0) return;
      clear(); x = e.clientX; y = e.clientY;
      timer = setTimeout(function(){
        timer = null; fired = Date.now();
        if (navigator.vibrate) try { navigator.vibrate(12); } catch(_){}
        fn();
      }, ms || 520);
    });
    el.addEventListener("pointermove", function(e){ if (timer && (Math.abs(e.clientX - x) > 10 || Math.abs(e.clientY - y) > 10)) clear(); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function(t){ el.addEventListener(t, clear); });
    el.addEventListener("click", function(e){ if (Date.now() - fired < 900){ fired = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    el.addEventListener("contextmenu", function(e){ if (timer || Date.now() - fired < 900) e.preventDefault(); });
  }

  /* swipe a bottom sheet down to close it (phones). From its handle or its head the sheet follows the
     finger one to one; past 80px, or on a quick flick, it closes through `close` — the sheet's own
     close, so focus and the inert page come back exactly as they do for its × — else it springs
     back. The springs are the sheet's own transitions: none under reduced motion or in e-ink mode. */
  /* sel: for a sheet drawn anew each time it opens, the parts of it (under a grip) that drag */
  function dragToClose(sheet, grips, close, when, sel){
    if (!sheet || !window.PointerEvent) return;
    var id = null, y0 = 0, dy = 0, lastY = 0, lastT = 0, v = 0, moved = 0, grip = null;
    function start(e){
      if (id !== null || !isPhone() || (when && !when()) || (e.button !== undefined && e.button !== 0)) return;
      if (sel && !(e.target.closest && e.target.closest(sel))) return;
      /* a control in the head (the ×, a switcher button) keeps its tap; the handle and the words drag */
      if (e.target.closest && e.target.closest("button, a, input, select, textarea, summary, [role=tab], [tabindex='0']") && !e.target.closest("[data-grip]")) return;
      id = e.pointerId; y0 = lastY = e.clientY; lastT = Date.now(); dy = 0; v = 0; grip = e.currentTarget;
    }
    function move(e){
      if (e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      var now = Date.now();
      if (now > lastT){ v = (e.clientY - lastY) / (now - lastT); lastY = e.clientY; lastT = now; }
      if (dy > 4){
        /* a drag, not a tap: the grip keeps the pointer from here (taken at once, it would steal the
           handle's own click) */
        if (grip){ try { grip.setPointerCapture(id); } catch(_){} grip = null; }
        sheet.style.transition = "none"; sheet.style.transform = "translateY(" + Math.round(dy) + "px)"; sheet.classList.add("dragging");
      }
    }
    function end(e){
      if (e.pointerId !== id) return;
      id = null; grip = null;
      var was = dy > 4, go = dy > 80 || (dy > 24 && v > 0.55);
      sheet.classList.remove("dragging");
      sheet.style.transition = ""; sheet.style.transform = "";
      if (was) moved = Date.now();
      if (go) close();
    }
    grips.forEach(function(g){
      if (!g) return;
      g.addEventListener("pointerdown", start);
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", end);
      g.addEventListener("pointercancel", function(e){ if (e.pointerId === id){ dy = 0; end(e); } });
      /* the tap a drag ends with is not a tap on the handle */
      g.addEventListener("click", function(e){ if (Date.now() - moved < 400){ moved = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    });
  }

  /* ---------- sliders: the part up to the thumb is filled (app.css draws it from --v) ----------
     Every range input carries --v, its value as a share of its span: kept on input, on every
     .value a script sets (a preference restored, the other copy of a pair kept in step), when its
     min, max or value attribute changes, and for the sliders the panels draw later */
  var RangeFill = (function(){
    var SEL = 'input[type="range"]';
    function fill(r){
      if (!r || r.type !== "range") return;
      var min = r.min === "" ? 0 : +r.min, max = r.max === "" ? 100 : +r.max, v = +r.value;
      var p = max > min ? (v - min) / (max - min) * 100 : 0;
      r.style.setProperty("--v", Math.max(0, Math.min(100, p)).toFixed(2) + "%");
    }
    function sweep(root){ Array.prototype.forEach.call((root || document).querySelectorAll(SEL), fill); }
    document.addEventListener("input", function(e){ fill(e.target); }, true);
    document.addEventListener("change", function(e){ fill(e.target); }, true);
    try {
      var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (d && d.get && d.set && d.configurable){
        Object.defineProperty(HTMLInputElement.prototype, "value", { configurable: true, enumerable: d.enumerable, get: d.get,
          set: function(v){ d.set.call(this, v); if (this.type === "range") fill(this); } });
      }
    } catch(_){}
    if (window.MutationObserver){
      new MutationObserver(function(recs){
        for (var i = 0; i < recs.length; i++){
          var rec = recs[i], t = rec.target;
          if (rec.type === "attributes"){ if (t.type === "range") fill(t); continue; }
          if (t.closest && t.closest("#doc, #pdf")) continue;
          for (var j = 0; j < rec.addedNodes.length; j++){
            var n = rec.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (n.type === "range") fill(n); else if (n.querySelector && n.querySelector(SEL)) sweep(n);
          }
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["min", "max", "value"] });
    }
    sweep();
    return { fill: fill, sweep: sweep };
  })();
  /* the bar lifts off the page (a shadow on a light theme, app.css) once there is text under it */
  (function(){
    var on = null;
    function check(){ var s = window.scrollY > 2; if (s !== on){ on = s; document.body.classList.toggle("scrolled", s); } }
    window.addEventListener("scroll", check, { passive: true });
    check();
  })();

  /* parsers are separate files, fetched the first time a file type needs them
     (and precached by the service worker so that still works offline) */
  var LIBS = {
    pdf:     ["./vendor/pdf.min.js"],   /* parsing runs in vendor/pdf.worker.min.js, a real Web Worker (see needPdf) */
    mammoth: ["./vendor/mammoth.min.js"],
    marked:  ["./vendor/marked.min.js"],
    purify:  ["./vendor/purify.min.js"],
    jszip:   ["./vendor/jszip.min.js"],
    explain: ["./explain.js"],
    morph:   ["./morph.js"],
    translate: ["./translate.js"],
    audiobook: ["./audiobook.js"],  /* who speaks each line, a voice per character, ElevenLabs and natural (Piper, Kokoro) narration (see Speak.registerEngine) */
    sounds:  ["./sounds.js"]        /* background sounds made with the Web Audio API (see Sounds) */
  };
  function need(names){
    var files = [];
    names.forEach(function(n){ (LIBS[n] || []).forEach(function(f){ if (files.indexOf(f) < 0) files.push(f); }); });
    return files.reduce(function(p, f){ return p.then(function(){ return loadScript(f); }); }, Promise.resolve());
  }
  /* pdf.js with its parser in a Web Worker; falls back to the main thread where workers can't run (file://) */
  function needPdf(){
    return need(["pdf"]).then(function(){
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc && !globalThis.pdfjsWorker){
        if (window.Worker && location.protocol !== "file:") pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.js";
        else return loadScript("./vendor/pdf.worker.min.js");
      }
    });
  }
  /* DOCX → HTML in a dedicated worker (mammoth is 640 KB of parsing); main thread as a fallback */
  function docxToHtml(file){
    var onMain = function(){
      return need(["mammoth"]).then(function(){ return file.arrayBuffer(); })
        .then(function(buf){ return mammoth.convertToHtml({arrayBuffer: buf}); }).then(function(res){ return res.value; });
    };
    if (!window.Worker || location.protocol === "file:") return onMain();
    return file.arrayBuffer().then(function(buf){
      return new Promise(function(resolve, reject){
        var w;
        try { w = new Worker("./workers/docx-worker.js"); } catch(err){ reject(err); return; }
        var done = false;
        w.onmessage = function(e){
          done = true; w.terminate();
          if (e.data && e.data.error) reject(new Error(e.data.error)); else resolve(e.data.html);
        };
        w.onerror = function(e){ if (done) return; done = true; w.terminate(); reject(new Error((e && e.message) || "worker failed")); };
        w.postMessage({ buf: buf }, [buf]);
      });
    }).catch(function(err){ console.warn("docx worker unavailable, converting on the main thread", err); return onMain(); });
  }

  /* Built-in themes. Every pair the reader meets is at least 4.5:1 — tests/themes.js audits this
     table: text, secondary text, the accent and the lamp on the page, the panel and the raised
     surface; the panel colour on a lamp or accent fill; the text on the soft lamp and accent tints.
     `panel` is the bars and sheets, `raise` the cards and sheets on top of them (a touch brighter on
     a light page, a lift in the theme's own hue on a dark one). `line` is a decorative divider only:
     a boundary that carries meaning is drawn in --edge (the secondary text colour) or the accent.
     `lamp` is the "light, brand and now" colour (the progress line, the wordmark, the primary
     buttons, the stars) and it belongs to the theme: brass or honey in the warm family, the theme's
     own hue in the cool one (sky is blue, forest green, plum purple), the one signal colour of a
     neutral one (paper's red ink, terminal's phosphor). `family` (warm, cool, neutral) records which;
     a custom theme's lamp is its accent. */
  var THEMES = {
    /* light */
    day:       {name:"Day",           family:"warm",    bg:"#EDEDE6", panel:"#F5F5EF", raise:"#FBFBF7", ink:"#1F2323", muted:"#5E6562", line:"#D8D9CF", accent:"#2F6D5B", lamp:"#955F0F"},
    sepia:     {name:"Sepia",         family:"warm",    bg:"#E9DDC5", panel:"#F0E7D2", raise:"#F6EFDF", ink:"#40331F", muted:"#6A5B3F", line:"#D6C7A4", accent:"#86551A", lamp:"#86551A"},
    parchment: {name:"Parchment",     family:"warm",    bg:"#F1E4C6", panel:"#F7ECD4", raise:"#FBF3E2", ink:"#2C2114", muted:"#67563A", line:"#DCCBA3", accent:"#8B2F2A", lamp:"#8B590E"},
    linen:     {name:"Linen",         family:"warm",    bg:"#F3EFE6", panel:"#FAF8F1", raise:"#FDFCF8", ink:"#2B2A26", muted:"#625F57", line:"#DDD8CB", accent:"#5A6828", lamp:"#955F0F"},
    peach:     {name:"Peach",         family:"warm",    bg:"#FBE7DA", panel:"#FDF1E8", raise:"#FFF8F3", ink:"#3B2A21", muted:"#72574A", line:"#EBD1C0", accent:"#146C72", lamp:"#A0461D"},
    rose:      {name:"Rose",          family:"warm",    bg:"#F4E7E3", panel:"#F9EFEC", raise:"#FDF7F5", ink:"#44302D", muted:"#775D56", line:"#E3CFC9", accent:"#A8495A", lamp:"#A13F52"},
    paper:     {name:"Paper",         family:"neutral", bg:"#FAFAF7", panel:"#FFFFFF", raise:"#FFFFFF", ink:"#141414", muted:"#5C5C58", line:"#E1E1DA", accent:"#BE2A24", lamp:"#B3261E"},
    newsprint: {name:"Newsprint",     family:"neutral", bg:"#E3E2DC", panel:"#EBEAE5", raise:"#F2F1ED", ink:"#2B2B2B", muted:"#5A5A57", line:"#CDCCC5", accent:"#A82424", lamp:"#9E2020"},
    mist:      {name:"Mist",          family:"cool",    bg:"#E7EBEE", panel:"#F0F3F5", raise:"#F7F9FA", ink:"#25303A", muted:"#5A6773", line:"#D1D9DF", accent:"#3C6E93", lamp:"#2F6388"},
    sky:       {name:"Sky",           family:"cool",    bg:"#E2EDF7", panel:"#EEF5FB", raise:"#F7FAFD", ink:"#17293A", muted:"#4C5F71", line:"#C7D8E7", accent:"#2068A8", lamp:"#1D5F9C"},
    lavender:  {name:"Lavender",      family:"cool",    bg:"#ECE7F4", panel:"#F4F1FA", raise:"#FAF8FD", ink:"#29233A", muted:"#5D5573", line:"#D6CFE4", accent:"#6A4DB5", lamp:"#6446AE"},
    mint:      {name:"Mint",          family:"cool",    bg:"#DEF2E8", panel:"#EAF7F0", raise:"#F5FBF8", ink:"#153128", muted:"#45655A", line:"#C1DFD1", accent:"#0D7566", lamp:"#0B6E60"},
    sage:      {name:"Sage",          family:"cool",    bg:"#E3EADD", panel:"#EDF2E8", raise:"#F6F9F3", ink:"#1F2A22", muted:"#526055", line:"#CAD5C3", accent:"#A2502E", lamp:"#3E6A44"},
    /* dark */
    dusk:      {name:"Dusk",          family:"warm",    bg:"#14161B", panel:"#1B1E25", raise:"#25262B", ink:"#D6D3C8", muted:"#8E9088", line:"#33343A", accent:"#D8A24A", lamp:"#D8A24A"},
    ink:       {name:"Ink",           family:"warm",    bg:"#050506", panel:"#0E0E11", raise:"#17171B", ink:"#C7C3B6", muted:"#86837A", line:"#24242A", accent:"#C08D3F", lamp:"#C08D3F"},
    cocoa:     {name:"Cocoa",         family:"warm",    bg:"#1B1411", panel:"#241B17", raise:"#2D221D", ink:"#E9DBCF", muted:"#A6958A", line:"#3F312A", accent:"#D8A067", lamp:"#D8A067"},
    ember:     {name:"Ember",         family:"warm",    bg:"#1A1210", panel:"#221815", raise:"#2B1F1B", ink:"#EBDACD", muted:"#A68F80", line:"#3F2D25", accent:"#F2812E", lamp:"#F2812E"},
    candle:    {name:"Candle",        family:"warm",    bg:"#2A1D14", panel:"#33251A", raise:"#3B2B1F", ink:"#F0DDB4", muted:"#B8A485", line:"#4C3A2A", accent:"#E9C46A", lamp:"#E9C46A"},
    amber:     {name:"Amber",         family:"warm",    bg:"#0F0A03", panel:"#17100A", raise:"#20170E", ink:"#FFB000", muted:"#B98319", line:"#302311", accent:"#FFDF70", lamp:"#FFDF70"},
    forest:    {name:"Forest",        family:"cool",    bg:"#101711", panel:"#161F17", raise:"#1C271D", ink:"#CDD8C6", muted:"#86937F", line:"#2A3727", accent:"#7FB069", lamp:"#8FC274"},
    moss:      {name:"Moss",          family:"cool",    bg:"#161A10", panel:"#1D2215", raise:"#242A1B", ink:"#D7DBC2", muted:"#959C80", line:"#343C29", accent:"#B7C86A", lamp:"#B7C86A"},
    ocean:     {name:"Ocean",         family:"cool",    bg:"#0D141E", panel:"#131C29", raise:"#1A2533", ink:"#CBD5E1", muted:"#8190A4", line:"#26354A", accent:"#5C9CD6", lamp:"#6AAAE6"},
    midnight:  {name:"Midnight",      family:"cool",    bg:"#0B1126", panel:"#111A36", raise:"#172142", ink:"#D8DDEE", muted:"#95A0BF", line:"#243056", accent:"#9DB4FF", lamp:"#9DB4FF"},
    plum:      {name:"Plum",          family:"cool",    bg:"#17101F", panel:"#1E1628", raise:"#261D32", ink:"#D8CDE3", muted:"#958AA3", line:"#342846", accent:"#A97FD6", lamp:"#B78DE6"},
    slate:     {name:"Slate",         family:"cool",    bg:"#1C2229", panel:"#242B33", raise:"#2B333C", ink:"#D5DBE1", muted:"#97A3AE", line:"#39434E", accent:"#EF8C76", lamp:"#EF8C76"},
    graphite:  {name:"Graphite",      family:"neutral", bg:"#1E1F22", panel:"#26272B", raise:"#2D2E33", ink:"#D8D8D5", muted:"#A0A09C", line:"#3A3B41", accent:"#74D0B8", lamp:"#74D0B8"},
    noir:      {name:"Noir",          family:"neutral", bg:"#000000", panel:"#0B0B0B", raise:"#141414", ink:"#C6C6C6", muted:"#8E8E8E", line:"#262626", accent:"#EDEDED", lamp:"#EDEDED"},
    terminal:  {name:"Terminal",      family:"neutral", bg:"#050805", panel:"#0A110A", raise:"#0F190F", ink:"#3FE86F", muted:"#2FA354", line:"#183018", accent:"#D9FF6E", lamp:"#D9FF6E"},
    /* Dutch: Delft blue, Vermeer, Rembrandt, the tulip fields, the polder and the canals at dusk */
    delft:      {name:"Delft blue",  family:"cool",   bg:"#F2F4F3", panel:"#F8F9F8", raise:"#FFFFFF", ink:"#13285A", muted:"#4A5878", line:"#D2D9E6", accent:"#2350B0", lamp:"#1A3E8E"},
    vermeer:    {name:"Vermeer",     family:"cool",   bg:"#11131B", panel:"#181B26", raise:"#202432", ink:"#ECE6D8", muted:"#A3A099", line:"#2D3243", accent:"#8EA6F0", lamp:"#F0D04C"},
    rembrandt:  {name:"Rembrandt",   family:"warm",   bg:"#16140C", panel:"#1E1B11", raise:"#272317", ink:"#EBD9A8", muted:"#A99A76", line:"#383120", accent:"#DE8A55", lamp:"#F0B93A"},
    tulips:     {name:"Tulip field", family:"warm",   bg:"#FBF2E4", panel:"#FDF7EE", raise:"#FFFCF7", ink:"#2E1E1A", muted:"#6E5650", line:"#ECDCC6", accent:"#2E6A3A", lamp:"#C0263A"},
    polder:     {name:"Polder",      family:"cool",   bg:"#E2E5E4", panel:"#EBEDEC", raise:"#F3F4F4", ink:"#22282A", muted:"#565E61", line:"#CBD1D1", accent:"#2D5F7F", lamp:"#2E6B1F"},
    canals:     {name:"Canals",      family:"cool",   bg:"#0E1F22", panel:"#13292D", raise:"#193337", ink:"#DCE6E2", muted:"#93A8A6", line:"#24403F", accent:"#E58E6C", lamp:"#F2C66B"},
    /* nature and the seasons */
    autumn:     {name:"Autumn wood", family:"warm",   bg:"#1E2316", panel:"#252B1C", raise:"#2D3422", ink:"#EDE3CC", muted:"#ABA58C", line:"#3A4229", accent:"#E8A04A", lamp:"#F08A4B"},
    winter:     {name:"Winter morning", family:"cool",   bg:"#ECEFF4", panel:"#F4F6F9", raise:"#FAFBFD", ink:"#1B2733", muted:"#536070", line:"#D3D9E3", accent:"#2C5F8A", lamp:"#A93F55"},
    aurora:     {name:"Northern lights", family:"cool",   bg:"#0A1218", panel:"#0F1A22", raise:"#15222C", ink:"#D5E4E6", muted:"#8CA3A8", line:"#1F3340", accent:"#5EE0A5", lamp:"#C49BFF"},
    seaair:     {name:"Sea air",     family:"cool",   bg:"#E3EEF1", panel:"#EDF5F7", raise:"#F6FAFB", ink:"#12302F", muted:"#476663", line:"#C4DCE0", accent:"#0F5F7A", lamp:"#A6421B"},
    blossom:    {name:"Cherry blossom", family:"warm",   bg:"#FBEDF1", panel:"#FDF5F7", raise:"#FFFAFB", ink:"#3A2229", muted:"#78545E", line:"#EFD5DC", accent:"#5A3A33", lamp:"#B3366A"},
    /* cozy rooms */
    coffee:     {name:"Coffee house", family:"warm",   bg:"#E6D5C3", panel:"#EEE2D5", raise:"#F6EFE7", ink:"#2E2018", muted:"#654F40", line:"#D5C0AA", accent:"#8A3B22", lamp:"#84490F"},
    library:    {name:"Old library", family:"warm",   bg:"#0F231B", panel:"#152B22", raise:"#1B3429", ink:"#E8DFC6", muted:"#A7A38C", line:"#26402F", accent:"#E0947F", lamp:"#D6B05A"},
    rain:       {name:"Rainy evening", family:"cool",   bg:"#151C26", panel:"#1B2430", raise:"#222C3A", ink:"#D3D9E0", muted:"#929BA6", line:"#323C4A", accent:"#9CC0E6", lamp:"#F3A04A"},
    cabin:      {name:"Candle cabin", family:"warm",   bg:"#3A2516", panel:"#432C1C", raise:"#4C3322", ink:"#FBE9CC", muted:"#D0B698", line:"#5A4030", accent:"#F7A891", lamp:"#FFD27A"},
    nighttrain: {name:"Night train", family:"warm",   bg:"#1A0F14", panel:"#22141B", raise:"#2B1A22", ink:"#EADBD8", muted:"#AE959B", line:"#3D2530", accent:"#9DBDF0", lamp:"#F2B45A"},
    /* textured: a faint paper or cloth surface behind the text (app.css [data-texture]; off in e-ink, high contrast and with Plain background) */
    handmade:   {name:"Handmade paper", family:"neutral",bg:"#F1EEE7", panel:"#F7F5F0", raise:"#FCFBF8", ink:"#222120", muted:"#5D5A55", line:"#DCD8CE", accent:"#24508F", lamp:"#8A5A14", texture:"grain"},
    bookcloth:  {name:"Book cloth",  family:"cool",   bg:"#E4E6DE", panel:"#ECEEE7", raise:"#F4F5F1", ink:"#23261F", muted:"#565B51", line:"#CDD1C4", accent:"#3F5D7A", lamp:"#7A4E1C", texture:"linen"},
    laid:       {name:"Laid paper",  family:"warm",   bg:"#EEEBDC", panel:"#F5F3E8", raise:"#FBFAF4", ink:"#26251C", muted:"#5E5B4A", line:"#D9D5C0", accent:"#6B3F86", lamp:"#8C5A12", texture:"laid"},
    vellum:     {name:"Vellum",      family:"warm",   bg:"#F2E9DE", panel:"#F8F2EA", raise:"#FCF9F5", ink:"#2A2019", muted:"#66584C", line:"#E0D2C0", accent:"#2B4C9A", lamp:"#A3361C", texture:"vellum"},
    /* high contrast: pure white / black with a strong accent, for low vision or bright sunlight */
    hicon:     {name:"Contrast",      family:"neutral", bg:"#FFFFFF", panel:"#FFFFFF", raise:"#FFFFFF", ink:"#000000", muted:"#3A3A3A", line:"#000000", accent:"#0033CC", lamp:"#0033CC"},
    hidark:    {name:"Contrast dark", family:"neutral", bg:"#000000", panel:"#000000", raise:"#000000", ink:"#FFFFFF", muted:"#D0D0D0", line:"#FFFFFF", accent:"#FFD400", lamp:"#FFD400"}
  };
  /* the picker shows the built-ins in four groups (display only: the tone still comes from the
     page colour), and the lamp cycles them in the same order */
  var HICON = ["hicon", "hidark"];
  var THEME_GROUPS = {
    light:  ["day", "paper", "sepia", "parchment", "linen", "newsprint", "mist"],
    dark:   ["dusk", "ink", "graphite", "cocoa", "slate", "noir", "candle"],
    colour: ["rose", "peach", "sage", "mint", "sky", "lavender", "forest", "moss", "ocean", "midnight", "plum", "ember", "terminal", "amber"],
    /* the four collections: one Collections tab in the picker, a labelled section each */
    dutch:   ["delft", "vermeer", "rembrandt", "tulips", "polder", "canals"],
    nature:  ["autumn", "winter", "aurora", "seaair", "blossom"],
    cozy:    ["coffee", "library", "rain", "cabin", "nighttrain"],
    texture: ["handmade", "bookcloth", "laid", "vellum"]
  };
  var COLLECTIONS = ["dutch", "nature", "cozy", "texture"];
  function themeGroups(){
    return [{ id: "light", name: _t("Light"), ids: THEME_GROUPS.light.slice() }, { id: "dark", name: _t("Dark"), ids: THEME_GROUPS.dark.slice() },
      { id: "colour", name: _t("Colour"), ids: THEME_GROUPS.colour.slice() },
      { id: "dutch", name: _tc("theme group", "Dutch"), ids: THEME_GROUPS.dutch.slice() }, { id: "nature", name: _t("Nature and seasons"), ids: THEME_GROUPS.nature.slice() },
      { id: "cozy", name: _t("Cozy"), ids: THEME_GROUPS.cozy.slice() }, { id: "texture", name: _t("Textured"), ids: THEME_GROUPS.texture.slice() },
      { id: "hicon", name: _t("High contrast"), ids: HICON.slice() }];
  }
  var CYCLE = themeGroups().reduce(function(all, g){ return all.concat(g.ids); }, []);
  /* a theme's name on screen: a built-in's in the interface's language (the table above keeps the
     English), a saved one's as the reader named it */
  function themeName(theme){
    if (isBuiltIn(theme)) return _tc("theme", THEMES[theme].name);
    var c = customById(theme);
    return c ? c.name : "";
  }
  /* system stacks: the plain choice in each group, and what a bundled family shows before it
     has loaded (or falls back to when it can't) */
  var STACKS = {
    serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif",
    sans:  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    mono:  "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace"
  };
  /* a bundled face: fonts/<file>.woff2 at one weight (a range for variable fonts) and style.
     A family's first file is its regular face, the only one a preview needs. */
  function fontFile(file, weight, style){ return { url: "./fonts/" + file + ".woff2", weight: weight, style: style || "normal" }; }
  /* the type catalogue, in menu order. Families with files are bundled and fetched the first
     time they are chosen or previewed (see Fonts), so this table costs nothing at load; system
     entries have no files. The old ids (serif, sans, mono, hyper) keep their stacks.
     `range` is the family's weight range: the span of a variable file, or the two weights a pair
     of static files (or a system stack, which the browser synthesises) can offer. A family with
     no variable file has only its two weights, and the Weight slider says so. */
  var FONTS = {
    /* easy reading */
    dyslexic:    { name: "OpenDyslexic", range: [400, 700], group: "easy", stack: "'OpenDyslexic', " + STACKS.sans, note: "weighted letter bottoms and wide spacing help letters stay put",
                   files: [fontFile("opendyslexic-latin-400-normal", "400"), fontFile("opendyslexic-latin-700-normal", "700"), fontFile("opendyslexic-latin-400-italic", "400", "italic"), fontFile("opendyslexic-latin-700-italic", "700", "italic")] },
    lexend:      { name: "Lexend", range: [100, 900], group: "easy", stack: "'Lexend', " + STACKS.sans, note: "wide, even shapes shown to raise reading speed",
                   files: [fontFile("lexend-latin-wght-normal", "100 900")] },
    hyper:       { name: "Atkinson Hyperlegible", range: [400, 700], group: "easy", stack: "'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", note: "designed for low vision readers" },   /* its @font-face rules are in app.css */
    andika:      { name: "Andika", range: [400, 700], group: "easy", stack: "'Andika', " + STACKS.sans, note: "clear letterforms for beginning readers",
                   files: [fontFile("andika-latin-400-normal", "400"), fontFile("andika-latin-700-normal", "700"), fontFile("andika-latin-400-italic", "400", "italic")] },
    /* serif */
    serif:       { name: "Georgia", range: [400, 700], group: "serif", stack: STACKS.serif, note: "the classic screen serif, on nearly every device" },
    palatino:    { name: "Palatino", range: [400, 700], group: "serif", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', serif", note: "a calligraphic book face, where the device has it" },
    times:       { name: "Times", range: [400, 700], group: "serif", stack: "'Times New Roman', Times, 'Nimbus Roman', serif", note: "the newspaper serif everyone knows" },
    literata:    { name: "Literata", range: [200, 900], group: "serif", stack: "'Literata', " + STACKS.serif, note: "made for e-reading",
                   files: [fontFile("literata-latin-wght-normal", "200 900"), fontFile("literata-latin-wght-italic", "200 900", "italic")] },
    sourceserif: { name: "Source Serif", family: "Source Serif 4", range: [200, 900], group: "serif", stack: "'Source Serif 4', " + STACKS.serif, note: "a sturdy, open text serif",
                   files: [fontFile("source-serif-4-latin-wght-normal", "200 900"), fontFile("source-serif-4-latin-wght-italic", "200 900", "italic")] },
    lora:        { name: "Lora", range: [400, 700], group: "serif", stack: "'Lora', " + STACKS.serif, note: "brushed curves with a modern feel",
                   files: [fontFile("lora-latin-wght-normal", "400 700"), fontFile("lora-latin-wght-italic", "400 700", "italic")] },
    merriweather:{ name: "Merriweather", range: [300, 900], group: "serif", stack: "'Merriweather', " + STACKS.serif, note: "large x-height, pleasant on screens",
                   files: [fontFile("merriweather-latin-wght-normal", "300 900"), fontFile("merriweather-latin-wght-italic", "300 900", "italic")] },
    garamond:    { name: "EB Garamond", range: [400, 800], group: "serif", stack: "'EB Garamond', " + STACKS.serif, note: "a faithful old-style Garamond",
                   files: [fontFile("eb-garamond-latin-wght-normal", "400 800"), fontFile("eb-garamond-latin-wght-italic", "400 800", "italic")] },
    crimson:     { name: "Crimson Pro", range: [200, 900], group: "serif", stack: "'Crimson Pro', " + STACKS.serif, note: "an old-style face in the spirit of printed books",
                   files: [fontFile("crimson-pro-latin-wght-normal", "200 900"), fontFile("crimson-pro-latin-wght-italic", "200 900", "italic")] },
    baskerville: { name: "Libre Baskerville", range: [400, 700], group: "serif", stack: "'Libre Baskerville', " + STACKS.serif, note: "a Baskerville tuned for reading on screens",
                   files: [fontFile("libre-baskerville-latin-400-normal", "400"), fontFile("libre-baskerville-latin-700-normal", "700"), fontFile("libre-baskerville-latin-400-italic", "400", "italic")] },
    bitter:      { name: "Bitter", range: [100, 900], group: "serif", stack: "'Bitter', " + STACKS.serif, note: "a slab serif, solid at any size",
                   files: [fontFile("bitter-latin-wght-normal", "100 900")] },
    /* sans */
    sans:        { name: "System sans", range: [400, 700], group: "sans", stack: STACKS.sans, note: "whatever your device uses for its own text" },
    helvetica:   { name: "Helvetica / Arial", range: [400, 700], group: "sans", stack: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif", note: "neutral and familiar" },
    verdana:     { name: "Verdana", range: [400, 700], group: "sans", stack: "Verdana, 'DejaVu Sans', Geneva, sans-serif", note: "wide and generous, made for small screens" },
    inter:       { name: "Inter", range: [100, 900], group: "sans", stack: "'Inter', " + STACKS.sans, note: "a clean interface sans with tall letters",
                   files: [fontFile("inter-latin-wght-normal", "100 900")] },
    plex:        { name: "IBM Plex Sans", range: [100, 700], group: "sans", stack: "'IBM Plex Sans', " + STACKS.sans, note: "a warm, even sans with a slight edge",
                   files: [fontFile("ibm-plex-sans-latin-wght-normal", "100 700"), fontFile("ibm-plex-sans-latin-wght-italic", "100 700", "italic")] },
    nunito:      { name: "Nunito", range: [200, 1000], group: "sans", stack: "'Nunito', " + STACKS.sans, note: "rounded and soft on the eye",
                   files: [fontFile("nunito-latin-wght-normal", "200 1000")] },
    /* mono */
    mono:        { name: "System mono", range: [400, 700], group: "mono", stack: STACKS.mono, note: "fixed width, for code and plain text" },
    jetbrains:   { name: "JetBrains Mono", range: [100, 800], group: "mono", stack: "'JetBrains Mono', " + STACKS.mono, note: "a tall, open monospace made for long reads",
                   files: [fontFile("jetbrains-mono-latin-wght-normal", "100 800")] },
    plexmono:    { name: "IBM Plex Mono", range: [400, 700], group: "mono", stack: "'IBM Plex Mono', " + STACKS.mono, note: "a typewriter-flavoured monospace",
                   files: [fontFile("ibm-plex-mono-latin-400-normal", "400"), fontFile("ibm-plex-mono-latin-700-normal", "700")] }
  };
  var FONT_GROUPS = [{ id: "easy", name: "Easy reading" }, { id: "serif", name: "Serif" }, { id: "sans", name: "Sans" }, { id: "mono", name: "Mono" }];
  /* a family, its note and a group as the reader sees them: the notes and the group names in the
     interface's language, the names of real families as they are (only the two system stacks are words) */
  function fontName(f){ return f === FONTS.sans || f === FONTS.mono ? _t(f.name) : f.name; }
  function fontNote(f){ return _t(f.note); }
  function fontGroupName(g){ return _t(g.name); }
  var BG_SWATCHES = ["#F6F1E4","#EFEFE8","#EDE7F3","#E4EFE7","#FBEDE0","#E8EFF5",
                     "#14161B","#101711","#171021","#1A1310","#0D1420","#050506"];
  var ACC_SWATCHES = ["#D8A24A","#C96A4A","#C25B78","#A97FD6","#5C9CD6","#3FA08C","#7FB069","#C9A227"];
  /* the single "Custom" theme of earlier versions; still read so a saved one carries over into `customs` */
  var CUSTOM_DEFAULT = {bg:"#101418", ink:"#e7e2d6", accent:"#e0a458", autoInk:true};

  var state = {
    theme:"day",
    custom:Object.assign({}, CUSTOM_DEFAULT),
    /* saved custom themes {id, name, bg, ink, autoInk, accent, panel?, muted?}; "c:" + id selects one */
    customs:[],
    font:"serif", size:19, lh:1.75, width:720, margin:0, justify:false, hyphens:false,
    /* weight 300–800 (clamped to the family's range), letter and word spacing in em, and the
       gap under a paragraph in em; warmth 0–100 with its own night schedule */
    weight:400, ls:0, ws:0, pgap:0.95, warmth:0, warmAuto:false,
    /* focus reading: the start of each word in bold (light / medium / strong, see Focus) */
    focus:false, focusLevel:"medium",
    /* extra dim: a black film over everything, 0–85 %, on its own or only in the night window (see Dim).
       e-ink mode: true / false once set, null while the reader has never set it; einkFlow is the
       flow to go back to when it is turned off, einkAsked that a slow screen was offered it (see Eink) */
    dim:false, dimLevel:40, dimNight:false, eink:null, einkFlow:null, einkAsked:false,
    auto:"off", autoDay:"day", autoNight:"dusk", nightFrom:"21:00", nightTo:"07:00", spread:true, wake:true, perPage:1,
    zoom:1, soften:true, plainBg:false,
    flow:"scroll", page:0, totalPages:1, pdfPageNum:1,
    mode:"empty", pdfDoc:null, fitScale:1, colw:0, gap:48, toc:null
  };
  var renderGen = 0;

  /* ---------- remembered reading settings ---------- */
  var Prefs = (function(){
    var KEY = "ll_prefs", FIELDS = ["theme", "custom", "customs", "font", "size", "lh", "width", "margin", "justify", "hyphens", "weight", "ls", "ws", "pgap", "warmth", "warmAuto", "flow", "soften", "plainBg", "auto", "autoDay", "autoNight", "nightFrom", "nightTo", "spread", "wake", "focus", "focusLevel", "dim", "dimLevel", "dimNight", "eink", "einkFlow", "einkAsked"];
    var loading = false;
    /* a number inside its range, or the default when the stored value is nonsense */
    function num(v, lo, hi, dflt){
      v = typeof v === "number" ? v : NaN;
      if (!isFinite(v)) return dflt;
      return Math.max(lo, Math.min(hi, v));
    }
    function save(){
      if (loading) return;
      var o = {};
      FIELDS.forEach(function(f){ o[f] = state[f]; });
      Store.set(KEY, JSON.stringify(o));
    }
    /* saved custom themes from storage: only well-formed entries with real colours are kept */
    function validCustoms(list){
      var out = [], seen = {};
      if (!Array.isArray(list)) return out;
      list.forEach(function(c){
        if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id || typeof c.name !== "string" || seen[c.id]) return;
        var bg = normHex(c.bg), accent = normHex(c.accent), ink = normHex(c.ink);
        if (!bg || !accent) return;
        var t = { id: c.id, name: c.name.trim().slice(0, 60) || _tc("name", "Custom"), bg: bg, ink: ink || deriveInk(bg), autoInk: c.autoInk !== false || !ink, accent: accent };
        if (normHex(c.panel)) t.panel = normHex(c.panel);
        if (normHex(c.muted)) t.muted = normHex(c.muted);
        seen[c.id] = true; out.push(t);
      });
      return out;
    }
    /* the single scratch "Custom" theme of earlier versions becomes a saved theme, once: afterwards
       the scratch colours are back at their defaults and nothing points at "custom" any more */
    function migrateCustom(){
      var c = state.custom, d = CUSTOM_DEFAULT;
      var used = state.theme === "custom" || state.autoDay === "custom" || state.autoNight === "custom" || c.autoInk !== d.autoInk ||
        ["bg", "ink", "accent"].some(function(k){ return String(c[k]).toLowerCase() !== d[k]; });
      if (!used) return;
      var bg = normHex(c.bg), accent = normHex(c.accent), ink = normHex(c.ink), theme = null;
      if (bg && accent) theme = "c:" + addCustom({ name: _t("My theme"), bg: bg, ink: ink || deriveInk(bg), autoInk: c.autoInk !== false || !ink, accent: accent }).id;
      ["theme", "autoDay", "autoNight"].forEach(function(k){ if (state[k] === "custom") state[k] = theme || (k === "autoNight" ? "dusk" : "day"); });
      state.custom = Object.assign({}, d);
    }
    function load(){
      var o = null;
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      if (!o || typeof o !== "object") return;
      loading = true;
      FIELDS.forEach(function(f){
        if (o[f] === undefined || o[f] === null) return;
        if (f === "custom"){ if (typeof o.custom === "object") state.custom = Object.assign({}, state.custom, o.custom); return; }
        if (f === "customs"){ state.customs = validCustoms(o.customs); return; }
        if (typeof state[f] === "number" && typeof o[f] !== "number") return;
        state[f] = o[f];
      });
      migrateCustom();
      if (!resolveTheme(state.theme)) state.theme = "day";
      if (!/^(off|system|time)$/.test(state.auto)) state.auto = "off";
      if (!resolveTheme(state.autoDay)) state.autoDay = "day";
      if (!resolveTheme(state.autoNight)) state.autoNight = "dusk";
      if (!/^\d\d:\d\d$/.test(state.nightFrom)) state.nightFrom = "21:00";
      if (!/^\d\d:\d\d$/.test(state.nightTo)) state.nightTo = "07:00";
      if (!Object.prototype.hasOwnProperty.call(FONTS, state.font)) state.font = "serif";
      state.size = Math.max(14, Math.min(28, state.size)); state.lh = Math.max(1.3, Math.min(2.1, state.lh));
      state.width = Math.max(320, Math.min(960, state.width)); state.margin = Math.max(0, Math.min(64, state.margin || 0));
      /* a stored number that is missing, not finite or out of range goes back to its default */
      state.weight = num(state.weight, 300, 800, 400);
      state.ls = num(state.ls, 0, 0.12, 0);
      state.ws = num(state.ws, 0, 0.4, 0);
      state.pgap = num(state.pgap, 0.4, 2, 0.95);
      state.warmth = Math.round(num(state.warmth, 0, 100, 0));
      state.warmAuto = state.warmAuto === true;
      if (state.flow !== "pages") state.flow = "scroll";
      state.focus = state.focus === true;
      if (!/^(light|medium|strong)$/.test(state.focusLevel)) state.focusLevel = "medium";
      state.dim = state.dim === true;
      state.dimLevel = Math.round(num(state.dimLevel, 0, 85, 40));
      state.dimNight = state.dimNight === true;
      state.eink = state.eink === true ? true : state.eink === false ? false : null;
      if (state.einkFlow !== "scroll" && state.einkFlow !== "pages") state.einkFlow = null;
      state.einkAsked = state.einkAsked === true;
      state.plainBg = state.plainBg === true;
      /* e-ink mode keeps the Pages flow */
      if (state.eink) state.flow = "pages";
      loading = false;
    }
    return { save: save, load: load };
  })();

  /* ---------- color helpers ---------- */
  function hexToRgb(h){
    h = h.replace("#","");
    if (h.length === 3) h = h.split("").map(function(c){return c+c;}).join("");
    var n = parseInt(h,16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  function mix(a,b,t){
    var A = hexToRgb(a), B = hexToRgb(b);
    var out = A.map(function(v,i){ return Math.round(v + (B[i]-v)*t); });
    return "#" + out.map(function(v){ return v.toString(16).padStart(2,"0"); }).join("");
  }
  function isDarkColor(hex){
    var c = hexToRgb(hex);
    return (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255 < 0.45;
  }
  function hexToHsl(hex){
    var c = hexToRgb(hex), r=c[0]/255, g=c[1]/255, b=c[2]/255;
    var mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    var h=0, s=0, l=(mx+mn)/2, d=mx-mn;
    if (d){
      s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
      if (mx===r) h = (g-b)/d + (g<b?6:0);
      else if (mx===g) h = (b-r)/d + 2;
      else h = (r-g)/d + 4;
      h *= 60;
    }
    return [Math.round(h), Math.round(s*100), Math.round(l*100)];
  }
  function hslToHex(h,s,l){
    s/=100; l/=100;
    var k = function(n){ return (n + h/30) % 12; };
    var a = s * Math.min(l, 1-l);
    var f = function(n){
      var v = l - a * Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
      return Math.round(v*255).toString(16).padStart(2,"0");
    };
    return "#" + f(0) + f(8) + f(4);
  }
  function deriveInk(bg){
    var hs = hexToHsl(bg);
    return isDarkColor(bg) ? hslToHex(hs[0], 12, 86) : hslToHex(hs[0], 22, 13);
  }
  /* WCAG contrast: relative luminance of sRGB, then (lighter + .05) / (darker + .05) */
  function luminance(hex){
    var c = hexToRgb(hex).map(function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b){
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* "#abc" or "#aabbcc", with or without the hash → "#aabbcc"; anything else → null */
  function normHex(v){
    var m = /^\s*#?([0-9a-f]{3}|[0-9a-f]{6})\s*$/i.exec(typeof v === "string" ? v : "");
    if (!m) return null;
    var h = m[1].toLowerCase();
    if (h.length === 3) h = h.split("").map(function(c){ return c + c; }).join("");
    return "#" + h;
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

  /* ---------- themes: built-ins and the saved custom ones ---------- */
  function isBuiltIn(theme){ return typeof theme === "string" && Object.prototype.hasOwnProperty.call(THEMES, theme); }
  /* the saved custom theme a "c:" + id refers to, or null */
  function customById(theme){
    if (typeof theme !== "string" || theme.slice(0, 2) !== "c:") return null;
    var id = theme.slice(2);
    for (var i = 0; i < state.customs.length; i++) if (state.customs[i].id === id) return state.customs[i];
    return null;
  }
  /* a custom theme's six colours: panel and secondary text are derived from the background and
     the text unless the user picked them; the hairline always is. Its lamp is its accent, and its
     raised surface is the panel on a light page; on a dark one, the panel 6 % towards the text
     and 3 % towards the accent (a lift in the theme's own hue), kept only while the secondary text
     still reads on it */
  function customColors(c){
    var ink = c.autoInk ? deriveInk(c.bg) : c.ink;
    var panel = c.panel || mix(c.bg, ink, 0.05);
    var t = {
      name: c.name, bg: c.bg, ink: ink, accent: c.accent, lamp: c.accent,
      panel: panel,
      line:  mix(c.bg, ink, 0.15),
      muted: c.muted || deriveMuted(ink, c.bg, panel)
    };
    t.raise = customRaise(t);
    return t;
  }
  function customRaise(t){
    /* a light page: cards and sheets a touch brighter than the panel, like the built-ins */
    var r = isDarkColor(t.bg) ? mix(mix(t.panel, t.ink, 0.06), t.accent, 0.03) : mix(t.panel, "#ffffff", 0.5);
    return contrast(t.muted, r) < 4.5 ? t.panel : r;
  }
  /* secondary text: the text mixed towards the background, but no further than still reads on it
     and on the panel (the sheet, the bars; the subtle surface lies between the two) */
  function deriveMuted(ink, bg, panel){
    for (var t = 0.42; t > 0; t -= 0.03){ var m = mix(ink, bg, t); if (contrast(m, bg) >= 4.5 && contrast(m, panel) >= 4.5) return m; }
    return ink;
  }
  function resolveTheme(theme){
    if (isBuiltIn(theme)) return THEMES[theme];
    var c = customById(theme);
    return c ? customColors(c) : null;
  }
  function currentTheme(){ return resolveTheme(state.theme) || THEMES.day; }
  function newCustomId(){ var id; do { id = Math.random().toString(36).slice(2, 8); } while (!id || customById("c:" + id)); return id; }
  function addCustom(t){ var c = Object.assign({ id: newCustomId() }, t); state.customs.push(c); return c; }
  function copyCustom(c, name){
    var t = { name: name, bg: c.bg, ink: c.ink, autoInk: c.autoInk, accent: c.accent };
    if (c.panel) t.panel = c.panel;
    if (c.muted) t.muted = c.muted;
    return addCustom(t);
  }
  /* "Custom 1", "Custom 2"… (the first free number), or `base`, `base 2`, `base 3`… */
  function customName(base){
    var names = state.customs.map(function(c){ return c.name; }), n, i;
    if (base){ n = base; i = 2; while (names.indexOf(n) >= 0) n = base + " " + (i++); return n; }
    for (i = 1; ; i++) if (names.indexOf(_t("Custom {n}", { n: i })) < 0) return _t("Custom {n}", { n: i });
  }

  /* ---------- theme + type ---------- */
  /* a theme's preview tile, the one picker drawing (the lamp's popover, its Recent row and the
     settings sheet): a small page in the theme's colours — "Aa" in its text colour, two lines of
     secondary text, the panel as a strip along the bottom with the lamp as a button on it — and
     the name under it. The one on screen is pressed: a ring and a check (tileMark). "Aa" is drawn
     by the stylesheet, so the button's text is the name alone. */
  function tileVars(t){
    return "--sw-bg:" + t.bg + ";--sw-ink:" + t.ink + ";--sw-mut:" + t.muted + ";--sw-pan:" + t.panel + ";--sw-acc:" + (t.lamp || t.accent);
  }
  function tileSwatch(t, cls){ return '<i' + (cls ? ' class="' + cls + '"' : "") + ' style="' + tileVars(t) + '" aria-hidden="true"><b></b><s></s><s></s></i>'; }
  function tileHtml(id, t){
    return '<button type="button" class="chip tile" data-theme="' + id + '" aria-pressed="false">' + tileSwatch(t) +
      '<span class="tile-n">' + escapeHtml(themeName(id)) + '</span></button>';
  }
  /* marks the tiles under `root` for the theme on screen, and brings a custom tile's colours up
     to date while it is being edited */
  function tileMark(root, t){
    var custom = customById(state.theme);
    Array.prototype.forEach.call(root.querySelectorAll(".chip[data-theme]"), function(ch){
      var on = ch.dataset.theme === state.theme;
      ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) ch.setAttribute("aria-label", _t("{name}, current theme", { name: themeName(state.theme) })); else ch.removeAttribute("aria-label");
      if (on && custom && t){ var sw = ch.querySelector("i"); if (sw) sw.setAttribute("style", tileVars(t)); }
    });
  }
  /* the picker's groups for display: the built-in groups (themeGroups), then the reader's own
     saved themes in a group of their own (Mine) */
  function pickerGroups(){
    var g = themeGroups();
    g.push({ id: "mine", name: _t("Mine"), ids: state.customs.map(function(c){ return "c:" + c.id; }) });
    return g;
  }
  /* <option>s for a day / night theme list: every group, the reader's own last */
  function themeOptions(){
    return pickerGroups().map(function(g){
      if (!g.ids.length) return "";
      return '<optgroup label="' + escapeHtml(g.name) + '">' + g.ids.map(function(k){ return '<option value="' + k + '">' + escapeHtml(themeName(k)) + '</option>'; }).join("") + '</optgroup>';
    }).join("");
  }
  function buildThemeChips(){
    var html = "";
    themeGroups().forEach(function(g){
      html += '<div class="chip-group" role="group" aria-labelledby="tg-' + g.id + '"><div class="chip-group-label" id="tg-' + g.id + '">' + g.name + '</div><div class="tiles">' +
        g.ids.map(function(k){ return tileHtml(k, THEMES[k]); }).join("") + '</div></div>';
    });
    html += '<div class="chip-group" role="group" aria-labelledby="tg-custom"><div class="chip-group-label" id="tg-custom">' + _t("Mine") + '</div><div class="tiles">' +
      state.customs.map(function(c){ return tileHtml("c:" + c.id, customColors(c)); }).join("") +
      '<button type="button" class="chip tile chip-new" data-new="1" title="' + _t("Make my own from this one") + '"><i aria-hidden="true"></i><span class="tile-n">' + _t("New theme") + '</span></button></div></div>';
    $("#themeChips").innerHTML = html;
  }
  function buildCustomUI(){
    $("#bgSwatches").innerHTML = BG_SWATCHES.map(function(c){
      return '<button class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="' + _t("Background {colour}", { colour: c }) + '" aria-pressed="false"></button>';
    }).join("");
    $("#accSwatches").innerHTML = ACC_SWATCHES.map(function(c){
      return '<button class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="' + _t("Accent {colour}", { colour: c }) + '" aria-pressed="false"></button>';
    }).join("");
  }
  /* a colour picker and its hex field show the same colour; a derived colour is shown but not editable.
     The hex field keeps what is being typed in it until it is left. */
  function setPick(key, hex, auto){
    var p = $("#c" + key), h = $("#h" + key);
    p.value = hex; p.disabled = !!auto; h.disabled = !!auto;
    if (document.activeElement !== h){ h.value = hex; h.classList.remove("bad"); h.removeAttribute("aria-invalid"); }
  }
  function markSwatches(sel, hex){
    document.querySelectorAll(sel + " .sw").forEach(function(s){
      var on = s.dataset.c.toLowerCase() === hex;
      s.classList.toggle("on", on); s.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  /* the pickers, hex fields, auto boxes and swatch marks follow the theme (the sliders are left
     alone, so dragging or stepping them is never undone by a rounding trip through hex) */
  function syncPicks(c){
    var t = customColors(c);
    setPick("Bg", c.bg);
    $("#autoInk").checked = !!c.autoInk; setPick("Ink", t.ink, c.autoInk);
    setPick("Acc", c.accent);
    $("#autoPanel").checked = !c.panel; setPick("Panel", t.panel, !c.panel);
    $("#autoMuted").checked = !c.muted; setPick("Muted", t.muted, !c.muted);
    markSwatches("#bgSwatches", c.bg); markSwatches("#accSwatches", c.accent);
  }
  /* the editor shows the saved custom theme that is selected */
  function syncCustomUI(){
    var c = customById(state.theme);
    if (!c) return;
    var hs = hexToHsl(c.bg);
    $("#cName").textContent = c.name;
    $("#cHue").value = hs[0]; $("#vHue").textContent = hs[0] + "°";
    $("#cLit").value = hs[2]; $("#vLit").textContent = hs[2] + " %";
    syncPicks(c);
  }
  /* the contrast meter: the pairs a reader meets, graded like WCAG (AA from 4.5:1, AAA from 7:1) */
  var METER = [
    { id: "ink",         what: "text",           fg: "ink",    on: "bg" },
    { id: "muted",       what: "secondary text", fg: "muted",  on: "bg" },
    { id: "mutedPanel",  what: "secondary text", fg: "muted",  on: "panel" },
    { id: "accent",      what: "accent",         fg: "accent", on: "bg" },
    { id: "accentPanel", what: "accent",         fg: "accent", on: "panel" }
  ];
  function grade(r){ return r >= 7 ? "AAA" : r >= 4.5 ? "AA" : _t("Low"); }
  /* whether white or black is the better text colour on this background */
  function lighterWins(bg){ return contrast(bg, "#ffffff") >= contrast(bg, "#000000"); }
  function syncMeter(t){
    var low = [];
    METER.forEach(function(m){
      var r = contrast(t[m.fg], t[m.on]), row = $('#cMeter [data-k="' + m.id + '"]');
      row.classList.toggle("low", r < 4.5);
      row.querySelector(".meter-bar i").style.width = Math.round(Math.min(1, Math.log(r) / Math.log(21)) * 100) + "%";
      row.querySelector(".meter-n").textContent = r.toFixed(1) + ":1";
      row.querySelector(".meter-badge").textContent = grade(r);
      if (r < 4.5) low.push(m);
    });
    $("#cMeterSum").textContent = meterSummary(low, t);
    $("#cFix").hidden = !low.length;
  }
  function meterSummary(low, t){
    if (!low.length) return METER.every(function(m){ return contrast(t[m.fg], t[m.on]) >= 7; }) ? _t("All text is comfortably readable.") : _t("All text is readable.");
    var names = [], dir = lighterWins(t.bg) ? "lighter" : "darker";
    low.forEach(function(m){ if (names.indexOf(m.what) < 0) names.push(m.what); });
    /* the sentence is whole in the table; the words that fill it are too ("lighter text", "a darker accent" …) */
    var words = names.map(function(w){ return _t(w); });
    var list = words.length > 1 ? _t("{list} and {last}", { list: words.slice(0, -1).join(", "), last: words[words.length - 1] }) : words[0];
    var where = low.every(function(m){ return m.on === "panel"; }) ? _t("the panel") : _t("this background");
    var fix = _t(names.length > 1 ? dir + " colours" : (names[0] === "accent" ? "a " + dir + " accent" : dir + " " + names[0]));
    var v = { what: list.charAt(0).toUpperCase() + list.slice(1), where: where, fix: fix };
    return names.length > 1 ? _t("{what} are hard to read on {where} — try {fix}.", v) : _t("{what} is hard to read on {where} — try {fix}.", v);
  }
  /* move a colour's lightness away from the background, hue and saturation kept, until it reads
     on every surface it sits on; when no lightness manages that (a mid-grey background), the
     one that comes closest is used */
  function fixColor(hex, surfaces){
    var worst = function(h){ return Math.min.apply(null, surfaces.map(function(s){ return contrast(h, s); })); };
    if (worst(hex) >= 4.5) return hex;
    var hs = hexToHsl(hex), best = hex, bestScore = worst(hex);
    var dirs = lighterWins(surfaces[0]) ? [1, -1] : [-1, 1];
    for (var d = 0; d < dirs.length; d++){
      var step = dirs[d], l = hs[2];
      while (l + step >= 0 && l + step <= 100){
        l += step;
        var out = hslToHex(hs[0], hs[1], l), score = worst(out);
        if (score >= 4.5) return out;
        if (score > bestScore){ best = out; bestScore = score; }
      }
    }
    return best;
  }
  /* Fix contrast: only the colours the meter marks low change, and only in lightness. A derived
     colour that is fixed becomes a picked one (the derived value was the problem). */
  function fixContrast(){
    var c = customById(state.theme);
    if (!c) return;
    var t = customColors(c);
    if (contrast(t.ink, t.bg) < 4.5){ c.ink = fixColor(t.ink, [t.bg]); c.autoInk = false; t = customColors(c); }
    if (contrast(t.muted, t.bg) < 4.5 || contrast(t.muted, t.panel) < 4.5){ c.muted = fixColor(t.muted, [t.bg, t.panel]); t = customColors(c); }
    if (contrast(t.accent, t.bg) < 4.5 || contrast(t.accent, t.panel) < 4.5) c.accent = fixColor(t.accent, [t.bg, t.panel]);
    syncCustomUI(); applyTheme();
  }
  /* e-ink mode's colours, whatever the theme: pure black on pure white (body.eink in app.css
     holds the same values for everything drawn inside the page) */
  var EINK_COLORS = { bg: "#FFFFFF", ink: "#000000", muted: "#000000", panel: "#FFFFFF", line: "#000000", accent: "#000000" };
  /* the maker's draft, shown on every screen while it is open (Maker); null otherwise */
  var themeDraft = null;
  function applyTheme(){
    var t = themeDraft || currentTheme(), custom = themeDraft ? null : customById(state.theme);
    /* e-ink mode is black on white whatever the theme: light controls, no softened PDF pages, a
       white title bar; the theme itself stays chosen for when the mode is turned off */
    var eink = state.eink === true, dark = isDarkColor(t.bg) && !eink, c = eink ? EINK_COLORS : t;
    var root = document.documentElement, r = root.style;
    r.setProperty("--bg", c.bg);      r.setProperty("--ink", c.ink);
    r.setProperty("--muted", c.muted);r.setProperty("--panel", c.panel);
    r.setProperty("--line", c.line);  r.setProperty("--accent", c.accent);
    /* the design tokens app.css builds on: the lamp (a custom theme's accent), the raised surface
       of cards and sheets (the table's, or customRaise's), and the tone that picks the elevation
       style — shadows on a light page, lifted surfaces on a dark one, borders only in the two
       high-contrast themes (e-ink is "light"; body.eink's own rules win) */
    var tone = eink ? "light" : HICON.indexOf(state.theme) >= 0 && !themeDraft ? "contrast" : dark ? "dark" : "light";
    r.setProperty("--lamp", eink ? "#000000" : (t.lamp || t.accent));
    r.setProperty("--raise", eink ? c.panel : (t.raise || c.panel));
    root.setAttribute("data-tone", tone);
    /* a textured theme's faint paper or cloth behind the text (app.css); none in e-ink mode, in the
       high-contrast themes or with Plain background */
    if (t.texture && !eink && tone !== "contrast" && !state.plainBg) root.setAttribute("data-texture", t.texture); else root.removeAttribute("data-texture");
    root.style.colorScheme = dark ? "dark" : "light";
    document.body.classList.toggle("soften", state.soften && dark);
    /* the installed app's title bar takes the panel colour */
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", c.panel);
    tileMark($("#themeChips"), themeDraft ? null : t);
    $("#customRow").classList.toggle("show", !!custom);
    if (custom) previewCustom(t);
    if (themeDraft) return;
    /* the evening tint blends differently on a light and a dark page, and its ceiling depends
       on how much contrast this theme has to spare */
    if (Warmth) Warmth.apply();
    if (Pop) Pop.sync();
    Prefs.save();
  }
  /* the preview and the meter show every colour of the theme being edited */
  function previewCustom(t){
    var pv = $("#cPrev"), strip = $("#cPrevPanel");
    pv.style.background = t.bg; pv.style.color = t.ink; pv.style.borderColor = t.line;
    strip.style.background = t.panel; strip.style.borderColor = t.line; strip.style.color = t.muted;
    $("#cPrevPanelAcc").style.color = t.accent;
    $("#cPrevAcc").style.color = t.accent;
    $("#cPrevMuted").style.color = t.muted;
    syncMeter(t);
  }
  /* ---------- automatic theme: system setting or a night schedule ---------- */
  var AutoTheme = (function(){
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null, timer = null;
    function minutes(t){ var m = /^(\d\d):(\d\d)$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
    /* inside the night window (Night from … until), whatever Auto is set to: By time switches
       themes on it, and Extra dim's "Only at night" keeps to it */
    function inWindow(){
      var d = new Date(), now = d.getHours() * 60 + d.getMinutes(), a = minutes(state.nightFrom), b = minutes(state.nightTo);
      return a <= b ? (now >= a && now < b) : (now >= a || now < b);
    }
    function isNight(){
      if (state.auto === "system") return !!(mq && mq.matches);
      if (state.auto === "time") return inWindow();
      return null;
    }
    function wanted(){ var n = isNight(); return n === null ? null : (n ? state.autoNight : state.autoDay); }
    /* fade: a switch while the page is in view (the hour came round, the phone went dark)
       cross-fades; at start-up it is simply there */
    function apply(fade){
      var t = wanted();
      if (t && t !== state.theme && resolveTheme(t)){
        if (fade === true) crossFade(function(){ state.theme = t; applyTheme(); syncUI(); });
        else { state.theme = t; applyTheme(); }
      }
      syncUI();
      arm();
      if (Dim) Dim.apply();   /* the night window may have moved, or been crossed */
    }
    /* On a schedule: a timer for the next boundary, so the switch comes on the minute even
       while reading (the half-minute check below stays as a backstop) */
    var boundary = null;
    function arm(){
      clearTimeout(boundary); boundary = null;
      if (state.auto !== "time") return;
      var d = new Date(), now = d.getHours() * 60 + d.getMinutes(), best = 1440;
      [minutes(state.nightFrom), minutes(state.nightTo)].forEach(function(m){ var w = (m - now + 1440) % 1440 || 1440; if (w < best) best = w; });
      boundary = setTimeout(function(){ apply(true); }, Math.max(1000, best * 60000 - d.getSeconds() * 1000 - d.getMilliseconds() + 500));
    }
    /* one line on what happens now: "Now: Dusk until 07:00" */
    function nowLine(){
      var name = themeName(state.theme) || currentTheme().name;
      if (state.auto === "time") return _t("Now: {name} until {time}", { name: name, time: inWindow() ? state.nightTo : state.nightFrom });
      if (state.auto === "system") return mq && mq.matches ? _t("Now: {name}, while your phone is set to dark", { name: name }) : _t("Now: {name}, while your phone is set to light", { name: name });
      return _t("Now: {name}, day and night", { name: name });
    }
    function syncUI(){
      document.querySelectorAll("#autoChips .chip").forEach(function(ch){
        var on = ch.dataset.auto === state.auto; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
      });
      $("#autoRow").style.display = state.auto === "off" ? "none" : "block";
      $("#autoTimes").style.display = state.auto === "time" ? "flex" : "none";
      var opts = themeOptions();
      ["#autoDay", "#autoNight", "#qDaySel", "#qNightSel"].forEach(function(sel){ var el = $(sel); if (el && el.getAttribute("data-opts") !== opts){ el.innerHTML = opts; el.setAttribute("data-opts", opts); } });
      $("#autoDay").value = state.autoDay; $("#autoNight").value = state.autoNight;
      $("#qDaySel").value = state.autoDay; $("#qNightSel").value = state.autoNight;
      $("#nightFrom").value = state.nightFrom; $("#nightTo").value = state.nightTo;
      $("#autoHint").textContent = nowLine();
      $("#qNow").textContent = nowLine();
    }
    /* the user picked a theme by hand: keep auto on, but remember it for the current period */
    function userPicked(theme){
      var n = isNight();
      if (n === null) return;
      if (n) state.autoNight = theme; else state.autoDay = theme;
      syncUI(); Prefs.save();
    }
    function fadeApply(){ apply(true); }
    if (mq){ (mq.addEventListener ? mq.addEventListener("change", fadeApply) : mq.addListener(fadeApply)); }
    timer = setInterval(function(){ if (state.auto === "time") apply(true); }, 30000);
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") apply(); });
    /* Off, Follow phone or On a schedule: turning it on asks again, once, when a theme is then picked by hand */
    function setMode(a){
      if (!/^(off|system|time)$/.test(a)) return;
      if (a !== "off" && a !== state.auto) Store.set("ll_auto_asked", "0");
      state.auto = a; Prefs.save(); apply(true);
      if (Pop) Pop.sync();
    }
    function setPair(which, k){
      if (!resolveTheme(k)) return;
      if (which === "day") state.autoDay = k; else state.autoNight = k;
      Prefs.save(); apply(true);
      if (Pop) Pop.sync();
    }
    $("#autoChips").addEventListener("click", function(e){
      var ch = e.target.closest(".chip"); if (!ch) return;
      setMode(ch.dataset.auto);
    });
    $("#autoDay").addEventListener("change", function(e){ setPair("day", e.target.value); });
    $("#autoNight").addEventListener("change", function(e){ setPair("night", e.target.value); });
    $("#nightFrom").addEventListener("change", function(e){ state.nightFrom = e.target.value || "21:00"; Prefs.save(); apply(); });
    $("#nightTo").addEventListener("change", function(e){ state.nightTo = e.target.value || "07:00"; Prefs.save(); apply(); });
    return { apply: apply, userPicked: userPicked, isNight: isNight, inWindow: inWindow, syncUI: syncUI, nowLine: nowLine, setMode: setMode, setPair: setPair };
  })();

  /* ---------- warmth: a warm film over the screen for the evening ----------
     `#warmth` is a fixed sheet of amber above everything. On a light page it multiplies (the
     page darkens towards amber, the way a lamp shade would); on a dark page it screens at a
     much lower strength (a dark page multiplied by amber only turns muddy). Warmth is a
     percentage of the theme's ceiling, and that ceiling is whatever the theme can give up
     without any of its text — ink and secondary text, on the page and on the panel — falling
     under 4.5:1 once the film is over it. Roomy themes reach the full 35 % (12 % dark); tight
     ones (Sepia, Rose, Ink) stop earlier. */
  var Warmth = (function(){
    var el = $("#warmth"), MAX_LIGHT = 0.35, MAX_DARK = 0.12, WARM = [255, 150, 50];
    var PAIRS = [["ink", "bg"], ["ink", "panel"], ["muted", "bg"], ["muted", "panel"]];
    var caps = {}, timer = null;
    function hex2(v){ return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"); }
    /* one colour as it looks through the film */
    function through(color, screen, a){
      var c = hexToRgb(color);
      return "#" + c.map(function(v, i){
        var s = WARM[i], b = screen ? 255 - (255 - s) * (255 - v) / 255 : s * v / 255;
        return hex2(v + (b - v) * a);
      }).join("");
    }
    function lowest(t, screen, a){
      var lo = 99;
      PAIRS.forEach(function(p){
        var r = contrast(through(t[p[0]], screen, a), through(t[p[1]], screen, a));
        if (r < lo) lo = r;
      });
      return lo;
    }
    /* the strongest film this theme can wear, in 0.5 % steps down from the ceiling */
    function cap(t){
      var key = t.bg + t.ink + t.muted + t.panel;
      if (caps[key] !== undefined) return caps[key];
      var screen = isDarkColor(t.bg), top = screen ? MAX_DARK : MAX_LIGHT, a = top;
      while (a > 0.0001 && lowest(t, screen, a) < 4.5) a -= 0.005;
      caps[key] = a = Math.max(0, Math.round(a * 1000) / 1000);
      return a;
    }
    /* the night window: the one Auto is using, or 21:00–07:00 when Auto is off */
    function isNight(){
      var n = AutoTheme.isNight();
      if (n !== null) return n;
      var d = new Date(), now = d.getHours() * 60 + d.getMinutes();
      return now >= 21 * 60 || now < 7 * 60;
    }
    /* what the film is showing right now: nothing by day when it is set to warm at night only */
    function level(){ return state.warmAuto && !isNight() ? 0 : Math.max(0, Math.min(100, state.warmth || 0)); }
    function opacity(){ return level() / 100 * cap(currentTheme()); }
    function apply(){
      var t = currentTheme();
      document.body.classList.toggle("warm-dark", isDarkColor(t.bg));
      el.style.opacity = String(opacity());
      syncUI();
    }
    function syncUI(){
      $("#rWarm").value = state.warmth; $("#qWarm").value = state.warmth;
      $("#vWarm").textContent = state.warmth + " %"; $("#qWarmV").textContent = state.warmth + " %";
      $("#cWarmAuto").checked = !!state.warmAuto; $("#qWarmAuto").checked = !!state.warmAuto;
      /* "Warm at night" by day: the film is off, so the slider steps back (it still sets the night's level) */
      var idle = !!state.warmAuto && !isNight();
      $("#warmRow").classList.toggle("is-idle", idle);
      var qRow = $("#qWarm").closest(".prow"); if (qRow) qRow.classList.toggle("is-idle", idle);
      $("#warmHint").textContent = !state.warmAuto ? _t("A warm film over the screen for evening reading. At 0\u00A0% nothing is added.")
        : isNight() ? _t("It\u2019s night now \u2014 the warm film is on.") : _t("Off until the night window; it comes back on then.");
    }
    function set(v){ state.warmth = Math.max(0, Math.min(100, Math.round(v))); Prefs.save(); apply(); }
    function setAuto(v){ state.warmAuto = !!v; Prefs.save(); apply(); }
    $("#rWarm").addEventListener("input", function(e){ set(+e.target.value); });
    $("#qWarm").addEventListener("input", function(e){ set(+e.target.value); });
    $("#cWarmAuto").addEventListener("change", function(e){ setAuto(e.target.checked); });
    $("#qWarmAuto").addEventListener("change", function(e){ setAuto(e.target.checked); });
    /* the night window is checked every minute, and again whenever the page comes back */
    timer = setInterval(function(){ if (state.warmAuto) apply(); }, 60000);
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible" && state.warmAuto) apply(); });
    return { apply: apply, cap: cap, level: level, opacity: opacity, isNight: isNight, set: set, setAuto: setAuto, through: through };
  })();

  /* ---------- extra dim: a black film over everything, for reading in bed ----------
     `#dim` is a fixed sheet of black above every other layer — the bars, the drawers, the
     popovers, the toasts, the read-aloud bar and the warm film — that lets every tap through.
     The reader sets how dark, 0–85 %, which takes the screen below its own lowest brightness.
     "Only at night" keeps it to the night window (Night from … until, the hours Auto → By time
     uses). It fades over 300 ms (at once with reduced motion) and e-ink mode leaves it out (app.css). */
  var Dim = (function(){
    var el = $("#dim"), MAX = 85;
    function isNight(){ return AutoTheme.inWindow(); }
    /* how dark it is right now: nothing while off, or by day when it is set to night only */
    function level(){ return !state.dim || (state.dimNight && !isNight()) ? 0 : Math.max(0, Math.min(MAX, state.dimLevel)); }
    function apply(){
      el.style.opacity = String(level() / 100);
      syncUI();
    }
    /* the sheet's controls and the theme popover's are the same three twice */
    function syncUI(){
      $("#cDim").checked = !!state.dim; $("#qDim").checked = !!state.dim;
      $("#cDimNight").checked = !!state.dimNight; $("#qDimNight").checked = !!state.dimNight;
      $("#rDim").value = state.dimLevel; $("#qDimLevel").value = state.dimLevel;
      $("#vDim").textContent = state.dimLevel + " %"; $("#qDimV").textContent = state.dimLevel + " %";
      /* the rows that follow the switch — the level, "Only at night" and its hours — step back and
         leave the Tab order while it is off (app.css .dim-row) */
      ["#dimLevelRow", "#qDimLevelRow", "#dimNightRow", "#qDimNightRow", "#dimTimes"].forEach(function(sel){
        var row = $(sel); if (!row) return;
        row.classList.toggle("dim-row", !state.dim); row.inert = !state.dim;
      });
      var h = $("#dimNightHint"), q = $("#qDimHint"), byTime = state.auto === "time", eink = state.eink === true;
      var hours = state.nightFrom + "\u2013" + state.nightTo, now = isNight() ? _t("It\u2019s night now.") : _t("Off until {time}.", { time: state.nightFrom });
      /* e-ink mode leaves the film out (app.css): said here, so a switch that is on but does nothing is not a mystery */
      $("#dimHint").textContent = eink ? _t("Darker than your phone's lowest brightness, for reading in bed. Not used in E-ink mode.")
                                       : _t("Darker than your phone's lowest brightness, for reading in bed.");
      h.hidden = !state.dimNight || eink;
      h.textContent = byTime ? _t("Night is {hours} (the hours of Auto \u203a By time). {now}", { hours: hours, now: now })
                             : _t("Night is {hours}. {now}", { hours: hours, now: now });
      /* the hours can be set right here (the same ones By time uses), unless By time's own fields are showing above */
      $("#dimTimes").hidden = !state.dimNight || byTime || eink;
      $("#dimFrom").value = state.nightFrom; $("#dimTo").value = state.nightTo;
      q.hidden = !(eink && state.dim) && !state.dimNight;
      q.textContent = eink ? _t("Not used in E-ink mode.") : _t("Night: {hours} \u00b7 Settings \u203a Theme sets the hours.", { hours: hours });
    }
    function set(v){ state.dimLevel = Math.max(0, Math.min(MAX, Math.round(v))); Prefs.save(); apply(); }
    function setOn(v){ state.dim = !!v; Prefs.save(); apply(); }
    function setNight(v){ state.dimNight = !!v; Prefs.save(); apply(); }
    $("#cDim").addEventListener("change", function(e){ setOn(e.target.checked); });
    $("#qDim").addEventListener("change", function(e){ setOn(e.target.checked); });
    $("#rDim").addEventListener("input", function(e){ set(+e.target.value); });
    $("#qDimLevel").addEventListener("input", function(e){ set(+e.target.value); });
    $("#cDimNight").addEventListener("change", function(e){ setNight(e.target.checked); });
    $("#qDimNight").addEventListener("change", function(e){ setNight(e.target.checked); });
    /* the same hours as Auto's Night from … until */
    $("#dimFrom").addEventListener("change", function(e){ state.nightFrom = e.target.value || "21:00"; Prefs.save(); AutoTheme.apply(); });
    $("#dimTo").addEventListener("change", function(e){ state.nightTo = e.target.value || "07:00"; Prefs.save(); AutoTheme.apply(); });
    /* the night window is checked every minute, and again whenever the page comes back */
    setInterval(function(){ if (state.dim && state.dimNight) apply(); }, 60000);
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible" && state.dim && state.dimNight) apply(); });
    return { apply: apply, syncUI: syncUI, level: level, isNight: isNight, set: set, setOn: setOn, setNight: setNight };
  })();

  /* ---------- e-ink mode: black on white, nothing that moves, whole-page turns ----------
     body.eink (app.css) puts pure black text on pure white whatever the theme, turns every tint,
     grey, shadow, gradient and see-through layer black or white, stops every transition,
     animation and smooth scroll, and draws highlights, notes, search hits and the sentence read
     aloud as lines instead of fills (e-paper smears tints and ghosts on motion). Images and PDF
     pages stay as they are. The mode keeps the Pages flow — the reader's own flow comes back when
     it is turned off — turns whole pages without a slide (a tap on the left third goes back,
     anywhere else forward; the page keys the same) and leaves out the extra dim film. A screen
     that says it redraws slowly (update: slow) is offered the mode once, if it was never set. */
  var Eink = (function(){
    var offerEl = null;
    function on(){ return state.eink === true; }
    function apply(){
      document.body.classList.toggle("eink", on());
      syncUI();
      Dim.syncUI();     /* its controls say that the film is left out */
    }
    function syncUI(){
      $("#cEink").checked = on(); $("#qEink").checked = on();
      /* the mode keeps the Pages flow, so Scroll is not on offer while it is on */
      Array.prototype.forEach.call(document.querySelectorAll('#flowChips .chip[data-flow="scroll"], #qFlow .chip[data-flow="scroll"]'), function(ch){
        ch.disabled = on();
        if (on()) ch.title = _t("E-ink mode keeps the Pages flow"); else ch.removeAttribute("title");
      });
    }
    function set(v){
      v = !!v;
      var was = on();
      state.eink = v;   /* set now, even to off: a slow screen is never asked again */
      if (v !== was){
        if (v){
          state.einkFlow = state.flow;
          /* the middle of the page turns it now, so the bars must not be left hidden */
          document.body.classList.remove("immersive");
        }
        apply(); applyTheme();
        var back = state.einkFlow;
        if (!v) state.einkFlow = null;
        var f = v ? "pages" : (back === "scroll" ? "scroll" : state.flow);
        /* the stroke widths and the bars change the room for the text: a new flow lays it out,
           an unchanged one is laid out again */
        if (f !== state.flow) setFlow(f);
        else if (pagedActive()) relayoutPaged();
      } else apply();
      Prefs.save();
      dismiss();
    }
    /* the one-time offer on a slow-refreshing screen: a toast with a button, until it is answered */
    function offer(){
      if (offerEl || state.eink !== null || state.einkAsked) return;
      state.einkAsked = true; Prefs.save();
      offerEl = document.createElement("div");
      offerEl.id = "einkToast"; offerEl.setAttribute("role", "status");
      document.body.appendChild(offerEl);
      offerEl.innerHTML = '<span>' + _t("Looks like an e-ink screen \u2014 use E-ink mode?") + '</span><button type="button" id="einkYes">' + _t("Turn on") + '</button><button type="button" id="einkNo" aria-label="' + _t("No thanks") + '" title="' + _t("No thanks") + '">' + ICONS.close + '</button>';
      offerEl.querySelector("#einkYes").addEventListener("click", function(){ set(true); Marks.toast(_t("E-ink mode is on \u2014 Settings \u203a Reading turns it off")); });
      offerEl.querySelector("#einkNo").addEventListener("click", dismiss);
    }
    function dismiss(){ if (offerEl){ offerEl.remove(); offerEl = null; } }
    function slowScreen(){ return !!(window.matchMedia && window.matchMedia("(update: slow)").matches); }
    function boot(){
      apply();
      if (state.eink === null && !state.einkAsked && slowScreen()) setTimeout(offer, 600);
    }
    $("#cEink").addEventListener("change", function(e){ set(e.target.checked); });
    $("#qEink").addEventListener("change", function(e){ set(e.target.checked); });
    return { on: on, set: set, apply: apply, boot: boot, offer: offer, dismiss: dismiss };
  })();
  /* ---------- keep the screen on while a document is open ---------- */
  var Wake = (function(){
    var lock = null, wanted = false, held = false;
    /* held: something plays on its own (speed reading) and keeps the screen on whatever the setting, as a video would */
    function want(){ return held || (wanted && state.wake); }
    function request(){
      if (!want() || !("wakeLock" in navigator) || document.visibilityState !== "visible" || lock) return;
      navigator.wakeLock.request("screen").then(function(l){
        if (!want()){ l.release().catch(function(){}); return; }
        lock = l; l.addEventListener("release", function(){ if (lock === l) lock = null; });
      }).catch(function(){});
    }
    function release(){ if (lock){ var l = lock; lock = null; l.release().catch(function(){}); } }
    function sync(){ if (want()) request(); else release(); }
    function set(v){ wanted = v; sync(); }
    function hold(v){ held = !!v; sync(); }
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") request(); });
    $("#cWake").addEventListener("change", function(e){ state.wake = e.target.checked; Prefs.save(); sync(); });
    return { set: set, hold: hold, active: function(){ return !!lock; } };
  })();

  /* ---------- text weight: what the chosen family can actually do ----------
     The slider never leaves 300–800, and never leaves the family's own range either. A family
     with only two static weights (400 and 700) gets a two-step slider and says so; a variable
     file gives every weight in its span, even a narrow one like Lora's 400–700. */
  var WEIGHT_MIN = 300, WEIGHT_MAX = 800;
  /* a bundled variable file carries a weight span ("400 700"); a pair of static files and a
     system stack carry single weights, so those families really do have only two */
  function isVariable(font){
    if (!font || !font.files) return false;
    for (var i = 0; i < font.files.length; i++) if (/\s/.test(String(font.files[i].weight))) return true;
    return false;
  }
  function weightRange(font){
    var rg = (font && font.range) || [400, 700];
    var two = !isVariable(font);
    return { min: Math.max(WEIGHT_MIN, rg[0]), max: Math.min(WEIGHT_MAX, rg[1]), two: two, step: two ? 300 : 50 };
  }
  /* the chosen weight as this family can render it: inside its range, and on a two-weight
     family one of the two (600 and up reads as bold) */
  function weightFor(font){
    var rg = weightRange(font), w = state.weight;
    if (typeof w !== "number" || !isFinite(w)) w = 400;
    if (rg.two) return w >= 550 ? 700 : 400;
    return Math.max(rg.min, Math.min(rg.max, Math.round(w / 50) * 50));
  }
  /* spacings are set in em, so they follow the text size; the row shows them that way */
  function emVal(v){ return dec(v, 2) + " em"; }
  /* a number with `d` decimals, with the decimal comma in Dutch (1,75) */
  function dec(v, d){ var s = v.toFixed(d); return I18N.lang() === "nl" ? s.replace(".", ",") : s; }
  /* one Weight row (the sheet's and the popover's are the same control twice) */
  function setWeightRow(row, input, val, rg){
    input.min = rg.min; input.max = rg.max; input.step = rg.step;
    input.value = state.weight;
    val.textContent = String(state.weight);
    row.classList.toggle("two-weights", rg.two);
  }
  /* for tests (not a public API): the typography controls and the evening tint */
  window.llType = {
    apply: function(){ applyType(); },
    reset: function(){ resetType(); },
    range: function(id){ return weightRange(FONTS[id] || FONTS.serif); },
    weight: function(){ return state.weight; },
    warmth: Warmth
  };

  /* focus reading's switch and strength (the sheet's Text group; the popover has the switch) */
  function syncFocusUI(){
    $("#cFocus").checked = !!state.focus;
    $("#qFocus").checked = !!state.focus;
    $("#focusRow").classList.toggle("dim-row", !state.focus);
    Array.prototype.forEach.call(document.querySelectorAll("#focusChips .chip"), function(ch){
      var on = ch.dataset.focus === state.focusLevel; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function applyType(){
    var r = document.documentElement.style, font = FONTS[state.font] || FONTS.serif;
    var rg = weightRange(font);
    state.weight = weightFor(font);
    r.setProperty("--fsN", String(state.size));
    r.setProperty("--lh", String(state.lh));
    r.setProperty("--w", state.width + "px");
    r.setProperty("--fw", String(state.weight));
    /* headings stay at 700 until the text itself is half-bold, then keep a step ahead of it */
    r.setProperty("--fwh", String(state.weight >= 600 ? Math.min(900, state.weight + 100) : 700));
    r.setProperty("--fwb", String(Math.min(900, Math.max(700, state.weight + 200))));
    r.setProperty("--ls", (state.ls || 0) + "em");
    r.setProperty("--ws", (state.ws || 0) + "em");
    r.setProperty("--pgap", (state.pgap || 0.95) + "em");
    /* the stack goes in at once (its system fallback shows first); a bundled family is fetched
       on first use and swaps in when it lands, and the loadingdone listener re-lays-out Pages flow */
    r.setProperty("--reader-font", font.stack);
    r.setProperty("--margin", (state.margin || 0) + "px");
    Fonts.use(state.font);
    Fonts.syncUI();
    $("#doc").classList.toggle("justify", !!state.justify);
    $("#doc").classList.toggle("hyphens", !!state.hyphens);
    $("#cJustify").checked = !!state.justify;
    $("#cHyphens").checked = !!state.hyphens;
    syncFocusUI();
    if (Focus) Focus.sync();
    $("#rSize").value = state.size; $("#rLh").value = state.lh; $("#rW").value = state.width; $("#rM").value = state.margin || 0;
    $("#vSize").textContent = state.size + " px";
    $("#vLh").textContent   = dec(state.lh, 2);
    $("#vW").textContent    = state.width + " px";
    $("#vM").textContent    = (state.margin || 0) + " px";
    $("#rLs").value = state.ls || 0; $("#vLs").textContent = emVal(state.ls || 0);
    $("#rWs").value = state.ws || 0; $("#vWs").textContent = emVal(state.ws || 0);
    $("#rPgap").value = state.pgap || 0.95; $("#vPgap").textContent = emVal(state.pgap || 0.95);
    setWeightRow($("#weightRow"), $("#rWeight"), $("#vWeight"), rg);
    $("#weightNote").hidden = !rg.two;
    if (Pop) Pop.sync();
    if (state.mode === "doc" && state.flow === "pages") relayoutDocPages();
    Prefs.save();
  }

  /* ---------- fonts: bundled families load on demand, plus the browse panel ---------- */
  var Fonts = (function(){
    var SYSTEM = { easy: "sans", serif: "serif", sans: "sans", mono: "mono" };   /* the stack each group falls back to */
    var faces = {};        /* file url → promise of its face, once requested */
    var failed = {};       /* font id → true while its last fetch failed (cleared once a later one lands) */
    var listEl = null, watcher = null;
    function ids(group){ return Object.keys(FONTS).filter(function(id){ return FONTS[id].group === group; }); }
    function familyOf(f){ return f.family || f.name; }

    /* one face. The FontFace API says when it has landed or failed; without it an @font-face
       rule does the same job, though it can't report a failure */
    function addFace(family, file){
      if (faces[file.url]) return faces[file.url];
      var p;
      if (window.FontFace && document.fonts && document.fonts.add){
        var face = new FontFace(family, "url(" + file.url + ")", { weight: file.weight, style: file.style, display: "swap" });
        document.fonts.add(face);
        p = face.load().then(function(){ return face; }, function(err){ document.fonts.delete(face); delete faces[file.url]; throw err; });
      } else {
        var st = $("#fontFaces");
        if (!st){ st = document.createElement("style"); st.id = "fontFaces"; document.head.appendChild(st); }
        st.appendChild(document.createTextNode("@font-face{font-family:'" + family + "'; src:url('" + file.url + "') format('woff2'); font-weight:" + file.weight + "; font-style:" + file.style + "; font-display:swap;}"));
        p = Promise.resolve(null);
      }
      faces[file.url] = p;
      return p;
    }
    /* a whole family, or just its regular face for a preview. Only the regular face is
       essential: a bold or italic that fails to arrive is synthesised by the browser */
    function load(id, previewOnly){
      var f = FONTS[id];
      if (!f || !f.files) return Promise.resolve([]);
      var files = previewOnly ? f.files.slice(0, 1) : f.files;
      return Promise.all(files.map(function(file, i){
        var p = addFace(familyOf(f), file);
        return i ? p.catch(function(){ return null; }) : p;
      }));
    }
    function fallback(f){ document.documentElement.style.setProperty("--reader-font", STACKS[SYSTEM[f.group]]); }
    /* the chosen family: fetched the first time it is used. If that fails (first use while
       offline — the service worker normally holds every file) the group's system face is read
       in instead; every later use tries the family again, as does coming back online, and its
       own stack goes back in once it lands. Only the first failure says so */
    function use(id){
      var f = FONTS[id];
      if (!f || !f.files) return;
      var again = !!failed[id];           /* failed before: read the system face meanwhile, but try once more */
      if (again) fallback(f);
      load(id).then(function(){
        delete failed[id];
        if (state.font === id) document.documentElement.style.setProperty("--reader-font", f.stack);
      }, function(){
        failed[id] = true;
        if (state.font !== id) return;
        fallback(f);
        if (!again) Marks.toast(navigator.onLine ? _t("Couldn’t load this font") : _t("Font not available offline"));
      });
    }
    window.addEventListener("online", function(){ if (FONTS[state.font] && failed[state.font]) use(state.font); });
    /* true once a bundled family's regular face is in and ready */
    function loaded(id){
      var f = FONTS[id], ok = false;
      if (!f || !f.files || !document.fonts) return false;
      document.fonts.forEach(function(face){ if (face.status === "loaded" && face.family.replace(/^["']|["']$/g, "") === familyOf(f)) ok = true; });
      return ok;
    }

    /* the grouped select in the sheet */
    var sel = $("#fontSel");
    FONT_GROUPS.forEach(function(g){
      var og = document.createElement("optgroup"); og.label = fontGroupName(g);
      ids(g.id).forEach(function(id){ var o = document.createElement("option"); o.value = id; o.textContent = fontName(FONTS[id]); og.appendChild(o); });
      sel.appendChild(og);
    });
    function syncUI(){
      var f = FONTS[state.font] || FONTS.serif;
      sel.value = state.font;
      sel.title = fontName(f) + " — " + fontNote(f);
      if (listEl) Array.prototype.forEach.call(listEl.querySelectorAll(".font-item"), function(b){ b.setAttribute("aria-pressed", b.dataset.font === state.font ? "true" : "false"); });
    }

    /* the browse panel: every family by group, each name set in the face itself */
    function item(id){
      var f = FONTS[id];
      return '<button class="font-item" data-font="' + id + '" aria-pressed="' + (id === state.font) + '">' +
        '<span class="font-name" style="font-family:' + f.stack.replace(/"/g, "&quot;") + '">' + fontName(f) + '</span>' +
        '<span class="font-note">' + fontNote(f) + '</span></button>';
    }
    function render(body){
      var h = '<div class="font-list">';
      FONT_GROUPS.forEach(function(g){
        h += '<div class="font-set" role="group" aria-labelledby="fontGroup-' + g.id + '"><div class="font-group sec" id="fontGroup-' + g.id + '">' + fontGroupName(g) + '</div>';
        ids(g.id).forEach(function(id){ h += item(id); });
        h += '</div>';
      });
      body.innerHTML = h + '</div>';
      listEl = body.firstChild;
      listEl.addEventListener("click", function(e){
        var b = e.target.closest(".font-item");
        if (!b) return;
        state.font = b.dataset.font;
        applyType();
      });
      /* a bundled family's preview is fetched only once its row comes into view, so opening
         the panel doesn't pull every font at once. Adding a face re-lays-out the whole document,
         though, so a long book, or one in Pages flow, gets every regular face in one go and
         pays once rather than once per scroll step (the files come from the worker's precache) */
      var rows = Array.prototype.filter.call(listEl.querySelectorAll(".font-item"), function(b){ return !!FONTS[b.dataset.font].files; });
      var eager = !window.IntersectionObserver || (state.mode === "doc" && (state.flow === "pages" || $("#doc").textContent.length > 150000));
      if (eager) rows.forEach(function(b){ load(b.dataset.font, true).catch(function(){}); });
      else {
        watcher = new IntersectionObserver(function(entries){
          entries.forEach(function(en){
            if (!en.isIntersecting) return;
            watcher.unobserve(en.target);
            load(en.target.dataset.font, true).catch(function(){});
          });
        }, { root: body, rootMargin: "80px 0px" });
        rows.forEach(function(b){ watcher.observe(b); });
      }
    }
    function closed(){ if (watcher) watcher.disconnect(); watcher = null; listEl = null; }
    function openPanel(){ Side.open("fonts", _t("Fonts"), render, closed); }

    /* for tests and other modules */
    window.llFonts = { load: load, loaded: loaded, use: use, openPanel: openPanel, catalogue: FONTS, groups: FONT_GROUPS };
    return { use: use, load: load, loaded: loaded, syncUI: syncUI, openPanel: openPanel };
  })();

  /* ---------- icons for the shell (the shared set; the same strings the other surfaces draw) ---------- */
  var ICONS = (function(){
    var open = 'stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    function svg(paths, extra){ return '<svg viewBox="0 0 24 24" ' + open + (extra || '') + '>' + paths + '</svg>'; }
    return {
      close:     svg('<path d="M6 6l12 12M18 6L6 18"/>'),
      open:      svg('<path d="M3 7V5h6l2 2h10v12H3z"/><path d="M3 11h18"/>'),
      chevronR:  svg('<path d="M9 6l6 6-6 6"/>'),
      chevronL:  svg('<path d="M15 6l-6 6 6 6"/>'),
      chevronU:  svg('<path d="M6 15l6-6 6 6"/>'),
      chevronD:  svg('<path d="M6 9l6 6 6-6"/>'),
      pin:       svg('<path d="M6 3h12v18l-6-4-6 4V3z"/>'),
      more:      svg('<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>'),
      check:     svg('<path d="M5 12l4 4L19 7"/>'),
      goOn:      svg('<path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"/><path d="M10 8l4 4-4 4"/>'),
      books:     svg('<path d="M4 4h5v16H4z"/><path d="M9 4h5v16H9z"/><path d="M14 6l5-1.5L23 19l-5 1.5z"/>'),
      sun:       svg('<path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
      print:     svg('<path d="M6 9V3h12v6"/><path d="M6 17H4V9h16v8h-2"/><path d="M6 14h12v7H6z"/>'),
      meaning:   svg('<path d="M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2H2z"/><path d="M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2H22z"/>'),
      translate: svg('<path d="M4 5h9M8 5v2c0 4-2 7-5 9M6 10c1 3 3 5 6 6"/><path d="M13 20l4-9 4 9M14.5 17h5"/>'),
      aa:        '<span class="label-aa" aria-hidden="true">Aa</span>'
    };
  })();

  /* ---------- popovers: type (Aa) and theme (the lamp) share one surface ---------- */
  /* Pop.open(id, button, render(pane), opts) shows the pane for `id` under its bar button — a
     bottom sheet on phones — after `render` has filled or refreshed it. One popover at a time;
     Escape, the scrim, a click outside or the button again closes it, and focus goes back to the
     button. The two panes are static markup in index.html so their controls exist from the start
     (A− / A+ keep their ids and their listeners). */
  var Pop = (function(){
    var el = $("#pop"), scrim = $("#popScrim"), panes = { type: $("#typePop"), theme: $("#themePop") };
    var current = null, anchor = null, scrollY0 = 0, docH = 0;
    function phone(){ return window.matchMedia && window.matchMedia("(max-width:560px)").matches; }
    /* where the page stands now, and how tall it is: the scroll-to-close rule below measures the
       reader's own scrolling from here, and a reflow (a new spacing or font moves the text under
       the window; scroll anchoring then shifts scrollY) moves the baseline instead of counting */
    function rebase(){ void document.documentElement.offsetHeight; scrollY0 = window.scrollY; docH = document.documentElement.scrollHeight; }
    /* under the button, right edges aligned, kept inside the window */
    function place(){
      if (!current) return;
      /* a resize across the phone breakpoint with the popover open: the scrim belongs to the sheet form only */
      scrim.classList.toggle("on", phone());
      if (phone()){ el.style.top = ""; el.style.left = ""; el.style.right = ""; el.style.maxHeight = ""; return; }
      var r = anchor.getBoundingClientRect();
      el.style.top = Math.round(r.bottom + 6) + "px";
      /* a short window: the popover scrolls inside rather than run off the bottom */
      el.style.maxHeight = Math.max(200, Math.round(window.innerHeight - r.bottom - 14)) + "px";
      el.style.left = "";
      var right = Math.max(8, Math.round(window.innerWidth - r.right));
      el.style.right = right + "px";
      if (window.innerWidth - right - el.offsetWidth < 8){ el.style.right = ""; el.style.left = "8px"; }
    }
    function open(id, btn, render, opts){
      if (current === id){ close(); return; }
      if (current) close(true);
      Menu.close(); Side.close();
      document.body.classList.remove("hidebar");
      current = id; anchor = btn;
      Object.keys(panes).forEach(function(k){ panes[k].hidden = k !== id; });
      el.setAttribute("aria-label", (opts && opts.label) || (id === "type" ? _t("Text settings") : _t("Theme")));
      if (render) render(panes[id]);
      sync();
      el.classList.add("open"); el.setAttribute("aria-hidden", "false");
      scrim.classList.toggle("on", phone());
      /* a phone holds the page still under its sheet (the class is scoped to phones in the stylesheet) */
      document.documentElement.classList.add("lock-pop");
      btn.setAttribute("aria-expanded", "true");
      place();
      rebase();
      /* focus lands on the first control: the size (zoom) slider, or the chosen theme's tile (its
         group is the one showing) */
      var first = id === "type" ? (panes.type.classList.contains("pdf") ? $("#qZoom") : $("#qSize"))
                                : (panes.theme.querySelector(".tiles:not([hidden]) .chip.on") || panes.theme.querySelector(".tiles:not([hidden]) .chip"));
      (first || el).focus({ preventScroll: true });
    }
    function close(quiet){
      if (!current) return;
      var btn = anchor;
      current = null; anchor = null;
      el.classList.remove("open"); el.setAttribute("aria-hidden", "true");
      scrim.classList.remove("on");
      document.documentElement.classList.remove("lock-pop");
      btn.setAttribute("aria-expanded", "false");
      if (!quiet && btn.focus) btn.focus({ preventScroll: true });
    }
    function is(id){ return current === id; }

    /* ---- the type pane: size (zoom for a PDF), spacing, width, font, flow ---- */
    var fontQuick = $("#fontQuick");
    FONT_GROUPS.forEach(function(g){
      var og = document.createElement("optgroup"); og.label = fontGroupName(g);
      Object.keys(FONTS).forEach(function(id){ if (FONTS[id].group !== g.id) return; var o = document.createElement("option"); o.value = id; o.textContent = fontName(FONTS[id]); og.appendChild(o); });
      fontQuick.appendChild(og);
    });
    function syncType(){
      var pdf = state.mode === "pdf", z = Math.round(state.zoom * 100);
      panes.type.classList.toggle("pdf", pdf);
      $("#qSizeL").textContent = pdf ? _t("Zoom") : _t("Size");
      $("#qZoom").value = z; $("#qSize").value = state.size;
      $("#qSizeV").textContent = pdf ? z + " %" : state.size + " px";
      $("#qLh").value = state.lh; $("#qLhV").textContent = dec(state.lh, 2);
      $("#qW").value = state.width; $("#qWV").textContent = state.width + " px";
      var rg = weightRange(FONTS[state.font] || FONTS.serif);
      setWeightRow($("#qWeightRow"), $("#qWeight"), $("#qWeightV"), rg);
      $("#qWeightNote").hidden = !rg.two;
      $("#qLs").value = state.ls || 0; $("#qLsV").textContent = emVal(state.ls || 0);
      $("#qWs").value = state.ws || 0; $("#qWsV").textContent = emVal(state.ws || 0);
      fontQuick.value = state.font;
      $("#qSoften").checked = !!state.soften;
      Array.prototype.forEach.call(panes.type.querySelectorAll("#qFlow .chip"), function(ch){
        var on = ch.dataset.flow === state.flow; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    $("#qSize").addEventListener("input", function(e){ state.size = +e.target.value; applyType(); });
    $("#qZoom").addEventListener("input", function(e){
      state.zoom = (+e.target.value) / 100;
      $("#rZoom").value = e.target.value; $("#vZoom").textContent = e.target.value + " %";
      queueRerender(); syncType();
    });
    $("#qLh").addEventListener("input", function(e){ state.lh = +e.target.value; applyType(); });
    $("#qW").addEventListener("input", function(e){ state.width = +e.target.value; applyType(); });
    $("#qWeight").addEventListener("input", function(e){ state.weight = +e.target.value; applyType(); });
    $("#qLs").addEventListener("input", function(e){ state.ls = +e.target.value; applyType(); });
    $("#qWs").addEventListener("input", function(e){ state.ws = +e.target.value; applyType(); });
    fontQuick.addEventListener("change", function(e){ state.font = e.target.value; applyType(); });
    $("#qFocus").addEventListener("change", function(e){ state.focus = e.target.checked; applyType(); });
    $("#qSoften").addEventListener("change", function(e){ state.soften = e.target.checked; $("#softenPdf").checked = e.target.checked; applyTheme(); });
    $("#qFlow").addEventListener("click", function(e){ var ch = e.target.closest(".chip"); if (ch){ setFlow(ch.dataset.flow); syncType(); } });
    /* the footer link: the sheet opens at the group, and Escape there hands focus back to the bar button */
    $("#typeMore").addEventListener("click", function(){ var a = anchor; close(true); openSheetAt("#textGroup", a); });

    /* ---- the theme pane: Previous, the last four used, then one group of tiles at a time behind
       a Light | Dark | Colour | Collections | High contrast | Mine switch (Collections holds the four
       collections, Dutch, Nature and seasons, Cozy and Textured, as labelled sections), "Make my own from this one", and Day
       and night (Off, Follow phone, On a schedule; the two themes; what it does now). It opens on
       the group of the theme on screen, and a tile applies its theme and leaves the popover open ---- */
    var qGroup = "light", actsFor = null;
    var GROUP_PANES = { light: "#qLight", dark: "#qDark", colour: "#qColour", coll: "#qColl", hicon: "#qHi", mine: "#qMine" };
    function paneOf(id){ return COLLECTIONS.indexOf(id) >= 0 ? "coll" : id; }
    function tile(k){ var t = resolveTheme(k); return t ? tileHtml(k, t) : ""; }
    /* an own theme's tile carries a ⋯ for its actions (a long press on the tile does the same) */
    function mineTile(k){
      var t = resolveTheme(k); if (!t) return "";
      return '<div class="mine-t">' + tileHtml(k, t) + '<button type="button" class="mine-ed" data-acts="' + k + '" aria-label="' + escapeHtml(_t("Actions for {name}", { name: themeName(k) })) + '" title="' + escapeHtml(_t("Edit, rename, duplicate or delete")) + '">' + ICONS.more + '</button></div>';
    }
    function groupOf(k){
      var g = pickerGroups();
      for (var i = 0; i < g.length; i++) if (g[i].ids.indexOf(k) >= 0) return paneOf(g[i].id);
      return "light";
    }
    function showGroup(id){
      qGroup = GROUP_PANES[id] ? id : "light";
      Array.prototype.forEach.call(panes.theme.querySelectorAll("#qGroups [role=tab]"), function(b){
        var on = b.dataset.g === qGroup;
        b.setAttribute("aria-selected", on ? "true" : "false"); b.classList.toggle("on", on); b.tabIndex = on ? 0 : -1;
        /* six tabs scroll sideways on a phone: the chosen one is brought into view */
        if (on){ var bar = b.parentNode, br = bar.getBoundingClientRect(), tr = b.getBoundingClientRect();
          if (tr.left < br.left || tr.right > br.right) bar.scrollLeft += (tr.left + tr.right) / 2 - (br.left + br.right) / 2; }
      });
      Object.keys(GROUP_PANES).forEach(function(k){ $(GROUP_PANES[k]).hidden = k !== qGroup; });
      if (qGroup !== "mine") showActs(null);
    }
    function renderTheme(keep){
      var groups = pickerGroups(), coll = "";
      groups.forEach(function(g){
        if (paneOf(g.id) === "coll"){
          coll += '<div class="q-coll" role="group" aria-labelledby="qc-' + g.id + '"><div class="plabel" id="qc-' + g.id + '">' + escapeHtml(g.name) + '</div><div class="tiles">' + g.ids.map(tile).join("") + '</div></div>';
          return;
        }
        $(GROUP_PANES[g.id]).innerHTML = g.id === "mine"
          ? g.ids.map(mineTile).join("") + '<button type="button" class="chip tile chip-new" data-new="1"><i aria-hidden="true"></i><span class="tile-n">' + escapeHtml(_t("New theme")) + '</span></button>'
          : g.ids.map(tile).join("");
      });
      $("#qColl").innerHTML = coll;
      /* the last four used, the one on screen first (and marked); only when it offers a choice */
      var recent = [state.theme].concat(recentThemes()).filter(function(k, i, a){ return resolveTheme(k) && a.indexOf(k) === i; }).slice(0, 4);
      if (recent.length < 2) recent = [];
      $("#qRecent").innerHTML = recent.map(tile).join("");
      $("#qRecentSec").hidden = !recent.length;
      showGroup(keep ? qGroup : groupOf(state.theme));
      if (actsFor) showActs(customById(actsFor) ? actsFor : null);
    }
    /* the actions for one of the reader's own themes, in a row under the grid */
    function showActs(k){
      var box = $("#qActs");
      actsFor = k && customById(k) ? k : null;
      Array.prototype.forEach.call(panes.theme.querySelectorAll(".mine-ed"), function(b){ b.setAttribute("aria-expanded", b.dataset.acts === actsFor ? "true" : "false"); });
      if (!actsFor){ box.hidden = true; box.innerHTML = ""; return; }
      box.setAttribute("aria-label", _t("Actions for {name}", { name: themeName(actsFor) }));
      box.innerHTML = '<span class="q-acts-n">' + escapeHtml(themeName(actsFor)) + '</span>' +
        [["edit", _t("Edit")], ["rename", _t("Rename")], ["dup", _t("Duplicate")], ["del", _t("Delete")]].map(function(a){
          return '<button type="button" class="chip' + (a[0] === "del" ? " danger" : "") + '" data-act="' + a[0] + '">' + escapeHtml(a[1]) + '</button>';
        }).join("");
      box.hidden = false;
    }
    /* a Day / Night picker's small page, in the colours of the theme it stands for */
    function dnSwatch(b, k){ var t = resolveTheme(k), i = b.querySelector(".dn-sw"); if (t && i) i.setAttribute("style", tileVars(t)); }
    function syncTheme(){
      var t = currentTheme();
      var day = resolveTheme(state.autoDay) ? state.autoDay : "day", night = resolveTheme(state.autoNight) ? state.autoNight : "dusk";
      $("#qDayName").textContent = themeName(day);
      $("#qNightName").textContent = themeName(night);
      Array.prototype.forEach.call(panes.theme.querySelectorAll(".dn"), function(b){
        var k = b.dataset.dn === "day" ? day : night;
        b.classList.toggle("on", state.auto !== "off" && state.theme === k);
        dnSwatch(b, k);
      });
      tileMark(panes.theme, t);
      Array.prototype.forEach.call(panes.theme.querySelectorAll("#qAuto .chip"), function(ch){
        var on = ch.dataset.auto === state.auto; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
      });
      $("#qTimes").hidden = state.auto !== "time";
      $("#qDayNight").hidden = state.auto === "off";
      if (document.activeElement !== $("#qFrom")) $("#qFrom").value = state.nightFrom;
      if (document.activeElement !== $("#qTo")) $("#qTo").value = state.nightTo;
      /* Previous: one step back to the theme before this one */
      var prev = prevTheme();
      $("#qPrev").hidden = !prev;
      if (prev){ $("#qPrevN").textContent = _t("Back to {name}", { name: themeName(prev) }); $("#qPrev").title = _t("Previous theme"); }
      $("#qNow").textContent = AutoTheme.nowLine();
    }
    panes.theme.addEventListener("click", function(e){
      var tab = e.target.closest("#qGroups [role=tab]");
      if (tab){ showGroup(tab.dataset.g); return; }
      var ed = e.target.closest(".mine-ed");
      if (ed){ showActs(actsFor === ed.dataset.acts ? null : ed.dataset.acts); return; }
      var act = e.target.closest("#qActs [data-act]");
      if (act){ var k = actsFor; if (k) themeAction(act.dataset.act, k); return; }
      if (e.target.closest(".tiles .chip-new")){ Maker.open({ from: state.theme }); return; }
      var ch = e.target.closest(".tiles .chip[data-theme]");
      if (ch){ pickTheme(ch.dataset.theme); return; }
      if (e.target.closest("#qPrev")){ var p = prevTheme(); if (p) pickTheme(p); return; }
      if (e.target.closest("#qMake")){ Maker.open({ from: state.theme }); return; }
      var a = e.target.closest("#qAuto .chip");
      if (a){ AutoTheme.setMode(a.dataset.auto); syncTheme(); }
    });
    /* a long press on an own theme's tile opens its actions */
    var pressed = null;
    $("#qMine").addEventListener("pointerdown", function(e){ var ch = e.target.closest(".chip[data-theme]"); pressed = ch ? ch.dataset.theme : null; }, true);
    longPress($("#qMine"), function(){ if (pressed && customById(pressed)) showActs(pressed); });
    $("#qDaySel").addEventListener("change", function(e){ AutoTheme.setPair("day", e.target.value); });
    $("#qNightSel").addEventListener("change", function(e){ AutoTheme.setPair("night", e.target.value); });
    /* the group switch is a tab list: the arrow keys, Home and End move along it */
    $("#qGroups").addEventListener("keydown", function(e){
      var tabs = Array.prototype.slice.call(this.querySelectorAll("[role=tab]")), i = tabs.indexOf(document.activeElement), n = tabs.length, j = -1;
      if (i < 0) return;
      if (e.key === "ArrowRight") j = (i + 1) % n; else if (e.key === "ArrowLeft") j = (i + n - 1) % n;
      else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1;
      if (j < 0) return;
      e.preventDefault(); showGroup(tabs[j].dataset.g); tabs[j].focus();
    });
    /* the night hours, the same as the sheet's (On a schedule) */
    $("#qFrom").addEventListener("change", function(e){ state.nightFrom = e.target.value || "21:00"; Prefs.save(); AutoTheme.apply(true); syncTheme(); });
    $("#qTo").addEventListener("change", function(e){ state.nightTo = e.target.value || "07:00"; Prefs.save(); AutoTheme.apply(true); syncTheme(); });
    $("#themeMore").addEventListener("click", function(){ var a = anchor; close(true); openSheetAt("#themeGroup", a); });

    /* the open pane follows the state (applyType / applyTheme call this), and the page's height
       is noted again: the change that called this may have reflowed the text */
    function sync(){
      if (!current) return;
      if (current === "type") syncType(); else syncTheme();
      rebase();
    }
    /* the settings sheet, scrolled so a group sits under its strip; `from` is the control that
       asked for it (focus returns there when the sheet closes) */
    function openSheetAt(sel, from){
      setSheet(true, from);
      var sheet = $("#sheet"), g = $(sel), strip = $("#sheetTabs");
      if (!g) return;
      var top = g.getBoundingClientRect().top - sheet.getBoundingClientRect().top + sheet.scrollTop - (strip ? strip.offsetHeight : 0) - 2;
      if (SheetTabs) SheetTabs.mark(g.id, 700);
      sheet.scrollTo({ top: Math.max(0, top), behavior: noMotion() ? "auto" : "smooth" });
      /* the theme group: the pressed tile, where a keyboard picks up from */
      var first = (sel === "#themeGroup" && g.querySelector('#themeChips .chip[aria-pressed="true"]')) || g.querySelector("input, select, button");
      if (first) first.focus({ preventScroll: true });
    }

    /* Escape closes the popover only: it stops here (capture) so the sheet, the panel and the
       menu keep their state; a click anywhere else, the scrim, or scrolling away closes it too */
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape" && current){ e.preventDefault(); e.stopImmediatePropagation(); close(); }
    }, true);
    /* capture phase: the ⋯ button stops its click from bubbling, and that click must close this too */
    document.addEventListener("click", function(e){
      if (!current || e.target.closest("#pop") || (anchor && anchor.contains(e.target))) return;
      close(true);
    }, true);
    scrim.addEventListener("click", function(){ close(); });
    el.querySelector(".pop-handle").addEventListener("click", function(){ close(); });
    dragToClose(el, [el.querySelector(".pop-handle")].concat(Array.prototype.slice.call(el.querySelectorAll(".pop-head"))), function(){ close(); }, function(){ return !!current; });
    /* scrolling away from the popover closes it — on a desktop, where it hangs from the bar. A
       phone's sheet stays: Escape, the scrim or the handle close it, and the page is held still
       under it anyway. A scroll that comes with a change of the page's height is the text
       reflowing (a font or an image landed, a slider moved), not the reader: the baseline moves */
    window.addEventListener("scroll", function(){
      if (!current) return;
      var h = document.documentElement.scrollHeight;
      if (h !== docH){ docH = h; scrollY0 = window.scrollY; return; }
      if (!phone() && Math.abs(window.scrollY - scrollY0) > 80) close(true);
    }, { passive: true });
    window.addEventListener("resize", place);

    /* the bar buttons */
    $("#gear").addEventListener("click", function(e){ e.stopPropagation(); open("type", this, syncType); });
    $("#lamp").addEventListener("click", function(e){ e.stopPropagation(); open("theme", this, function(){ renderTheme(); syncTheme(); }); });
    /* the reader's own themes changed (saved, renamed, copied, deleted): the open pane is redrawn in place */
    function refreshThemes(){ if (current === "theme"){ renderTheme(true); syncTheme(); } }

    window.llPop = { open: open, close: close, is: is, sync: sync, sheet: setSheet, sheetAt: openSheetAt };
    return { open: open, close: close, is: is, sync: sync, sheetAt: openSheetAt, refreshThemes: refreshThemes };
  })();

  /* ---------- view switching ---------- */
  function show(mode){
    state.mode = mode;
    document.body.dataset.mode = mode;
    if (mode === "doc" || mode === "pdf") state.opening = false;
    Wake.set(mode === "doc" || mode === "pdf");
    $("#empty").style.display  = mode === "empty"  ? "block" : "none";
    $("#library").classList.toggle("show", mode === "empty" && Library.count() > 0);
    $("#docView").style.display= mode === "doc"    ? "block" : "none";
    $("#pdf").style.display    = mode === "pdf"    ? "block" : "none";
    $("#status").style.display = mode === "status" ? "block" : "none";
    if (mode !== "doc" && mode !== "pdf"){
      document.body.classList.remove("paged");
      $("#pager").style.display = "none";
    }
    if (SheetTabs) SheetTabs.applies(); else $("#textGroup").classList.toggle("dim", mode === "pdf");
    $("#textHint").textContent = mode === "pdf"
      ? _t("A PDF is open — these apply to text documents. Use Zoom below for PDFs.")
      : _t("Applies to text documents (EPUB, DOCX, TXT, Markdown, HTML).");
    if (window.llStats) window.llStats.onMode(mode);
    if (PhoneBar) PhoneBar.place();
  }
  function status(msg){ $("#status").textContent = msg; show("status"); }
  $("#status").setAttribute("role", "status"); $("#status").setAttribute("aria-live", "polite");

  /* ---------- paged reading ---------- */
  function pagedActive(){
    return state.flow === "pages" && (state.mode === "doc" || state.mode === "pdf");
  }
  function headVar(){ var head = document.querySelector("header"); if (head) document.documentElement.style.setProperty("--headH", head.offsetHeight + "px"); }
  window.addEventListener("resize", headVar);
  /* the dock at the foot of the screen holds the read-aloud bar over the page-turn bar. Its
     height goes into --dockH: the pages clear it, and the toasts and the auto-scroll pill float
     above it. --pagerH and --ttsH stay set for anything still reading them. */
  function dockVar(){
    var zen = document.body.classList.contains("zen"), dock = $("#dock"), ttsEl = $("#tts");
    var pagerH = zen ? 0 : $("#pager").offsetHeight, ttsH = ttsEl.classList.contains("on") ? ttsEl.offsetHeight : 0;
    var h = dock ? dock.offsetHeight : pagerH + ttsH, st = document.documentElement.style;
    st.setProperty("--dockH", h + "px"); st.setProperty("--pagerH", pagerH + "px"); st.setProperty("--ttsH", ttsH + "px");
    return h;
  }
  /* the dock changed height without a window resize (the read-aloud bar came, went, or wrapped to
     two rows for the sleep timer): the pages are laid out to clear it, so lay them out again
     unless the last layout already saw this height. relayoutPaged never changes the dock, so
     there is no loop. The header is watched the same way: the tabs strip appearing or going
     changes --headH, which the progress pill and the sheet hang from. */
  var dockLaidOut = -1;
  function printing(){ return document.body.classList.contains("printing") || (window.matchMedia && window.matchMedia("print").matches); }
  if (window.ResizeObserver){
    /* not while printing: the print layout hides the dock, and Print lays the pages out again itself once the screen is back */
    new ResizeObserver(function(){ var h = dockVar(); if (h !== dockLaidOut && pagedActive() && !printing()) relayoutPaged(); }).observe($("#dock"));
    new ResizeObserver(headVar).observe(document.querySelector("header"));
  }
  else window.addEventListener("resize", dockVar);
  function availHeight(){
    headVar();
    var head = document.querySelector("header"), zen = document.body.classList.contains("zen");
    var headH = document.body.classList.contains("immersive") || zen ? 0 : head.offsetHeight;
    var dockH = dockVar();
    dockLaidOut = dockH;
    /* measured before the page-turn bar is shown (the first layout): assume its usual height */
    if (!zen && pagedActive() && !$("#pager").offsetHeight) dockH += 56;
    return Math.max(160, window.innerHeight - headH - dockH - 26);
  }
  function spreadOn(){ return state.spread !== false && window.innerWidth >= 1000; }
  /* Pages flow lays the text out in fixed-height columns and shows one column (or two,
     side by side) at a time by scrolling the view sideways. The column boxes are
     measured from the layout itself, so the margins setting can't put them out of step. */
  function layoutDocPages(){
    var view = $("#docView"), doc = $("#doc");
    view.style.height = availHeight() + "px";
    state.perPage = spreadOn() ? 2 : 1;
    document.body.classList.toggle("spread", state.perPage === 2);
    doc.style.columnWidth = "";
    doc.style.columnCount = String(state.perPage);
    doc.style.columnGap = state.gap + "px";
    var w = doc.getBoundingClientRect().width;
    state.colw = (w - (state.perPage - 1) * state.gap) / state.perPage;
    state.stride = state.colw + state.gap;
    /* the strip ends with one empty column (#doc::after) so the last page can always be
       scrolled to its left edge — an odd last column in a spread, or the view's right
       margin, would otherwise leave it short; it is not counted as a page */
    var cols = Math.max(1, Math.round((doc.scrollWidth + state.gap) / state.stride) - 1);
    state.totalPages = Math.max(1, Math.ceil(cols / state.perPage));
  }
  /* which page shows a given x offset inside the column strip */
  function pageOfOffset(x){ return Math.floor((x + 0.5) / (state.stride || (state.colw + state.gap)) / (state.perPage || 1)); }
  function exitDocPages(){
    var view = $("#docView"), doc = $("#doc");
    document.body.classList.remove("spread");
    state.perPage = 1;
    view.style.height = "";
    view.scrollLeft = 0;
    doc.style.columnWidth = "";
    doc.style.columnCount = "";
    doc.style.columnGap = "";
    doc.style.transform = "";
  }
  var reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  /* nothing slides or scrolls smoothly with reduced motion, nor in e-ink mode */
  function noMotion(){ return !!(reduceMotion && reduceMotion.matches) || state.eink === true; }
  /* show page n. `anchor` is the character the caller navigated to (a resume position, a
     heading, a search hit, the place kept through a re-layout); without one the page's own
     first character becomes the anchor. Re-layouts land on the page holding the anchor. */
  function gotoPage(n, animate, anchor){
    n = Math.max(0, Math.min(n, state.totalPages - 1));
    var was = state.page;
    state.page = n;
    var view = $("#docView"), left = n * (state.perPage || 1) * state.stride;
    var smooth = animate && !noMotion() && Math.abs(n - was) === 1;
    if (smooth && view.scrollTo) view.scrollTo({ left: left, behavior: "smooth" });
    else view.scrollLeft = left;
    state.pageOff = (typeof anchor === "number") ? anchor : pageTopOffset();
    updatePager(); updateProgress();
    Library.notePosition();
  }
  /* the view is overflow:hidden, but focusing a link or the browser's own find can still scroll
     it: bring the focused element onto a page, and snap any foreign scroll back to a page edge */
  $("#docView").addEventListener("focusin", function(e){
    if (state.mode === "doc" && state.flow === "pages" && e.target && e.target !== $("#docView")) revealElement(e.target);
  });
  (function(){
    var view = $("#docView"), t = null;
    function snap(){
      if (state.mode !== "doc" || state.flow !== "pages" || !state.stride) return;
      var want = state.page * (state.perPage || 1) * state.stride;
      if (Math.abs(view.scrollLeft - want) > 2) gotoPage(Math.round(view.scrollLeft / ((state.perPage || 1) * state.stride)));
    }
    if ("onscrollend" in window) view.addEventListener("scrollend", snap);
    else view.addEventListener("scroll", function(){ clearTimeout(t); t = setTimeout(snap, 160); });
  })();
  /* first index in [lo, hi] whose measure is >= want; a measure < 0 means "no box, skip it" */
  function firstAtLeast(lo, hi, measure, want){
    var hit = -1;
    while (lo <= hi){
      var mid = (lo + hi) >> 1, k = mid, c = -1;
      while (k <= hi && (c = measure(k)) < 0) k++;
      if (k > hi){ hi = mid - 1; continue; }
      if (c >= want){ hit = k; hi = mid - 1; } else lo = k + 1;
    }
    return hit;
  }
  /* the first character on the current page, read off the layout itself (hit testing
     fails when the settings sheet or the read-aloud bar covers the page) */
  function pageTopOffset(){ return colStartOffset(state.page * (state.perPage || 1)); }
  /* the character just past the current page (a spread's second column included): the next page's first,
     or the end of the text on the last page */
  function pageEndOffset(){
    if (state.mode !== "doc" || state.flow !== "pages" || !state.stride) return null;
    if (state.page >= state.totalPages - 1) return Anchor.textLength();
    return colStartOffset((state.page + 1) * (state.perPage || 1));
  }
  /* the first character in column `want` (0-based) or after it */
  function colStartOffset(want){
    if (state.mode !== "doc" || state.flow !== "pages" || !state.stride) return null;
    var nodes = Anchor.textNodes();
    if (!nodes.length) return null;
    var left = $("#doc").getBoundingClientRect().left, r = document.createRange();
    function col(x){ return Math.floor((x - left + 0.5) / state.stride); }
    function endCol(i){ r.selectNodeContents(nodes[i]); var b = r.getBoundingClientRect(); return (b.width || b.height) ? col(b.right - 1) : -1; }
    var ni = firstAtLeast(0, nodes.length - 1, endCol, want);
    if (ni < 0) return null;
    var n = nodes[ni];
    var ci = firstAtLeast(0, n.length - 1, function(i){
      r.setStart(n, i); r.setEnd(n, i + 1);
      var b = r.getBoundingClientRect();
      return (b.width || b.height) ? col((b.left + b.right) / 2) : -1;
    }, want);
    return Anchor.offsetOf(n, ci < 0 ? 0 : ci);
  }
  /* lay the columns out again and land on the page that now holds what was at the top.
     The offset was noted when the page was last shown, so it predates whatever changed
     the layout (a new text size, a resize, a font that just arrived). */
  function relayoutDocPages(){
    var off = state.pageOff;
    layoutDocPages();
    if (typeof off !== "number" || !revealOffset(off)) gotoPage(state.page);
  }
  function relayoutPaged(){
    if (state.mode === "doc" && state.flow === "pages"){
      relayoutDocPages();
    } else if (state.mode === "pdf" && state.flow === "pages" && state.pdfDoc){
      renderPdfSingle();
    }
  }

  /* ---------- reflow: apply the current reading mode ---------- */
  function reflow(){
    var paged = pagedActive();
    document.body.classList.toggle("paged", paged);
    if (!paged) document.body.classList.remove("immersive");
    $("#pager").style.display = paged ? "flex" : "none";
    if (state.mode === "doc"){
      if (state.flow === "pages"){ layoutDocPages(); gotoPage(state.page); }
      else { exitDocPages(); }
    } else if (state.mode === "pdf" && state.pdfDoc){
      renderPdf();
    }
    updatePager(); updateProgress();
  }
  function readFrac(){
    if (state.mode === "doc" && state.flow === "pages")
      return state.totalPages > 1 ? state.page / (state.totalPages - 1) : 0;
    if (state.mode === "pdf" && state.flow === "pages" && state.pdfDoc)
      return state.pdfDoc.numPages > 1 ? (state.pdfPageNum - 1) / (state.pdfDoc.numPages - 1) : 0;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    return max > 0 ? h.scrollTop / max : 0;
  }
  function setFlow(f){
    if (f === state.flow) return;
    if (state.eink === true && f !== "pages"){ Marks.toast(_t("E-ink mode keeps the Pages flow")); return; }
    var frac = readFrac();
    var off = state.mode === "doc" ? (state.flow === "pages" ? pageTopOffset() : Library.topCharOffset()) : null;
    state.flow = f;
    document.querySelectorAll("#flowChips .chip").forEach(function(ch){
      var on = ch.dataset.flow === f; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Prefs.save();
    if (state.mode === "pdf" && state.pdfDoc && f === "pages")
      state.pdfPageNum = Math.round(frac * (state.pdfDoc.numPages - 1)) + 1;
    document.body.classList.remove("hidebar");
    reflow();
    Focus.sync();     /* focus reading watches the page for the new flow */
    if (state.mode === "doc" && f === "pages" && (off === null || !revealOffset(off)))
      gotoPage(Math.round(frac * (state.totalPages - 1)));
    if (f === "scroll")
      requestAnimationFrame(function(){
        if (state.mode === "pdf"){ Toc.goPdfPage(state.pdfPageNum); return; }
        if (off !== null && revealOffset(off)) return;
        var h = document.documentElement;
        window.scrollTo(0, frac * (h.scrollHeight - h.clientHeight));
      });
  }
  function turn(dir){
    if (!pagedActive()) return;
    /* on from the last page: the reader is done with it (the "Finished" card need not wait) */
    if (dir > 0 && Journal && (state.mode === "doc" ? state.page >= state.totalPages - 1 : state.pdfPageNum + (state.perPage || 1) - 1 >= state.pdfDoc.numPages)) Journal.pastEnd();
    if (state.mode === "doc"){ gotoPage(state.page + dir, true); }
    else {
      var step = state.perPage || 1;
      var n = state.pdfPageNum + dir * step;
      if (n < 1) n = 1;
      if (n > state.pdfDoc.numPages) return;
      if (n !== state.pdfPageNum){ state.pdfPageNum = n; Progress.tick(); renderPdfSingle(); }
    }
  }
  /* the section the current page is in: the heading at the page's first character, the same
     rule as the title readout (Section), so the two never name different sections for one page
     (a PDF's outline arrives later; the readout is drawn again when it does) */
  var pdfSections = { doc: null, list: null };
  function currentSection(){
    if (state.mode === "doc"){
      var e = Section ? Section.at(pageTopOffset()) : null;
      return e ? e.title : "";
    }
    if (state.mode === "pdf" && state.pdfDoc){
      var doc = state.pdfDoc;
      if (pdfSections.doc !== doc){
        pdfSections.doc = doc; pdfSections.list = null;
        Toc.pdfEntries().then(function(list){ if (state.pdfDoc === doc){ pdfSections.list = list; updatePager(); } });
      }
      var hit = null, pg = state.pdfPageNum;
      (pdfSections.list || []).forEach(function(e){ if (e.page && e.page <= pg) hit = e; });
      return hit ? hit.title : "";
    }
    return "";
  }
  /* the page-turn bar's readout: "12 / 40 · Chapter 3 · 18 min left" — the page fraction first,
     then the section when the document has one, then the time left at the measured speed */
  function updatePager(){
    var cur, total;
    if (state.mode === "doc"){ cur = state.page + 1; total = state.totalPages; }
    else if (state.pdfDoc){ cur = state.pdfPageNum; total = state.pdfDoc.numPages; if (state.perPage === 2 && state.flow === "pages" && cur < total) cur = cur + "\u2013" + (cur + 1); }
    else { cur = 1; total = 1; }
    /* the " · " before the section and the time left is a span of its own, so the stylesheet can
       set the fraction on a line above the other two without a stray dot opening the second line
       (the text, which screen readers and the tests read, is unchanged) */
    var info = $("#pgInfo"), part = function(cls, text, dot){
      var el = document.createElement("span"); el.className = cls;
      if (dot){ var d = document.createElement("span"); d.className = "pg-dot"; d.textContent = " \u00B7 "; el.appendChild(d); }
      el.appendChild(document.createTextNode(text)); info.appendChild(el);
    };
    info.textContent = "";
    part("pg-n", cur + " / " + total);
    if (!pagedActive()) return;
    var sec = currentSection(), left = Progress.left();
    if (sec) part("pg-sec", sec, true);
    if (left) part("pg-left", left, true);
  }
  function updateProgress(){
    if (!pagedActive()) return;
    Progress.tick();
    var cur, total;
    if (state.mode === "doc"){ cur = state.page + 1; total = state.totalPages; }
    else { cur = state.pdfPageNum; total = state.pdfDoc ? state.pdfDoc.numPages : 1; }
    setProgressBar(total > 0 ? (cur / total) * 100 : 0);
  }
  /* the 3px line at the top, and its value for assistive technology */
  function setProgressBar(pct){
    var bar = $("#progress");
    bar.style.width = pct + "%";
    bar.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  /* ---------- file opening ---------- */
  function cleanHtml(html){
    return DOMPurify.sanitize(html, {
      USE_PROFILES: {html: true},
      FORBID_TAGS: ["style", "font"],
      FORBID_ATTR: ["style", "color", "face", "size", "bgcolor", "align"],
      /* default list + blob: so images unpacked from an EPUB can be shown */
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    });
  }
  /* every open gets a generation number; a newer open (or going home / closing the tab)
     makes an older, still-loading one give up instead of overwriting the screen */
  var openGen = 0;
  function abandonOpen(){ openGen++; state.opening = false; }
  function openFile(file, opts){
    if (!file) return;
    opts = opts || {};
    try { document.dispatchEvent(new CustomEvent("ll:fileopened")); } catch(_){}
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    var gen = ++openGen;
    var live = function(){ return gen === openGen; };
    Library.onOpen(file, opts, live);
    setFname(bareName(file.name));
    document.title = file.name + " — lamplight";
    window.scrollTo(0,0);
    document.body.classList.remove("hidebar");
    document.body.classList.remove("immersive");
    state.pdfDoc = null; state.toc = null;
    state.page = 0; state.pdfPageNum = 1;
    state.opening = true;
    renderGen++;
    releaseEpubUrls();
    Search.reset();
    Speak.stop();
    Auto.stop();

    var fail = function(err){
      if (!live()) return;
      console.error(err);
      state.opening = false;
      status(_t("Couldn't open “{name}”. {error}", { name: file.name, error: err && err.message ? err.message : "" }));
      Library.docReady();
    };

    try{
      if (ext === "pdf"){
        status(_t("Opening PDF…"));
        needPdf().then(function(){ return file.arrayBuffer(); }).then(function(buf){
          return pdfjsLib.getDocument({data: buf}).promise;
        }).then(function(doc){
          if (!live()){ try { doc.destroy(); } catch(_){} return; }
          state.pdfDoc = doc;
          state.zoom = 1;
          $("#rZoom").value = 100; $("#vZoom").textContent = "100 %";
          show("pdf");
          reflow();
        }).catch(fail);

      } else if (ext === "docx"){
        status(_t("Opening document…"));
        Promise.all([need(["purify"]), docxToHtml(file)]).then(function(r){
          if (!live()) return;
          setDocHtml(r[1]);
          /* the document's core title when it has one, else its first heading */
          docxTitle(file).then(function(t){ if (live()) docTitle(t || firstHeading()); });
        }).catch(fail);

      } else if (ext === "epub"){
        status(_t("Opening book…"));
        need(["jszip", "purify"]).then(function(){ return file.arrayBuffer(); }).then(function(buf){
          return openEpub(buf);
        }).then(function(book){
          if (!live()){ releaseEpubUrls(); return; }
          if (book.title) docTitle(book.title + (book.author ? " — " + book.author : ""));
          if (book.lang) Speak.setDocLang(book.lang);     /* the book says what language it is in */
          setDocHtml(book.html, {toc: book.toc, keepIds: true});
        }).catch(fail);

      } else if (ext === "doc" || ext === "rtf" || ext === "odt" || ext === "pages"){
        status(_t(".{ext} isn't supported yet — export it as PDF, EPUB or DOCX and open that instead.", { ext: ext }));

      } else if (ext === "md" || ext === "markdown"){
        need(["marked", "purify"]).then(function(){ return file.text(); }).then(function(txt){
          if (!live()) return;
          setDocHtml(marked.parse(txt));
          docTitle(firstHeading());
        }).catch(fail);

      } else if (ext === "html" || ext === "htm"){
        status(_t("Opening page…"));
        need(["purify"]).then(function(){ return file.text(); }).then(function(txt){
          if (!live()) return;
          setDocHtml(readerHtml(txt));
          docTitle(firstHeading() || htmlTitle(txt));
        }).catch(fail);

      } else {
        file.text().then(function(txt){
          if (!live()) return;
          var wrap = document.createElement("div");
          wrap.className = "plain";
          wrap.textContent = txt;
          $("#doc").innerHTML = "";
          $("#doc").appendChild(wrap);
          if (typeof Songs !== "undefined" && Songs) Songs.scan();
          Anchor.invalidate();
          show("doc");
          reflow();
          Library.docReady();
        }).catch(fail);
      }
    } catch(err){ fail(err); }
  }
  /* the book's own title, once the text is in: the bar, the library, the tab */
  function docTitle(t){
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    if (t.length > 140) t = t.slice(0, 139).replace(/\s+\S*$/, "") + "\u2026";
    setFname(t);
    Library.setTitle(t);
    var id = Library.currentId();
    if (id) Tabs.setName(id, t);
  }
  /* the first top-level heading of the text (an h1; a document that starts with an h2 names nothing) */
  function firstHeading(){
    var h = $("#doc").querySelector("h1");
    return h ? h.textContent : "";
  }
  /* a saved web page's <title>, when its text has no heading of its own */
  function htmlTitle(src){
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src || "");
    if (!m) return "";
    var d = document.createElement("textarea"); d.innerHTML = m[1];
    return d.value;
  }
  /* a DOCX's own title (docProps/core.xml, dc:title), read with the EPUB reader's zip library */
  function docxTitle(file){
    return need(["jszip"]).then(function(){ return file.arrayBuffer(); }).then(function(buf){ return JSZip.loadAsync(buf); })
      .then(function(zip){ var f = zip.file("docProps/core.xml"); return f ? f.async("string") : ""; })
      .then(function(xml){
        if (!xml) return "";
        var doc = new DOMParser().parseFromString(xml, "application/xml"), el = doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "title")[0];
        return el ? el.textContent.trim() : "";
      }).catch(function(){ return ""; });
  }
  /* a file's title without opening it (files added together become tabs and books before they are
     read): a Markdown file's first "# " heading, an HTML file's first h1 or its <title>, an EPUB's
     metadata, a DOCX's core title. Whatever it finds is replaced by the real thing on opening */
  function peekTitle(file){
    var ext = (String(file && file.name || "").split(".").pop() || "").toLowerCase(), clean = function(t){ return String(t || "").replace(/\s+/g, " ").trim(); };
    if (ext === "md" || ext === "markdown")
      return file.slice(0, 65536).text().then(function(t){
        var m = /^#[ \t]+(.+?)[ \t#]*$/m.exec(t) || /^(\S[^\n]*)\n=+[ \t]*$/m.exec(t);
        return m ? clean(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "")) : "";
      }).catch(function(){ return ""; });
    if (ext === "html" || ext === "htm")
      return file.slice(0, 262144).text().then(function(t){
        var d = new DOMParser().parseFromString(t, "text/html"), h = d.querySelector("h1");
        return clean((h && h.textContent) || (d.querySelector("title") || {}).textContent || "");
      }).catch(function(){ return ""; });
    if (ext === "epub")
      return need(["jszip"]).then(function(){ return JSZip.loadAsync(file); }).then(function(zip){
        var c = zip.file("META-INF/container.xml");
        return c ? c.async("string").then(function(xml){
          var rf = new DOMParser().parseFromString(xml, "application/xml").querySelector("rootfile"), p = rf && rf.getAttribute("full-path");
          return p && zip.file(p) ? zip.file(p).async("string") : "";
        }) : "";
      }).then(function(opfXml){
        if (!opfXml) return "";
        var opf = new DOMParser().parseFromString(opfXml, "application/xml"), DC = "http://purl.org/dc/elements/1.1/";
        var t = opf.getElementsByTagNameNS(DC, "title")[0], a = opf.getElementsByTagNameNS(DC, "creator")[0];
        return t ? clean(t.textContent) + (a && clean(a.textContent) ? " \u2014 " + clean(a.textContent) : "") : "";
      }).catch(function(){ return ""; });
    if (ext === "docx") return docxTitle(file);
    return Promise.resolve("");
  }
  /* ---------- html files: reduce a saved web page to clean reader text, like a DOCX ---------- */
  function readerHtml(src){
    var dom = new DOMParser().parseFromString(src, "text/html");
    var root = dom.body || dom.documentElement;
    function each(sel, fn){
      var list = root.querySelectorAll(sel);
      for (var i = list.length - 1; i >= 0; i--) fn(list[i]);
    }
    /* menus, sidebars, forms, media, scripts: nothing a reader needs */
    each("script,style,link,meta,noscript,template,iframe,object,embed,canvas,svg,math,video,audio,source,track," +
         "form,button,input,select,textarea,label,nav,aside,menu,dialog," +
         "[role=navigation],[role=banner],[role=contentinfo],[role=complementary],[role=search]," +
         "[role=dialog],[role=alertdialog],[role=alert],[role=menu],[role=menubar],[role=toolbar],[role=tooltip]," +
         "[aria-hidden=true],[hidden]",
         function(el){ el.remove(); });
    /* cookie banners, share bars, comment threads, ads… — recognised by their class/id names
       (same idea as browser reader modes). Anything that looks like the article itself, or holds
       most of the page's text, is always kept. */
    each("[class*=editsection],[class*=noprint],[class~=sr-only],[class~=visually-hidden],[class~=screen-reader-text],[class~=catlinks]",
         function(el){ el.remove(); });
    var UNLIKELY = /-ad-|\bads?\b|advert|banner|breadcrumb|combx|comment|community|consent|cookie|disqus|gdpr|footer|header|legends|logo|menu|modal|newsletter|overlay|pager|pagination|popup|promo|related|remark|replies|rss|share|shoutbox|sidebar|skyscraper|social|sponsor|subscribe|supplemental|toolbar|widget|yom-remote/i;
    var MAYBE = /\band\b|article|body|column|content|main|shadow|story|post|entry|text|page|chapter|book/i;
    var totalText = (root.textContent || "").length;
    each("[class],[id]", function(el){
      if (!el.parentNode) return;
      var hook = (el.getAttribute("class") || "") + " " + (el.getAttribute("id") || "");
      if (!UNLIKELY.test(hook) || MAYBE.test(hook)) return;
      if (/^(html|body|p|h[1-6]|li|td|th|em|strong|b|i|a|span|blockquote|pre|code|table)$/i.test(el.tagName)) return;
      if ((el.textContent || "").length > totalText * 0.4) return;
      el.remove();
    });
    /* images stored online or in a sidecar folder can't load offline; keep their alt text */
    each("img", function(img){
      var src = img.getAttribute("src") || "";
      if (/^data:/i.test(src)) return;
      var alt = (img.getAttribute("alt") || "").trim();
      if (alt) img.replaceWith(dom.createTextNode("[" + alt + "]")); else img.remove();
    });
    /* links keep their text but no longer navigate away from the reader */
    each("a", function(a){
      var span = dom.createElement("span");
      span.textContent = a.textContent;
      a.replaceWith(span);
    });
    /* unwrap page-layout tags that collide with lamplight's own header/main */
    each("header,footer,main,article,section,hgroup,figure,picture", function(el){
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
    });
    /* drop class/id hooks so the app's own CSS can't style imported content */
    each("[class],[id]", function(el){ el.removeAttribute("class"); el.removeAttribute("id"); });
    return root.innerHTML;
  }
  function setDocHtml(html, opts){
    opts = opts || {};
    state.toc = opts.toc || null;
    $("#doc").innerHTML = cleanHtml(html);
    if (typeof Songs !== "undefined" && Songs) Songs.scan();     /* a song at a chapter's start becomes a link (the text stays as it is) */
    Anchor.invalidate();
    show("doc");
    reflow();
    Library.docReady();
  }
  /* internal links (EPUB footnotes, chapter links, Markdown anchors) stay inside the reader */
  $("#doc").addEventListener("click", function(e){
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) !== "#"){
      /* external links open in a new tab rather than replacing the reader */
      if (/^(https?:|mailto:)/i.test(href)){ a.target = "_blank"; a.rel = "noopener"; return; }
      e.preventDefault(); return;
    }
    e.preventDefault();
    var id = decodeURIComponent(href.slice(1));
    var el = document.getElementById(id) || $("#doc").querySelector('[name="' + CSS.escape(id) + '"]');
    if (el){ if (Journal) Journal.jumped(); revealElement(el); }
  });
  /* scroll / page to a character offset in the text (see Anchor) */
  function revealOffset(off, opts){
    if (state.mode !== "doc") return false;
    var r = Anchor.rangeAt(off);
    if (!r) return false;
    var rect = r.getBoundingClientRect();
    /* a collapsed space has no box: step on to the next character that has one */
    for (var k = 1; !(rect.width || rect.height) && k <= 12; k++){
      var r2 = Anchor.rangeAt(off + k); if (!r2) break;
      rect = r2.getBoundingClientRect();
    }
    if (state.flow === "pages"){
      var docRect = $("#doc").getBoundingClientRect();
      gotoPage(pageOfOffset(rect.left - docRect.left + 1), false, off);
    } else {
      var headH = Library.headerHeight();
      var pad = (opts && opts.center) ? Math.round((window.innerHeight - headH) * 0.3) : 8;
      window.scrollTo(0, Math.max(0, rect.top + window.scrollY - headH - pad));
    }
    return true;
  }
  /* bring an element into view in either reading flow */
  function revealElement(el){
    if (state.mode !== "doc") return;
    if (state.flow === "pages"){
      var doc = $("#doc");
      var docRect = doc.getBoundingClientRect(), r = el.getBoundingClientRect();
      var offset = r.left - docRect.left;             /* distance inside the column strip */
      var first = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      var anchor = first ? Anchor.offsetOf(first, 0) : null;
      gotoPage(pageOfOffset(offset), false, anchor === null ? undefined : anchor);
    } else {
      var y = el.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 12;
      window.scrollTo(0, Math.max(0, y));
    }
  }

  /* ---------- epub: unzip, walk the spine, and render the chapters as one document ---------- */
  function loadScript(src){
    if (!loadScript.cache) loadScript.cache = {};
    var scriptsLoaded = loadScript.cache;
    if (scriptsLoaded[src]) return scriptsLoaded[src];
    scriptsLoaded[src] = new Promise(function(resolve, reject){
      var sc = document.createElement("script");
      sc.src = src;
      sc.onload = function(){ resolve(); };
      sc.onerror = function(){ delete scriptsLoaded[src]; reject(new Error(_t("Couldn't load {file}", { file: src }))); };
      document.head.appendChild(sc);
    });
    return scriptsLoaded[src];
  }
  var epubUrls = [];
  function releaseEpubUrls(){
    epubUrls.forEach(function(u){ try { URL.revokeObjectURL(u); } catch(_){} });
    epubUrls = [];
  }
  /* resolve an href from the OPF, a nav document or a chapter against the file it came
     from; hrefs are URLs (percent-encoded), zip entry names are plain text */
  function pathJoin(base, rel){
    if (/^[a-z]+:/i.test(rel)) return rel;
    rel = rel.split("?")[0];
    try { rel = decodeURIComponent(rel); } catch(_){}
    rel = rel.replace(/^\.\//, "");
    var parts = (base ? base.split("/").slice(0, -1) : []).concat(rel.split("/"));
    var out = [];
    parts.forEach(function(p){
      if (p === "..") out.pop(); else if (p !== "." && p !== "") out.push(p);
    });
    return out.join("/");
  }
  function openEpub(buf){
    return loadScript("./vendor/jszip.min.js").then(function(){
      return JSZip.loadAsync(buf);
    }).then(function(zip){
      if (zip.file("META-INF/encryption.xml")) throw new Error(_t("This book is protected (DRM), so it can't be opened here."));
      var container = zip.file("META-INF/container.xml");
      if (!container) throw new Error(_t("Not a valid EPUB (no container.xml)."));
      return container.async("string").then(function(xml){
        var cdoc = new DOMParser().parseFromString(xml, "application/xml");
        var rf = cdoc.querySelector("rootfile");
        var opfPath = rf && (rf.getAttribute("full-path") || "");
        if (!opfPath || !zip.file(opfPath)) throw new Error(_t("Not a valid EPUB (no package file)."));
        return zip.file(opfPath).async("string").then(function(opfXml){ return parseOpf(zip, opfPath, opfXml); });
      });
    });
  }
  function parseOpf(zip, opfPath, opfXml){
    var opf = new DOMParser().parseFromString(opfXml, "application/xml");
    var q = function(sel, root){ return Array.prototype.slice.call((root || opf).getElementsByTagName(sel)); };
    var meta = function(name){ var el = q(name)[0] || q("dc:" + name)[0]; return el ? el.textContent.trim() : ""; };
    var title = meta("title"), author = meta("creator"), lang = meta("language");
    var items = {}, navHref = null, ncxHref = null;
    q("item").forEach(function(it){
      var id = it.getAttribute("id"), href = pathJoin(opfPath, it.getAttribute("href") || "");
      items[id] = { href: href, type: it.getAttribute("media-type") || "", props: it.getAttribute("properties") || "" };
      if (/\bnav\b/.test(items[id].props)) navHref = href;
      if (items[id].type === "application/x-dtbncx+xml") ncxHref = href;
    });
    var spineEl = q("spine")[0];
    if (spineEl && spineEl.getAttribute("toc") && items[spineEl.getAttribute("toc")]) ncxHref = items[spineEl.getAttribute("toc")].href;
    var spine = q("itemref").map(function(ir){
      var it = items[ir.getAttribute("idref")];
      return it ? { href: it.href, linear: ir.getAttribute("linear") !== "no" } : null;
    }).filter(Boolean);
    if (!spine.length) throw new Error(_t("This EPUB has no readable chapters."));

    /* stable anchor ids: one per file (+ its own ids inside) */
    var fileKey = {}; spine.forEach(function(sp, i){ fileKey[sp.href] = "ep" + i; });
    function anchorId(href, frag){ return (fileKey[href] || "ep-" + href.replace(/[^A-Za-z0-9]+/g, "-")) + (frag ? "-" + frag : ""); }
    function frag(f){ if (!f) return ""; try { return decodeURIComponent(f); } catch(_){ return f; } }

    var resourceUrls = {};
    function resourceUrl(path){
      if (resourceUrls[path]) return resourceUrls[path];
      var f = zip.file(path);
      if (!f) return Promise.resolve(null);
      var ext = (path.split(".").pop() || "").toLowerCase();
      var mime = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", svg:"image/svg+xml", webp:"image/webp", bmp:"image/bmp", avif:"image/avif" }[ext] || "application/octet-stream";
      resourceUrls[path] = f.async("blob").then(function(blob){
        var url = URL.createObjectURL(new Blob([blob], { type: mime }));
        epubUrls.push(url);
        return url;
      }).catch(function(){ return null; });
      return resourceUrls[path];
    }

    releaseEpubUrls();
    var jobs = spine.filter(function(sp){ return sp.linear || spine.length === 1; }).map(function(sp){
      var f = zip.file(sp.href);
      if (!f) return Promise.resolve("");
      return f.async("string").then(function(src){ return chapterHtml(src, sp.href); });
    });
    function chapterHtml(src, href){
      var doc = new DOMParser().parseFromString(src, "text/html");
      var body = doc.body || doc.documentElement;
      var base = href;
      var waits = [];
      /* svg image covers → plain images */
      Array.prototype.slice.call(body.querySelectorAll("image")).forEach(function(im){
        var src2 = im.getAttribute("xlink:href") || im.getAttribute("href") || "";
        var img = doc.createElement("img");
        img.setAttribute("src", src2);
        var svg = im.closest("svg");
        (svg || im).replaceWith(img);
      });
      Array.prototype.slice.call(body.querySelectorAll("img")).forEach(function(img){
        var src2 = img.getAttribute("src") || "";
        if (!src2 || /^(data:|https?:)/i.test(src2)){ return; }
        var path = pathJoin(base, src2.split("#")[0]);
        waits.push(resourceUrl(path).then(function(url){
          if (url) img.setAttribute("src", url); else img.remove();
        }));
      });
      /* keep the chapter's own ids reachable, prefixed so they can't collide with the app */
      Array.prototype.slice.call(body.querySelectorAll("[id]")).forEach(function(el){
        el.setAttribute("id", anchorId(href, el.getAttribute("id")));
      });
      Array.prototype.slice.call(body.querySelectorAll("a[href]")).forEach(function(a){
        var h = a.getAttribute("href") || "";
        if (/^(https?:|mailto:)/i.test(h)) return;
        var parts = h.split("#"), target = parts[0] ? pathJoin(base, parts[0]) : href;
        a.setAttribute("href", "#" + anchorId(target, frag(parts[1])));
      });
      Array.prototype.slice.call(body.querySelectorAll("script,style,link,iframe,object,embed,video,audio")).forEach(function(el){ el.remove(); });
      return Promise.all(waits).then(function(){
        return '<section class="ll-chapter" id="' + anchorId(href, "") + '">' + body.innerHTML + '</section>';
      });
    }
    return Promise.all(jobs).then(function(chunks){
      var html = chunks.join("\n");
      var tocJob = navHref && zip.file(navHref) ? zip.file(navHref).async("string").then(function(src){ return tocFromNav(src, navHref); })
                 : ncxHref && zip.file(ncxHref) ? zip.file(ncxHref).async("string").then(function(src){ return tocFromNcx(src, ncxHref); })
                 : Promise.resolve([]);
      return tocJob.catch(function(){ return []; }).then(function(toc){
        return { html: html, title: title, author: author, lang: lang, toc: toc };
      });
    });
    function tocFromNav(src, href){
      var doc = new DOMParser().parseFromString(src, "text/html");
      var nav = Array.prototype.slice.call(doc.querySelectorAll("nav")).filter(function(n){ return /toc/i.test(n.getAttribute("epub:type") || n.getAttribute("type") || ""); })[0] || doc.querySelector("nav");
      var out = [];
      if (!nav) return out;
      (function walk(ol, level){
        Array.prototype.slice.call(ol.children).forEach(function(li){
          if (li.tagName !== "LI") return;
          var a = li.querySelector(":scope > a[href], :scope > span");
          if (a){
            var h = a.getAttribute("href") || "", parts = h.split("#");
            var target = parts[0] ? pathJoin(href, parts[0]) : href;
            out.push({ title: a.textContent.replace(/\s+/g, " ").trim(), id: anchorId(target, frag(parts[1])), level: level });
          }
          var sub = li.querySelector(":scope > ol");
          if (sub) walk(sub, level + 1);
        });
      })(nav.querySelector("ol") || doc.createElement("ol"), 1);
      return out;
    }
    function tocFromNcx(src, href){
      var doc = new DOMParser().parseFromString(src, "application/xml");
      var out = [];
      (function walk(parent, level){
        Array.prototype.slice.call(parent.children).forEach(function(np){
          if (np.localName !== "navPoint") return;
          var label = np.getElementsByTagName("text")[0], content = np.getElementsByTagName("content")[0];
          var h = content ? (content.getAttribute("src") || "") : "", parts = h.split("#");
          var target = parts[0] ? pathJoin(href, parts[0]) : href;
          out.push({ title: label ? label.textContent.replace(/\s+/g, " ").trim() : "", id: anchorId(target, frag(parts[1])), level: level });
          walk(np, level + 1);
        });
      })(doc.getElementsByTagName("navMap")[0] || doc.documentElement, 1);
      return out;
    }
  }

  /* ---------- pdf rendering ---------- */
  function contentWidth(){
    return Math.min(document.querySelector("main").clientWidth - 8, 1000);
  }
  function renderPdf(){
    if (!state.pdfDoc) return;
    if (state.flow === "pages") renderPdfSingle();
    else renderPdfScroll();
  }
  /* scroll flow: one placeholder per page, sized from the page's own dimensions; pages are
     rendered only while near the viewport and released again when far away, so a 300-page
     PDF costs a handful of bitmaps rather than hundreds. Re-rendering (zoom, resize) keeps the
     page that was in view. */
  var pdfObserver = null;
  function renderPdfScroll(){
    var gen = ++renderGen;
    var doc = state.pdfDoc;
    var holder = $("#pdf");
    var keep = holder.querySelector(".pdf-page") ? Library.currentPdfPage() : null;
    if (pdfObserver){ pdfObserver.disconnect(); pdfObserver = null; }
    holder.style.height = "";
    holder.innerHTML = "";
    holder.classList.remove("spread");
    holder.style.display = "block";
    state.perPage = 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    doc.getPage(1).then(function(page1){
      if (gen !== renderGen) return;
      var vp1 = page1.getViewport({scale:1});
      state.fitScale = Math.max(0.4, Math.min(contentWidth() / vp1.width, 2.5));
      var scale = state.fitScale * state.zoom;
      var sizes = {}, wraps = [];
      function sizeOf(i){ return sizes[i] || { w: vp1.width * scale, h: vp1.height * scale }; }
      for (var i = 1; i <= doc.numPages; i++){
        var wrap = document.createElement("div");
        wrap.className = "pdf-page"; wrap.dataset.page = i;
        wrap.style.width = Math.floor(sizeOf(i).w) + "px"; wrap.style.height = Math.floor(sizeOf(i).h) + "px";
        wrap.setAttribute("aria-label", _t("Page {n}", { n: i }));
        holder.appendChild(wrap); wraps.push(wrap);
      }
      var rendering = {}, pages = {};
      function getPage(i){ return pages[i] || (pages[i] = (i === 1 ? Promise.resolve(page1) : doc.getPage(i))); }
      function render(i){
        var wrap = wraps[i-1];
        if (!wrap || wrap.dataset.done === "1" || rendering[i]) return;
        rendering[i] = true;
        getPage(i).then(function(pg){
          if (gen !== renderGen) return;
          var vp = pg.getViewport({scale: scale * dpr});
          var css = pg.getViewport({scale: scale});
          sizes[i] = { w: css.width, h: css.height };
          wrap.style.width = Math.floor(css.width) + "px"; wrap.style.height = Math.floor(css.height) + "px";
          var canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = Math.floor(css.width) + "px"; canvas.style.height = Math.floor(css.height) + "px";
          return pg.render({canvasContext: canvas.getContext("2d"), viewport: vp}).promise.then(function(){
            if (gen !== renderGen) return;
            wrap.innerHTML = ""; wrap.appendChild(canvas); wrap.dataset.done = "1";
            rendering[i] = false;
            Library.pdfPageReady(i);
          });
        }).catch(function(err){
          rendering[i] = false;
          if (gen === renderGen) console.warn("page " + i + " failed to render", err);
        });
      }
      function release(i){
        var wrap = wraps[i-1];
        if (!wrap || wrap.dataset.done !== "1") return;
        var c = wrap.querySelector("canvas");
        if (c){ c.width = 0; c.height = 0; }
        wrap.innerHTML = ""; wrap.dataset.done = "0";
      }
      /* real page sizes, fetched in the background so the scrollbar settles quickly */
      (function measure(i){
        if (gen !== renderGen || i > doc.numPages) return;
        var batch = [];
        for (var k = i; k < i + 8 && k <= doc.numPages; k++) batch.push(k);
        Promise.all(batch.map(function(k){ return getPage(k).then(function(pg){ var v = pg.getViewport({scale: scale}); sizes[k] = { w: v.width, h: v.height }; }); })).then(function(){
          if (gen !== renderGen) return;
          batch.forEach(function(k){ var w = wraps[k-1]; if (w.dataset.done !== "1"){ w.style.width = Math.floor(sizes[k].w) + "px"; w.style.height = Math.floor(sizes[k].h) + "px"; } });
          setTimeout(function(){ measure(i + 8); }, 0);
        });
      })(1);
      if ("IntersectionObserver" in window){
        pdfObserver = new IntersectionObserver(function(entries){
          entries.forEach(function(en){
            var i = +en.target.dataset.page;
            if (en.isIntersecting) render(i); else release(i);
          });
        }, { rootMargin: "150% 0px 150% 0px" });
        wraps.forEach(function(w){ pdfObserver.observe(w); });
      } else {
        for (var j = 1; j <= doc.numPages; j++) render(j);
      }
      if (keep){ var w = wraps[keep-1]; if (w) window.scrollTo(0, Math.max(0, w.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 6)); }
    }).catch(function(err){
      if (gen === renderGen) status(_t("PDF rendering failed. {error}", { error: err && err.message ? err.message : "" }));
    });
  }
  function renderPdfSingle(){
    var gen = ++renderGen;
    var doc = state.pdfDoc;
    var holder = $("#pdf");
    var availH = availHeight();
    holder.style.height = availH + "px";
    var n = Math.max(1, Math.min(state.pdfPageNum, doc.numPages));
    state.pdfPageNum = n;
    var two = spreadOn() && doc.numPages > 1;
    state.perPage = two ? 2 : 1;
    var nums = two ? [n, n + 1].filter(function(k){ return k <= doc.numPages; }) : [n];
    Promise.all(nums.map(function(k){ return doc.getPage(k); })).then(function(pages){
      if (gen !== renderGen) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var widthEach = two ? (contentWidth() - 18) / 2 : contentWidth();
      var fit = Infinity;
      pages.forEach(function(page){ var base = page.getViewport({scale:1}); fit = Math.min(fit, widthEach / base.width, (availH - 14) / base.height); });
      var scale = Math.max(0.3, fit) * state.zoom;
      var canvases = pages.map(function(page, i){
        var vp = page.getViewport({scale: scale * dpr});
        var canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = Math.floor(vp.width / dpr) + "px";
        canvas.dataset.page = nums[i];
        return { canvas: canvas, job: page.render({canvasContext: canvas.getContext("2d"), viewport: vp}).promise };
      });
      return Promise.all(canvases.map(function(c){ return c.job; })).then(function(){
        if (gen !== renderGen) return;
        holder.innerHTML = "";
        holder.classList.toggle("spread", two);
        /* show() sets the holder to display:block inline, which would beat the stylesheet's flex
           row for a spread and stack the second page under the first, out of sight */
        holder.style.display = two ? "flex" : "block";
        canvases.forEach(function(c){ holder.appendChild(c.canvas); });
        updatePager(); updateProgress();
        Library.pdfReady();
      });
    }).catch(function(err){
      if (gen === renderGen) status(_t("PDF rendering failed. {error}", { error: err && err.message ? err.message : "" }));
    });
  }
  var rerenderTimer = null;
  function queueRerender(){
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(function(){ if (state.mode === "pdf") renderPdf(); }, 280);
  }

  /* ============================================================
     Library — files you have opened, kept on this device (IndexedDB),
     with the last reading position per document.
     ============================================================ */
  /* character offsets inside #doc — a layout-independent way to point at a spot in the text */
  /* ---------- character offsets <-> DOM positions ----------
     A place in a text document (resume position, highlight, search hit, read-aloud unit)
     is a plain character offset into the concatenated text of #doc, so it survives
     re-layouts and reopening. The text nodes and their start offsets are cached until
     the document changes. */
  var Anchor = (function(){
    var nodes = null, starts = null, index = null;
    function build(){
      if (nodes) return;
      nodes = []; starts = []; index = new Map();
      var w = document.createTreeWalker($("#doc"), NodeFilter.SHOW_TEXT), n, sum = 0;
      while ((n = w.nextNode())){ index.set(n, nodes.length); nodes.push(n); starts.push(sum); sum += n.length; }
      starts.push(sum);
    }
    function invalidate(){ nodes = starts = index = null; }
    /* whatever rewrites #doc (a new document, highlight marks, the tapped-word span) calls
       invalidate() itself; the observer catches anything else, a moment later */
    if (window.MutationObserver) new MutationObserver(invalidate).observe($("#doc"), { childList: true, subtree: true, characterData: true });
    function textNodes(root){
      if (root && root !== $("#doc")){
        var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
        while ((n = w.nextNode())) out.push(n);
        return out;
      }
      build();
      return nodes;
    }
    function offsetOf(node, off){
      build();
      var i = index.get(node);
      return i === undefined ? null : starts[i] + off;
    }
    /* (node, offset) for a character offset; boundary offsets belong to the following node
       unless preferEnd, and collapsed whitespace between blocks is skipped */
    function point(off, preferEnd){
      build();
      if (!nodes.length) return null;
      var lo = 0, hi = nodes.length - 1;
      while (lo < hi){
        var mid = (lo + hi + 1) >> 1;
        if (preferEnd ? starts[mid] < off : starts[mid] <= off) lo = mid; else hi = mid - 1;
      }
      var i = lo;
      if (!preferEnd) while (i < nodes.length - 1 && !/\S/.test(nodes[i].textContent)) i++;
      return { node: nodes[i], offset: Math.max(0, Math.min(nodes[i].length, off - starts[i])) };
    }
    function rangeAt(off){
      var p = point(off);
      if (!p) return null;
      var r = document.createRange();
      var o = Math.min(p.offset, Math.max(0, p.node.length - 1));
      r.setStart(p.node, o); r.setEnd(p.node, Math.min(p.node.length, o + 1));
      return r;
    }
    function rangeBetween(start, end){
      var a = point(start), b = point(end, true);
      if (!a || !b) return null;
      var r = document.createRange();
      r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
      return r;
    }
    function textLength(){ build(); return starts[starts.length - 1]; }
    /* start offset of a text node's index — for callers that walk nodes with a running sum */
    function startOf(i){ build(); return starts[i]; }
    return { textNodes: textNodes, offsetOf: offsetOf, point: point, rangeAt: rangeAt, rangeBetween: rangeBetween,
             textLength: textLength, startOf: startOf, invalidate: invalidate };
  })();

  /* ---------- icons: the shared set, drawn inline in the text colour (24×24 boxes) ---------- */
  /* the menu's, panels' and bars' icons join the shared table declared above the popovers */
  ICONS = Object.assign(ICONS, (function(){
    var head = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    var dots = 'stroke-width="2.6"', solid = 'fill="currentColor" stroke="none"';
    function path(d, attrs){ return '<path d="' + d + '"' + (attrs ? " " + attrs : "") + '/>'; }
    function icon(){ return head + Array.prototype.join.call(arguments, "") + "</svg>"; }
    return {
      search:   icon(path("M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"), path("M20 20l-3.5-3.5")),
      contents: icon(path("M9 6h11 M9 12h11 M9 18h11"), path("M4 6h.01 M4 12h.01 M4 18h.01", dots)),
      info:     icon(path("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"), path("M12 11v5"), path("M12 8h.01", dots)),
      bookmark: icon(path("M6 3h12v18l-6-4-6 4V3z")),
      notes:    icon(path("M4 20h4L18 10l-4-4L4 16v4z"), path("M13 7l4 4")),
      speaker:  icon(path("M4 9v6h4l5 4V5L8 9H4z"), path("M16 9a4 4 0 0 1 0 6")),
      people:   icon(path("M9 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"), path("M3.5 20a5.5 5.5 0 0 1 11 0"), path("M15.5 5.3a3 3 0 0 1 0 5.4"), path("M17 14.3a5.5 5.5 0 0 1 3.5 5.7")),
      recap:    icon(path("M3.5 12a8.5 8.5 0 1 0 2.5-6"), path("M3 4v4.5h4.5"), path("M12 8v4.5l3 2")),
      bolt:     icon(path("M13 3L5 14h6l-1 7 8-11h-6l1-7z")),
      sound:    icon(path("M4 15v-3a8 8 0 0 1 16 0v3"), path("M4 14h3v6H4z"), path("M17 14h3v6h-3z")),
      auto:     icon(path("M6 7l6 6 6-6"), path("M6 13l6 6 6-6")),
      ruler:    icon(path("M3 9h18v6H3z"), path("M7 9v3 M11 9v3 M15 9v3")),
      zen:      icon(path("M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5")),
      print:    icon(path("M6 9V3h12v6"), path("M6 17H4V9h16v8h-2"), path("M6 14h12v7H6z")),
      chart:    icon(path("M5 20V12 M12 20V6 M19 20V10", dots)),
      journal:  icon(path("M6 3h11a2 2 0 0 1 2 2v16H7.5A2.5 2.5 0 0 1 5 18.5V4a1 1 0 0 1 1-1z"), path("M5 18.5A2.5 2.5 0 0 1 7.5 16H19"), path("M9 7.5h6 M9 11h4")),
      finished: icon(path("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"), path("M8 12.3l2.7 2.7L16 9.7")),
      star:     icon(path("M12 3.5l2.55 5.2 5.7.83-4.13 4.02.98 5.68L12 16.55l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83z")),
      books:    icon(path("M4 4h5v16H4z"), path("M9 4h5v16H9z"), path("M14 6l5-1.5L23 19l-5 1.5z")),
      /* what is kept on this device: a stack of disks, not the library's books */
      storage:  icon(path("M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"), path("M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"), path("M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6")),
      keyboard: icon(path("M3 7h18v10H3z"), path("M7 11h.01 M11 11h.01 M15 11h.01 M7 14h10", dots)),
      open:     icon(path("M3 7V5h6l2 2h10v12H3z"), path("M3 11h18")),
      sliders:  icon(path("M4 7h10 M18 7h2 M4 17h4 M12 17h8"), path("M14 7m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0"), path("M8 17m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0")),
      close:    icon(path("M6 6l12 12 M18 6L6 18")),
      /* Settings: a gear (the Aa button is the type, the sliders say "adjust") */
      gear:     icon(path("M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"), path("M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z")),
      moon:     icon(path("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")),
      undo:     icon(path("M9 14L4 9l5-5"), path("M4 9h10.5a5.5 5.5 0 0 1 0 11H11")),
      tabs:     icon(path("M4 7h12v13H4z"), path("M8 7V4h12v13h-4")),
      play:     icon(path("M8 5v14l11-7z", solid)),
      pause:    icon(path("M7 5h3.5v14H7z M13.5 5H17v14h-3.5z", solid))
    };
  })());
  /* a bar's play / pause button: the icon follows the state, the callers set the label */
  function playIcon(btn, playing){ btn.innerHTML = playing ? ICONS.pause : ICONS.play; }
  /* an empty panel: a lamp-tinted round with a line icon, a title and one sentence (app.css
     .empty-state). It keeps the .empty-note class the panels have always used for their notes. */
  function emptyState(icon, title, text, extra){
    return '<div class="empty-note empty-state"><span class="es-icon" aria-hidden="true">' + (icon || "") + '</span>' +
      '<div class="es-title">' + title + '</div>' + (text ? '<p class="es-text">' + text + '</p>' : '') + (extra || '') + '</div>';
  }

  /* ---------- side panel: contents, marks, search share one drawer ----------
     The four document panels (contents, search, notes, about) are one family: a segmented
     switcher under the title moves between them in place, without closing the drawer. */
  var Side = (function(){
    var el = $("#side"), scrim = $("#sideScrim"), body = $("#sideBody"), foot = $("#sideFoot"), title = $("#sideTitle"), sw = $("#sideSwitch");
    var current = null, onClose = null, opener = null, family = null;
    var FAMILIES = {
      doc: [
        { name: "toc",   label: "Contents", icon: "contents", open: function(){ Toc.openPanel(); } },
        { name: "find",  label: "Search",   icon: "search",   open: function(){ Search.openPanel(); } },
        { name: "marks", label: "Notes",    icon: "notes",    open: function(){ Marks.openPanel(); } },
        { name: "about", label: "About",    icon: "info",     open: function(){ About.openPanel(); } }
      ]
    };
    function drawSwitch(){
      var list = FAMILIES[family];
      if (!list){ sw.hidden = true; sw.innerHTML = ""; return; }
      sw.innerHTML = list.map(function(p){
        return '<button type="button" data-panel="' + p.name + '" aria-pressed="' + (p.name === current) + '">' + ICONS[p.icon] + '<span>' + _tc("panel", p.label) + '</span></button>';
      }).join("");
      sw.hidden = false;
    }
    sw.addEventListener("click", function(e){
      var b = e.target.closest("button[data-panel]"), list = FAMILIES[family];
      if (!b || !list || b.dataset.panel === current) return;
      list.forEach(function(p){ if (p.name === b.dataset.panel) p.open(); });
    });
    /* the drawer is modal: while it is open the rest of the page is inert, so Tab cannot reach the
       bar under the scrim and open a menu or a popover behind it. The card, the toasts and the
       highlight popover sit over the drawer and stay live. */
    var BEHIND = "header, #sheet, #main, #dock, #pop, .skip";
    function holdRest(on){
      Array.prototype.forEach.call(document.querySelectorAll(BEHIND), function(n){ n.inert = on; });
    }
    /* a body with more than fits gets a focusable, named scroll region (Keyboard shortcuts has no
       controls); a short one gains no extra Tab stop */
    function scrollable(){ body.tabIndex = body.scrollHeight > body.clientHeight ? 0 : -1; }
    function open(name, ttl, render, closeFn, opts){
      var wasOpen = !!current;
      /* a panel replaced in place tidies up as if it had closed; the drawer itself stays */
      if (wasOpen && current !== name && onClose) onClose();
      current = name; onClose = closeFn || null; family = (opts && opts.family) || null;
      if (!wasOpen) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : $("#main");
      title.textContent = ttl;
      drawSwitch();
      body.innerHTML = ""; foot.innerHTML = ""; foot.style.display = "none";
      render(body, foot);
      if (foot.children.length) foot.style.display = "flex";
      body.scrollTop = 0;
      el.classList.add("open"); scrim.classList.add("on"); el.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("lock-side");
      Menu.close(); Pop.close(true);
      holdRest(true);
      /* move focus into the panel; the first control if there is one, else the scrolling body,
         else the close button */
      setTimeout(function(){
        if (current !== name) return;
        scrollable();
        var first = body.querySelector("input, [tabindex='0'], button");
        (first || (body.tabIndex === 0 ? body : $("#sideClose"))).focus({ preventScroll: true });
      }, 60);
    }
    function close(){
      if (!current) return;
      var fn = onClose; current = null; onClose = null; family = null;
      el.classList.remove("open"); scrim.classList.remove("on"); el.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("lock-side");
      /* the page comes back to life before focus returns to it: focus() on an inert element is a no-op */
      holdRest(false);
      if (fn) fn();
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      opener = null;
    }
    scrim.addEventListener("click", close);
    $("#sideClose").addEventListener("click", close);
    el.querySelector(".side-grab").addEventListener("click", close);
    dragToClose(el, [el.querySelector(".side-top")], close, function(){ return !!current; });
    /* Escape closes only the topmost layer: the key stops here once it has closed a panel, so the
       settings sheet and the menu, whose listeners come after this one, keep their state; the
       dictionary card, which sits over the panel, takes the key first in the capture phase */
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape" && current){ e.preventDefault(); e.stopImmediatePropagation(); close(); }
    });
    /* Tab wraps inside the drawer (the one hop to the document's edge that inert leaves, and the
       whole of the containment where inert is not known) */
    el.addEventListener("keydown", function(e){
      if (e.key !== "Tab" || !current) return;
      var all = Array.prototype.filter.call(el.querySelectorAll("button, input, select, textarea, a[href], [tabindex='0']"), function(n){ return !n.disabled && n.getClientRects().length; });
      if (!all.length) return;
      var first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    });
    return { open: open, close: close, is: function(name){ return current === name; }, body: body, foot: foot,
             current: function(){ return current; },
             refresh: function(name, render){ if (current === name){ body.innerHTML = ""; foot.innerHTML = ""; render(body, foot); foot.style.display = foot.children.length ? "flex" : "none"; scrollable(); } } };
  })();

  /* ---------- "more" menu: features register their entries here ----------
     An entry has a group (navigate · marks · reading · tools · app) and an icon. On a desktop
     the menu drops from the ⋯ button; on a phone it rises as a sheet of tiles. Arrow keys move
     through the items, Escape closes and hands focus back to the button. */
  var Menu = (function(){
    var items = [], btn = $("#more"), menu = $("#moreMenu"), wrap = $("#moreWrap"), scrim = null;
    var GROUPS = [["navigate", "Navigate"], ["marks", "Bookmarks"], ["reading", "Reading"], ["tools", "Tools"], ["app", "Lamplight"]];
    /* on a phone the sheet leads with four large tiles for what every sitting uses (an entry's
       `quick`, its place in the row), then Reading, Tools and Lamplight; an entry may move group or
       place there (`pgroup`, `porder`: Search, About and the notes join Reading, Print, Storage and
       Close document go last), and Settings (`head`) is the gear in the sheet's head */
    var PHONE_GROUPS = [["quick", "Quick"], ["navigate", "Navigate"], ["marks", "Bookmarks"], ["reading", "Reading"], ["tools", "Tools"], ["app", "Lamplight"]];
    menu.setAttribute("aria-labelledby", "more");
    function add(item){
      if (item.order === undefined) item.order = 100 + items.length;
      if (!item.group) item.group = "tools";
      items.push(item);
    }
    function text(it){ return typeof it.label === "function" ? it.label() : it.label; }
    /* a toggle that is on reads "Stop…", "Hide…", "Leave…" or "Show original": it gets a dot */
    function isOn(label){ return /^(Stop|Hide|Leave|Show original)\b/.test(_en(label)); }
    function entry(it){
      var label = text(it), b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "menuitem");
      /* the key hint is decoration to a screen reader; the shortcut itself is declared */
      b.innerHTML = '<i class="mi">' + (it.icon || "") + '</i><span>' + label + '</span>' + (it.key ? '<kbd aria-hidden="true">' + it.key + '</kbd>' : '');
      if (it.key) b.setAttribute("aria-keyshortcuts", it.key);
      if (isOn(label)) b.classList.add("on");
      if (it.enabled && !it.enabled()) b.disabled = true;
      b.addEventListener("click", function(){ close(true); it.run(); });
      return b;
    }
    function render(){
      menu.innerHTML = "";
      var phone = isPhone(), shown = function(it){ return !it.sep && !(it.show && !it.show()); };
      var grab = document.createElement("div");
      grab.className = "menu-grab"; grab.setAttribute("aria-hidden", "true");
      grab.addEventListener("click", function(){ close(true); });
      /* the phone sheet's head: the handle, the book (or the app) in the title face, the Settings gear */
      if (phone){
        var mh = document.createElement("div"), mt = document.createElement("div");
        mh.className = "menu-head";
        mt.className = "menu-title"; mt.textContent = (state.mode === "doc" || state.mode === "pdf") && $("#fname").textContent ? $("#fname").textContent : "Lamplight";
        mh.appendChild(grab); mh.appendChild(mt);
        items.filter(function(it){ return it.head && shown(it); }).forEach(function(it){ var b = entry(it); b.classList.add("menu-gear"); b.setAttribute("aria-label", text(it)); b.title = text(it); mh.appendChild(b); });
        menu.appendChild(mh);
      } else menu.appendChild(grab);
      var gOf = function(it){ return phone ? (it.quick ? "quick" : it.pgroup || it.group) : it.group; };
      var oOf = function(it){ return phone ? (it.quick ? it.quick : it.porder !== undefined ? it.porder : it.order) : it.order; };
      var sorted = items.slice().sort(function(a, b){ return oOf(a) - oOf(b); }), groups = [], rows = 0;
      (phone ? PHONE_GROUPS : GROUPS).forEach(function(g){
        var list = sorted.filter(function(it){ return shown(it) && gOf(it) === g[0] && !(phone && it.head); });
        if (!list.length) return;
        var sec = document.createElement("div"), head = document.createElement("div"), grid = document.createElement("div");
        sec.className = "menu-group" + (g[0] === "quick" ? " menu-quick" : ""); sec.setAttribute("role", "group"); sec.setAttribute("aria-labelledby", "menuG-" + g[0]);
        head.className = "label"; head.id = "menuG-" + g[0]; head.textContent = _tc("menu", g[1]);
        grid.className = "menu-items";
        list.forEach(function(it){ grid.appendChild(entry(it)); });
        sec.appendChild(head); sec.appendChild(grid);
        groups.push({ el: sec, rows: list.length }); rows += list.length;
      });
      /* a long menu on a desktop reads better as two columns than as one tall list: the groups
         stay whole and the split falls where the columns come out most even */
      var wide = rows > 9 && window.innerWidth > 560, cols = [document.createElement("div"), document.createElement("div")], cut = groups.length;
      if (wide){
        var best = Infinity, sum = 0;
        groups.forEach(function(g, i){ sum += g.rows; var d = Math.abs(sum - (rows - sum)); if (d < best){ best = d; cut = i + 1; } });
      }
      menu.classList.toggle("wide", wide);
      cols.forEach(function(c){ c.className = "menu-col"; });
      groups.forEach(function(g, i){ (wide && i >= cut ? cols[1] : cols[0]).appendChild(g.el); });
      if (wide){ var box = document.createElement("div"); box.className = "menu-cols"; box.appendChild(cols[0]); box.appendChild(cols[1]); menu.appendChild(box); }
      else menu.appendChild(cols[0]);
    }
    /* the tiles in order, then the head's gear: arrows end on Settings as they do on a desktop */
    function focusables(){
      var all = Array.prototype.filter.call(menu.querySelectorAll(".menu-group button[role=menuitem]"), function(b){ return !b.disabled; });
      return all.concat(Array.prototype.slice.call(menu.querySelectorAll(".menu-head button[role=menuitem]")));
    }
    function isOpen(){ return menu.classList.contains("open"); }
    function open(){
      render();
      if (!scrim){
        scrim = document.createElement("div"); scrim.id = "moreScrim"; scrim.setAttribute("aria-hidden", "true");
        scrim.addEventListener("click", function(){ close(true); });
        wrap.appendChild(scrim);
      }
      menu.classList.add("open"); scrim.classList.add("on"); menu.scrollTop = 0;
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.remove("hidebar");
      var first = focusables()[0];
      if (first) first.focus({ preventScroll: true });
    }
    /* back: hand focus to the ⋯ button (a key, the scrim, the handle or an item did it) */
    function close(back){
      if (!isOpen()) return;
      menu.classList.remove("open"); if (scrim) scrim.classList.remove("on");
      btn.setAttribute("aria-expanded", "false");
      if (back) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", function(e){ e.stopPropagation(); if (isOpen()) close(); else open(); });
    document.addEventListener("click", function(e){ if (isOpen() && !e.target.closest("#moreWrap")) close(); });
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape" || !isOpen()) return;
      e.preventDefault(); e.stopImmediatePropagation(); close(true);
    });
    /* arrows move through the items (wrapping), Home and End jump, Tab leaves and closes */
    menu.addEventListener("keydown", function(e){
      var list = focusables(), n = list.length, i = list.indexOf(document.activeElement), to = null;
      if (!n) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") to = list[(i + 1) % n];
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = list[i < 0 ? n - 1 : (i - 1 + n) % n];
      else if (e.key === "Home") to = list[0];
      else if (e.key === "End") to = list[n - 1];
      else if (e.key === "Tab"){ close(); return; }
      else return;
      e.preventDefault(); e.stopPropagation(); to.focus();
    });
    dragToClose(menu, [menu], function(){ close(true); }, isOpen, ".menu-grab, .menu-head");
    /* the menu hangs from the bar, which slides away on a scroll: close rather than drift off */
    window.addEventListener("scroll", function(){ if (isOpen()) close(); }, { passive: true });
    var narrow = window.matchMedia ? window.matchMedia("(max-width: 560px)") : null;
    if (narrow && narrow.addEventListener) narrow.addEventListener("change", function(){ close(); });
    window.llMenu = { open: open, close: close, isOpen: isOpen, items: function(){ return items.slice(); } };
    return { add: add, close: close, open: open, isOpen: isOpen };
  })();

  var Library = (function(){
    var DB_NAME = "lamplight", DB_VERSION = 5;
    var dbp = null, books = [], positions = {}, current = null, pending = null, saveTimer = null, titleQueue = null;
    var ready = { doc: false, pdfPages: {} };

    function db(){
      if (dbp) return dbp;
      dbp = new Promise(function(resolve, reject){
        if (!window.indexedDB){ reject(new Error("no indexedDB")); return; }
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function(){
          var d = req.result;
          if (!d.objectStoreNames.contains("books")){
            var st = d.createObjectStore("books", { keyPath: "id" });
            st.createIndex("opened", "opened");
          }
          if (!d.objectStoreNames.contains("positions")) d.createObjectStore("positions", { keyPath: "id" });
          if (!d.objectStoreNames.contains("marks")){
            var mk = d.createObjectStore("marks", { keyPath: "key" });
            mk.createIndex("doc", "doc");
          }
          if (!d.objectStoreNames.contains("translations")) d.createObjectStore("translations", { keyPath: "key" });
          /* read-aloud audio clips (ElevenLabs) and the voices cast for each document's characters */
          if (!d.objectStoreNames.contains("audio")){
            var au = d.createObjectStore("audio", { keyPath: "key" });
            au.createIndex("doc", "docId");
          }
          if (!d.objectStoreNames.contains("cast")) d.createObjectStore("cast", { keyPath: "docId" });
          /* the reading journal: one entry per book finished (a re-read is a new one), kept apart from
             the library so that clearing the library keeps it (see Journal) */
          if (!d.objectStoreNames.contains("journal")){
            var jr = d.createObjectStore("journal", { keyPath: "id" });
            jr.createIndex("book", "book");
          }
        };
        /* another tab is installing a newer version: let go of the database so it can */
        req.onblocked = function(){ try { Marks.toast(_t("Close other Lamplight tabs to finish updating")); } catch(_){} };
        req.onsuccess = function(){
          var d = req.result;
          d.onversionchange = function(){
            d.close(); dbp = null;
            try { Marks.toast(_t("Lamplight was updated in another tab \u2014 reload to keep saving")); } catch(_){}
          };
          resolve(d);
        };
        req.onerror = function(){ reject(req.error); };
      });
      dbp.catch(function(){ dbp = null; });
      return dbp;
    }
    function tx(store, mode, fn){
      return db().then(function(d){
        return new Promise(function(resolve, reject){
          var t = d.transaction(store, mode), st = t.objectStore(store), out;
          try { out = fn(st); } catch(err){ reject(err); return; }
          t.oncomplete = function(){ resolve(out && out.result !== undefined ? out.result : out); };
          t.onerror = function(){ reject(t.error); };
          t.onabort = function(){ reject(t.error); };
        });
      });
    }
    function getAll(store){
      return tx(store, "readonly", function(st){ return st.getAll(); });
    }

    function sha256(buf){
      if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
      return crypto.subtle.digest("SHA-256", buf).then(function(h){
        return Array.prototype.map.call(new Uint8Array(h), function(b){ return b.toString(16).padStart(2, "0"); }).join("");
      });
    }
    function idFor(file){
      return file.arrayBuffer().then(sha256).then(function(h){
        return h || ("f-" + file.name + "-" + file.size + "-" + (file.lastModified || 0));
      });
    }
    function typeOf(name){
      var ext = (name.split(".").pop() || "").toLowerCase();
      return { pdf:"PDF", epub:"EPUB", docx:"DOCX", md:"MD", markdown:"MD", html:"HTML", htm:"HTML", txt:"TXT", text:"TXT" }[ext] || ext.toUpperCase();
    }

    /* ---- load what we have ---- */
    var loaded = Promise.all([getAll("books"), getAll("positions")]).then(function(r){
      books = (r[0] || []).sort(function(a, b){ return (b.opened || 0) - (a.opened || 0); });
      (r[1] || []).forEach(function(p){ positions[p.id] = p; });
      render();
      if (Tabs) Tabs.render();     /* the tabs name their books by the titles kept here */
    }).catch(function(err){ console.warn("library unavailable", err); });

    /* ---- position capture ---- */
    /* everything stuck to the top of the window: the bar, plus the settings sheet while it is open */
    function headerHeight(){
      if (document.body.classList.contains("immersive")) return 0;
      var head = document.querySelector("header"), sheet = $("#sheet");
      /* a phone's settings sheet rises from the bottom instead (position: fixed): nothing more at the top */
      return (head ? head.offsetHeight : 0) + (sheet && sheet.classList.contains("open") && getComputedStyle(sheet).position !== "fixed" ? sheet.offsetHeight : 0);
    }
    var charOffsetOf = Anchor.offsetOf, rangeAtOffset = Anchor.rangeAt;
    function topCharOffset(){
      var docEl = $("#doc");
      if (state.mode === "doc" && state.flow === "pages"){ var po = pageTopOffset(); if (po !== null) return po; }
      if (!document.caretRangeFromPoint && !document.caretPositionFromPoint) return null;
      var view = state.flow === "pages" ? $("#docView").getBoundingClientRect() : docEl.getBoundingClientRect();
      var y0 = state.flow === "pages" ? view.top + 4 : Math.max(view.top, headerHeight()) + 6;
      var xs = [view.left + 10, view.left + view.width / 2, view.left + view.width - 10];
      for (var dy = 0; dy < 60; dy += 12){
        for (var k = 0; k < xs.length; k++){
          var r = null;
          if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(xs[k], y0 + dy);
          else { var pp = document.caretPositionFromPoint(xs[k], y0 + dy); if (pp){ r = document.createRange(); r.setStart(pp.offsetNode, pp.offset); } }
          if (!r) continue;
          var n = r.startContainer;
          if (n.nodeType !== 3 || !n.parentNode || !n.parentNode.closest || !n.parentNode.closest("#doc")) continue;
          var off = charOffsetOf(n, r.startOffset);
          if (off !== null) return off;
        }
      }
      /* no text of #doc up there: a translation (translate.js) may be standing in for its hidden original — it
         carries where that original starts and how long it is, and the spot is read off in proportion */
      for (var dy2 = 0; dy2 < 60; dy2 += 12){
        var hit = document.elementFromPoint(xs[1], y0 + dy2), h = hit && hit.closest ? hit.closest("#doc .ll-tr[data-ll-off]") : null;
        if (!h) continue;
        var hb = h.getBoundingClientRect(), f = hb.height ? Math.max(0, Math.min(1, (y0 + dy2 - hb.top) / hb.height)) : 0;
        return (+h.getAttribute("data-ll-off") || 0) + Math.floor(f * (+h.getAttribute("data-ll-len") || 0));
      }
      return null;
    }
    /* the last character on screen: the page's end in Pages flow, the text at the foot of the window in Scroll flow
       (what the read-aloud bar or the pager covers is skipped, from the bottom up); null when none is found */
    function bottomCharOffset(){
      if (state.mode !== "doc") return null;
      if (state.flow === "pages") return pageEndOffset();
      if (!document.caretRangeFromPoint && !document.caretPositionFromPoint) return null;
      var view = $("#doc").getBoundingClientRect(), y0 = Math.min(window.innerHeight, view.bottom) - 6;
      var xs = [view.left + view.width - 10, view.left + view.width / 2, view.left + 10];
      for (var dy = 0; dy < 240 && y0 - dy > headerHeight(); dy += 16){
        for (var k = 0; k < xs.length; k++){
          var r = null;
          if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(xs[k], y0 - dy);
          else { var pp = document.caretPositionFromPoint(xs[k], y0 - dy); if (pp){ r = document.createRange(); r.setStart(pp.offsetNode, pp.offset); } }
          if (!r) continue;
          var n = r.startContainer;
          if (n.nodeType !== 3 || !n.parentNode || !n.parentNode.closest || !n.parentNode.closest("#doc")) continue;
          var off = charOffsetOf(n, r.startOffset);
          if (off !== null) return off;
        }
      }
      return null;
    }
    function currentPdfPage(){
      if (state.flow === "pages") return state.pdfPageNum;
      /* the page that fills the upper part of the screen (a sliver of the previous one doesn't count) */
      var head = headerHeight(), line = head + (window.innerHeight - head) * 0.4, pages = $("#pdf").querySelectorAll(".pdf-page");
      for (var i = 0; i < pages.length; i++){
        if (pages[i].getBoundingClientRect().bottom > line) return +pages[i].dataset.page || (i + 1);
      }
      return state.pdfPageNum || 1;
    }
    function capture(){
      if (!current || (state.mode !== "doc" && state.mode !== "pdf")) return null;
      var pos = { id: current, mode: state.mode, flow: state.flow, frac: readFrac(), updated: Date.now() };
      if (state.mode === "doc"){
        /* speed reading: the word it is at is the place (the page behind the overlay is where it started, and the
           overlay would be hit-tested instead of the text) — kept when the app is left or killed with it open */
        var rs = Rsvp && Rsvp.offset ? Rsvp.offset() : null;
        pos.off = rs !== null ? rs : topCharOffset();
        pos.offEnd = rs !== null ? null : bottomCharOffset();     /* the recap's sessions reach to what was on screen, not only its top line */
        pos.total = $("#doc").textContent.length;
        if (rs !== null && pos.total > 0) pos.frac = Math.max(0, Math.min(1, rs / pos.total));
      } else {
        pos.pdfPage = currentPdfPage();
        pos.pdfPages = state.pdfDoc ? state.pdfDoc.numPages : 1;
        pos.frac = pos.pdfPages > 1 ? (pos.pdfPage - 1) / (pos.pdfPages - 1) : 0;
      }
      pos.pct = Math.round(Math.max(0, Math.min(1, pos.frac)) * 100);
      return pos;
    }
    function notePosition(){
      if (!current || pending) return;      /* don't save while a restore is still pending */
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePosition, 600);
    }
    function savePosition(){
      clearTimeout(saveTimer);
      var pos = capture();
      if (!pos) return;
      positions[pos.id] = pos;
      Recap.note(pos);          /* the reading sessions behind "Previously…" */
      tx("positions", "readwrite", function(st){ st.put(pos); }).catch(function(){});
    }
    function flush(){ if (current && !pending) savePosition(); }
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("pagehide", flush);

    /* ---- restore ---- */
    function tryRestore(){
      if (!pending) return;
      var pos = pending;
      if (state.mode === "doc" && pos.mode === "doc" && ready.doc){
        pending = null;
        if (pos.off !== null && pos.off !== undefined && revealOffset(pos.off)) return;
        if (pos.frac){
          if (state.flow === "pages") gotoPage(Math.round(pos.frac * (state.totalPages - 1)));
          else { var h = document.documentElement; window.scrollTo(0, pos.frac * (h.scrollHeight - h.clientHeight)); }
        }
      } else if (state.mode === "pdf" && pos.mode === "pdf" && state.pdfDoc){
        var n = Math.max(1, Math.min(pos.pdfPage || 1, state.pdfDoc.numPages));
        if (state.flow === "pages"){
          pending = null;
          if (state.pdfPageNum !== n){ state.pdfPageNum = n; renderPdfSingle(); }
        } else {
          var c = $("#pdf").querySelector('.pdf-page[data-page="' + n + '"]');
          if (c){ pending = null; window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - headerHeight() - 6)); }
        }
      } else if (!state.opening && (state.mode === "status" || state.mode === "empty")){
        /* opening failed — nothing to restore */
        pending = null;
      }
    }

    /* ---- hooks called by the reader ---- */
    function onOpen(file, opts, live){
      current = null; pending = null; titleQueue = null; ready = { doc: false, pdfPages: {} };
      clearTimeout(saveTimer);
      Marks.setDoc(null);
      loaded.then(function(){ return idFor(file); }).then(function(id){
        if (live && !live()) return;          /* another file was opened meanwhile */
        current = id;
        Marks.setDoc(id, file.name);
        var pos = positions[id];
        if (pos && !opts.fresh){ pending = pos; tryRestore(); }
        Journal.opened(id, pos && !opts.fresh ? pos : null, !!opts.fresh);   /* where this sitting starts: the "Finished" card waits for the reader to arrive at the end */
        var existing = books.filter(function(b){ return b.id === id; })[0];
        var rec = existing || { id: id, name: file.name, type: typeOf(file.name), size: file.size, added: Date.now(), blob: file };
        rec.opened = Date.now();
        if (titleQueue){ rec.title = titleQueue; titleQueue = null; }
        if (!existing) books.unshift(rec); else { books.splice(books.indexOf(existing), 1); books.unshift(rec); }
        /* the tab (and the bar) name the book by the title known for it, from before or from its text */
        Tabs.noteOpen(id, file.name, file);
        if (rec.title && live && live()) setFname(rec.title);
        Recap.check();          /* back after two hours or more: the recap card (once the text is in, too) */
        return tx("books", "readwrite", function(st){ st.put(rec); }).catch(function(err){
          console.warn("couldn't save to library", err);
          if (!existing){ books.splice(books.indexOf(rec), 1); }
        }).then(render);
      }).catch(function(err){ console.warn("library", err); });
    }
    function remember(file, id){
      loaded.then(function(){
        if (books.some(function(b){ return b.id === id; })) return;
        var rec = { id: id, name: file.name, type: typeOf(file.name), size: file.size, added: Date.now(), opened: Date.now() - 1, blob: file };
        books.push(rec); books.sort(function(a, b){ return (b.opened || 0) - (a.opened || 0); });
        tx("books", "readwrite", function(st){ st.put(rec); }).then(render).catch(function(){});
        /* named by its own title before it is ever opened (the tab too) */
        peekTitle(file).then(function(t){
          if (!t || rec.title || books.indexOf(rec) < 0) return;
          rec.title = t; put(rec); render(); Tabs.render();
        });
      });
    }
    function setTitle(title){
      if (!title) return;
      if (!current){ titleQueue = title; return; }
      var b = books.filter(function(x){ return x.id === current; })[0];
      if (b && b.title !== title){ b.title = title; tx("books", "readwrite", function(st){ st.put(b); }).catch(function(){}); render(); Tabs.render(); }
    }
    function titleOf(id){ return bookName(byId(id)); }
    function docReady(){ ready.doc = true; ready.pdfPages = {}; tryRestore(); Marks.docReady(); Recap.check(); }
    function pdfReady(){ tryRestore(); Recap.check(); }
    function pdfPageReady(n){ ready.pdfPages[n] = true; tryRestore(); Recap.check(); }

    /* ---- the list on the start screen ---- */
    function ago(t){
      var d = Date.now() - t, m = Math.round(d / 60000);
      if (m < 2) return _t("just now");
      if (m < 60) return _t("{n} min ago", { n: m });
      var h = Math.round(m / 60);
      if (h < 24) return _tn(h, "1 hour ago", "{n} hours ago");
      var days = Math.round(h / 24);
      if (days === 1) return _t("yesterday");
      if (days < 30) return _t("{n} days ago", { n: days });
      return I18N.lang() === "nl" ? I18N.date(t) : new Date(t).toLocaleDateString(I18N.locale());
    }
    function escapeHtml(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function cssEsc(s){ return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }
    /* the start screen: a Continue card for the book that is up next, then every book as a card */
    function pctOf(b){ var pos = positions[b.id]; return pos ? pos.pct : 0; }
    function put(rec){ tx("books", "readwrite", function(st){ st.put(rec); }).catch(function(){}); }
    function byId(id){ return books.filter(function(x){ return x.id === id; })[0]; }

    /* ---- pinned books: a short list kept at the top, in the order they are waiting in ---- */
    function pinnedList(){
      return books.filter(function(b){ return !!b.pinned; })
        .sort(function(a, b){ return (a.order || 0) - (b.order || 0) || (a.pinned || 0) - (b.pinned || 0); });
    }
    function setPinned(id, on){
      var b = byId(id);
      if (!b || !!b.pinned === !!on) return;
      if (on){
        var top = pinnedList();
        b.pinned = Date.now();
        b.order = top.length ? (top[top.length - 1].order || 0) + 1 : 1;
      } else { delete b.pinned; delete b.order; }
      put(b); render();
    }
    function togglePin(id){ var b = byId(id); if (b) setPinned(id, !b.pinned); }
    /* one place up or down the waiting list; the orders are renumbered so they stay 1, 2, 3… */
    function movePinned(id, dir){
      var top = pinnedList(), i = -1;
      top.forEach(function(b, k){ if (b.id === id) i = k; });
      var j = i + dir;
      if (i < 0 || j < 0 || j >= top.length) return;
      top.splice(j, 0, top.splice(i, 1)[0]);
      top.forEach(function(b, k){ if (b.order !== k + 1){ b.order = k + 1; put(b); } });
      render();
      refocus(id, '[data-move="' + (dir < 0 ? "up" : "down") + '"]');
    }
    /* the list is rebuilt whole on every change: put the focus back where it was */
    function refocus(id, sel){
      var row = $("#libList").querySelector('.lib-item[data-id="' + cssEsc(id) + '"]');
      if (!row) return;
      var b = row.querySelector(sel);
      if (!b || b.disabled) b = row.querySelector(".lib-open");
      if (b) b.focus({ preventScroll: true });
    }
    /* the book to carry on with: the first pinned one, else the one opened last */
    function upNext(){ var top = pinnedList(); return top.length ? top[0] : books[0]; }
    /* pinned and not opened since it was pinned: it is waiting, not half-read */
    function waiting(b){ return !!(b && b.pinned) && !(b.opened > b.pinned); }
    /* "about 2 h 10 min left · ≈ 4 more evenings", from the shared estimate in Stats */
    function forecastOf(b){
      try { return (window.llStats && window.llStats.forecast) ? window.llStats.forecast(b, positions[b.id]) : ""; }
      catch(_){ return ""; }
    }
    /* in the reading journal: a small check and the latest stars (Journal.badge), in place of the "Finished" pill */
    function finOf(b){ try { return Journal.badge(b.id); } catch(_){ return ""; } }
    /* a card is a plain wrapper holding sibling buttons: the book (opens it), move up and down
       for a pinned one, the pin and the remove; nesting one inside another would give the card
       every one of their names */
    function item(b, idx, of){
      var pct = pctOf(b), name = escapeHtml(bookName(b)), done = pct >= 98, pinned = !!b.pinned;
      var id = escapeHtml(b.id), left = forecastOf(b), fin = finOf(b);
      function move(dir, label, named, icon, off){
        return '<button type="button" class="lib-move" data-move="' + dir + '" data-id="' + id + '" title="' + label +
          '" aria-label="' + named + '"' + (off ? " disabled" : "") + '>' + icon + '</button>';
      }
      return '<div class="lib-item' + (pinned ? " pinned" : "") + '" data-id="' + id + '">' +
        '<button type="button" class="lib-open" data-id="' + id + '" title="' + escapeHtml(b.name) + '">' +
        '<span class="lib-type">' + escapeHtml(b.type) + '</span>' +
        '<span class="lib-main"><span class="lib-name">' + name + '</span>' +
        '<span class="lib-meta"><span class="lib-bar"><i style="width:' + pct + '%"></i></span><span>' + (pct ? pct + "%" : _t("new")) + ' · ' + ago(b.opened) + '</span>' +
        (fin || (done ? '<span class="lib-done">' + _t("Finished") + '</span>' : '')) + '</span>' +
        (left ? '<span class="lib-left">' + escapeHtml(left) + '</span>' : '') + '</span>' +
        '</button>' +
        (pinned ? move("up", _t("Move up"), _t("Move up {name}", { name: name }), ICONS.chevronU, idx === 0) +
                  move("down", _t("Move down"), _t("Move down {name}", { name: name }), ICONS.chevronD, idx === of - 1) : '') +
        '<button type="button" class="lib-pin' + (pinned ? " on" : "") + '" data-pin="' + id + '" aria-pressed="' + pinned +
        '" title="' + (pinned ? _t("Unpin from the top") : _t("Pin to the top")) + '" aria-label="' +
        (pinned ? _t("Unpin {name} to the top", { name: name }) : _t("Pin {name} to the top", { name: name })) + '">' + ICONS.pin + '</button>' +
        '<button type="button" class="lib-x" data-x="' + id + '" title="' + _t("Remove from library") + '" aria-label="' + _t("Remove {name} from the library", { name: name }) + '">' + ICONS.close + '</button>' +
        '</div>';
    }
    /* a finished book starts again from the beginning; the words on the card say so */
    function continueHtml(b){
      var pct = pctOf(b), name = escapeHtml(bookName(b)), again = pct >= 98, left = forecastOf(b);
      var lead = again ? _t("Read again") : waiting(b) ? _t("Up next") : _t("Continue reading");
      return '<button type="button" id="continueCard" data-file="' + escapeHtml(b.name) + '" title="' + (again ? _t("Read {name} again", { name: name }) : _t("Continue reading {name}", { name: name })) + '">' +
        '<span class="cc-ring" style="--p:' + pct + '%" aria-hidden="true"><span>' + (pct ? pct + "%" : _t("new")) + '</span></span>' +
        '<span class="cc-main"><span class="label">' + lead + '</span><span class="cc-title">' + name + '</span>' +
        '<span class="cc-meta"><span class="lib-type">' + escapeHtml(b.type) + '</span><span>' + (pct ? pct + "%" : _t("new")) + ' · ' + ago(b.opened) + '</span>' +
        (left ? '<span class="cc-left">' + escapeHtml(left) + '</span>' : '') + '</span></span>' +
        '<span class="cc-go">' + (again ? _t("Start again") : _t("Continue")) + ICONS.goOn + '</span>' +
        '</button>';
    }
    function render(){
      var list = $("#libList");
      if (!list) return;
      var lib = $("#library"), cont = $("#continue"), on = state.mode === "empty" && books.length > 0;
      document.body.classList.toggle("has-books", books.length > 0);
      lib.classList.toggle("show", on);
      cont.classList.toggle("show", on);
      $("#libCount").textContent = books.length > 1 ? String(books.length) : "";
      var top = pinnedList(), rest = books.filter(function(b){ return !b.pinned; }).slice(0, 60), h = "";
      if (top.length){
        h += '<div class="lib-group label">' + _t("Pinned") + '</div>' + top.map(function(b, i){ return item(b, i, top.length); }).join("");
        if (rest.length) h += '<div class="lib-group label">' + _t("Recent") + '</div>';
      }
      h += rest.map(function(b){ return item(b, -1, 0); }).join("");
      list.innerHTML = h;
      /* the heading over the whole list: "Recent" until something is pinned above it */
      var head = lib.querySelector(".lib-head .label");
      if (head && head.firstChild) head.firstChild.nodeValue = (top.length ? _t("Library") : _t("Recent")) + " ";
      var next = upNext();
      cont.innerHTML = next ? continueHtml(next) : "";
    }
    $("#continue").addEventListener("click", function(e){
      if (!e.target.closest("#continueCard")) return;
      var b = upNext();
      if (b) openId(b.id, pctOf(b) >= 98);
    });
    /* native buttons deliver Enter and Space as clicks, so one listener covers keys and pointers */
    $("#libList").addEventListener("click", function(e){
      var pin = e.target.closest(".lib-pin");
      if (pin){ togglePin(pin.dataset.pin); refocus(pin.dataset.pin, ".lib-pin"); return; }
      var mv = e.target.closest(".lib-move");
      if (mv){ movePinned(mv.dataset.id, mv.dataset.move === "up" ? -1 : 1); return; }
      var x = e.target.closest(".lib-x");
      if (x){ removeByHand(x.dataset.x, x.contains(document.activeElement) || x === document.activeElement); return; }
      var it = e.target.closest(".lib-open");
      if (it) openId(it.dataset.id);
    });
    /* p pins or unpins the card the focus is on */
    $("#libList").addEventListener("keydown", function(e){
      if ((e.key !== "p" && e.key !== "P") || e.ctrlKey || e.metaKey || e.altKey) return;
      var it = e.target.closest && e.target.closest(".lib-item");
      if (!it) return;
      e.preventDefault(); e.stopPropagation();
      var id = it.dataset.id, onPin = !!e.target.closest(".lib-pin");
      togglePin(id);
      refocus(id, onPin ? ".lib-pin" : ".lib-open");
    });
    /* everything this device holds for the library; translations are a separate store */
    function wipe(alsoTranslations){
      books = []; positions = {};
      Tabs.clear();
      var stores = ["books", "positions", "marks", "audio", "cast"].concat(alsoTranslations ? ["translations"] : []);
      var jobs = stores.map(function(s){ return tx(s, "readwrite", function(st){ st.clear(); }).catch(function(){}); });
      render();
      return Promise.all(jobs);
    }
    $("#libClear").addEventListener("click", function(){
      /* one book: the Dutch says it in the singular (the English stays as it always was) */
      if (!books.length || !confirm(_tc(books.length === 1 ? "one" : "", "Remove all {n} files and reading positions from this device? Your reading journal is kept.", { n: books.length }))) return;
      wipe(false);
      show("empty");
    });
    /* books read to the end: taken out with their positions and notes, like a single remove */
    function removeFinished(){
      var done = books.filter(function(b){ return pctOf(b) >= 98; });
      done.forEach(function(b){ remove(b.id); });
      return done.length;
    }
    /* fresh: open at the beginning instead of the saved place (a finished book read again) */
    function openId(id, fresh){
      var b = books.filter(function(x){ return x.id === id; })[0];
      if (!b || !b.blob) return;
      var f = b.blob;
      if (!(f instanceof File)){ try { f = new File([b.blob], b.name, { type: b.blob.type }); } catch(_){ f = b.blob; f.name = b.name; } }
      openFile(f, { fromLibrary: true, fresh: !!fresh });
    }
    /* a document's cached read-aloud clips and its voice cast (the index-cursor pattern of Marks.forget) */
    function forgetAudio(id){
      tx("audio", "readwrite", function(st){
        var idx = st.index("doc").openKeyCursor(IDBKeyRange.only(id));
        idx.onsuccess = function(){ var c = idx.result; if (c){ st.delete(c.primaryKey); c.continue(); } };
      }).catch(function(){});
      tx("cast", "readwrite", function(st){ st.delete(id); }).catch(function(){});
    }
    function remove(id){
      books = books.filter(function(x){ return x.id !== id; });
      delete positions[id];
      Marks.forget(id);
      Tabs.drop(id);
      forgetAudio(id);
      Recap.forget(id);
      tx("books", "readwrite", function(st){ st.delete(id); }).catch(function(){});
      tx("positions", "readwrite", function(st){ st.delete(id); }).catch(function(){});
      if (current === id) current = null;
      render();
      if (!books.length) show("empty");
    }
    /* the × on a card: the book leaves the list at once and is removed for good 4 s later, unless the
       toast's Undo brings it back (the page being left settles it at once) */
    var pendingRemoval = null;
    function commitRemoval(){
      if (!pendingRemoval) return;
      var p = pendingRemoval; pendingRemoval = null; clearTimeout(p.timer);
      if (books.indexOf(p.book) < 0){ books.push(p.book); remove(p.book.id); }
    }
    function removeByHand(id, keyboard){
      commitRemoval();
      var b = byId(id); if (!b) return;
      var i = books.indexOf(b), row = $("#libList").querySelector('.lib-item[data-id="' + cssEsc(id) + '"]');
      var next = row && (row.nextElementSibling && row.nextElementSibling.classList.contains("lib-item") ? row.nextElementSibling : row.previousElementSibling);
      var nextId = next && next.classList.contains("lib-item") ? next.dataset.id : null;
      books.splice(i, 1);
      render();
      if (keyboard){ if (nextId) refocus(nextId, ".lib-open"); else if ($("#libOpen").offsetParent) $("#libOpen").focus(); }
      pendingRemoval = { book: b, timer: setTimeout(commitRemoval, 4300) };
      Marks.toast(_t("Removed \u201C{name}\u201D", { name: bookName(b) }), { undo: function(){
        if (!pendingRemoval || pendingRemoval.book !== b) return;
        clearTimeout(pendingRemoval.timer); pendingRemoval = null;
        books.splice(Math.min(i, books.length), 0, b);
        render();
        refocus(b.id, ".lib-open");
      } });
    }
    window.addEventListener("pagehide", commitRemoval);
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") commitRemoval(); });
    function home(){
      flush();
      abandonOpen();
      Speak.stop(); Auto.stop(); Ruler.set(false); Zen.exit(); Side.close(); Pop.close(true);
      if (state.mode === "doc" || state.mode === "pdf"){
        document.body.classList.remove("hidebar", "immersive");
        window.scrollTo(0, 0);
      }
      setSheet(false);
      setFname("");
      Section.reset();
      $("#progressInfo").classList.remove("on");   /* the readout belongs to the document just left */
      document.title = "lamplight — reader";
      show("empty");
      render();
    }

    return { tx: tx, headerHeight: headerHeight, topCharOffset: topCharOffset, currentPdfPage: currentPdfPage, idFor: idFor, openId: openId,
             books: function(){ return books; }, remember: remember,
             pin: setPinned, togglePin: togglePin, move: movePinned, pinned: pinnedList, upNext: upNext,
             removeFinished: removeFinished, wipe: wipe,
             onOpen: onOpen, docReady: docReady, pdfReady: pdfReady, pdfPageReady: pdfPageReady, notePosition: notePosition,
             flush: flush, home: home, count: function(){ return books.length; }, setTitle: setTitle, titleOf: titleOf, render: render, forgetAudio: forgetAudio,
             ready: loaded, currentId: function(){ return current; }, positionFor: function(id){ return positions[id]; },
             restoring: function(){ return !!pending; },
             _debug: function(){ return { pending: pending, ready: ready, current: current }; } };
  })();

  /* ============================================================
     Marks — highlights, bookmarks and notes, per document, exportable
     ============================================================ */
  var Marks = (function(){
    var docId = null, docName = "", list = [], loaded = false, rendered = false, loadGen = 0;
    var COLORS = ["accent", "sun", "leaf", "rose"];
    var COLOR_WORDS = { accent: "Default", sun: "Yellow", leaf: "Green", rose: "Pink" };
    var pop = $("#markPop"), popKey = null;

    /* ---- what the four colours mean to this reader; three are suggested, all are editable ---- */
    var LEGEND_KEY = "ll_mark_legend", LEGEND_DEFAULT = { accent: "", sun: "Important", leaf: "Vocabulary", rose: "Question" };
    var legend = (function(){
      var out = Object.assign({}, LEGEND_DEFAULT), o = null;
      try { o = JSON.parse(Store.get(LEGEND_KEY) || "null"); } catch(_){}
      if (o && typeof o === "object") COLORS.forEach(function(c){ if (typeof o[c] === "string") out[c] = o[c].trim().slice(0, 40); });
      return out;
    })();
    /* a colour's meaning as shown: the three suggested ones in the interface's language until the
       reader renames them; the colour's own word in the same way */
    function legendText(c){ return legend[c] && legend[c] === LEGEND_DEFAULT[c] ? _t(legend[c]) : legend[c]; }
    function colorWord(c){ return COLOR_WORDS[c] ? _t(COLOR_WORDS[c]) : c; }
    function colorLabel(c){ return legendText(c) || colorWord(c); }
    /* a bookmark's words: a PDF's is its page, kept as "Page 12" and shown in the interface's language */
    function labelOf(m){ return m.pdfPage && m.label === "Page " + m.pdfPage ? _t("Page {n}", { n: m.pdfPage }) : (m.label || ""); }
    function setLegend(c, name){
      if (COLORS.indexOf(c) < 0) return;
      legend[c] = String(name || "").trim().slice(0, 40);
      Store.set(LEGEND_KEY, JSON.stringify(legend));
    }

    /* ---- #tags typed into a note: letters, digits, hyphens and underscores ---- */
    var TAG = /#([A-Za-z0-9][A-Za-z0-9_-]*)/g;
    function tagsOf(m){
      var out = [], s = String((m && m.note) || ""), t;
      TAG.lastIndex = 0;
      while ((t = TAG.exec(s))){ var k = t[1].toLowerCase(); if (out.indexOf(k) < 0) out.push(k); }
      return out;
    }
    /* every tag in use with how many marks carry it, in the order they first appear */
    function tagCounts(){
      var order = [], counts = {};
      list.forEach(function(m){
        tagsOf(m).forEach(function(t){ if (counts[t] === undefined){ counts[t] = 0; order.push(t); } counts[t]++; });
      });
      return order.map(function(t){ return { tag: t, n: counts[t] }; });
    }

    function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function pctOf(m){
      if (m.pdfPage && state.pdfDoc) return Math.round(((m.pdfPage - 1) / Math.max(1, state.pdfDoc.numPages - 1)) * 100);
      if (typeof m.start === "number"){ var total = Anchor.textLength() || 1; return Math.round((m.start / total) * 100); }
      return m.pct || 0;
    }
    function sortKey(m){ return typeof m.start === "number" ? m.start : (m.pdfPage || 0) * 1e9; }

    /* ---- storage ---- */
    function setDoc(id, name){
      docId = id; docName = name || docName; list = []; loaded = false; rendered = false;
      var gen = ++loadGen;
      if (!id) return;
      Library.tx("marks", "readonly", function(st){ return st.index("doc").getAll(id); }).then(function(rows){
        if (gen !== loadGen) return;
        list = (rows || []).sort(function(a, b){ return sortKey(a) - sortKey(b); });
        loaded = true;
        if (state.mode === "doc") apply();
        if (Side.is("marks")) openPanel();
      }).catch(function(){ loaded = true; });
    }
    function save(m){ Library.tx("marks", "readwrite", function(st){ st.put(m); }).catch(function(){}); }
    function del(m){ Library.tx("marks", "readwrite", function(st){ st.delete(m.key); }).catch(function(){}); }
    /* every mark on this device (the Storage panel); the open document loses its highlights too */
    function clearAll(){
      list = [];
      return Library.tx("marks", "readwrite", function(st){ st.clear(); }).then(function(){
        if (state.mode === "doc") apply();
        refreshPanel();
      }).catch(function(){});
    }
    function forget(id){ Library.tx("marks", "readwrite", function(st){
      var idx = st.index("doc").openKeyCursor(IDBKeyRange.only(id));
      idx.onsuccess = function(){ var c = idx.result; if (c){ st.delete(c.primaryKey); c.continue(); } };
    }).catch(function(){}); }

    /* ---- drawing highlights in the text ---- */
    function unwrapAll(){
      var doc = $("#doc");
      Array.prototype.slice.call(doc.querySelectorAll("mark.ll-mark")).forEach(function(mk){
        var p = mk.parentNode; while (mk.firstChild) p.insertBefore(mk.firstChild, mk); p.removeChild(mk);
      });
      doc.normalize();
      Anchor.invalidate();
    }
    /* wrap every highlight in one pass: the node list and start offsets are kept up to
       date locally while nodes are split, so a document with many marks stays quick */
    function wrapAll(marks){
      var nodes = Anchor.textNodes().slice(), starts = nodes.map(function(n, i){ return Anchor.startOf(i); });
      marks.forEach(function(m){
        if (!(m.end > m.start) || !nodes.length) return;
        var lo = 0, hi = nodes.length - 1;                     /* last node starting at or before the mark */
        while (lo < hi){ var mid = (lo + hi + 1) >> 1; if (starts[mid] <= m.start) lo = mid; else hi = mid - 1; }
        for (var i = lo; i < nodes.length && starts[i] < m.end; i++){
          var n = nodes[i], len = n.length, a = Math.max(0, m.start - starts[i]), b = Math.min(len, m.end - starts[i]);
          if (b <= a || !/\S/.test(n.textContent.slice(a, b))) continue;
          var target = n;
          if (b < len){ nodes.splice(i + 1, 0, target.splitText(b)); starts.splice(i + 1, 0, starts[i] + b); }
          if (a > 0){ target = target.splitText(a); nodes.splice(i + 1, 0, target); starts.splice(i + 1, 0, starts[i] + a); i++; }
          var mk = document.createElement("mark");
          mk.className = "ll-mark" + (m.note ? " noted" : "");
          mk.dataset.key = m.key; if (m.color && m.color !== "accent") mk.dataset.color = m.color;
          target.parentNode.insertBefore(mk, target); mk.appendChild(target);
        }
      });
      Anchor.invalidate();
    }
    /* search keeps live ranges on the text; drop them while the DOM is rewritten and paint again after */
    function apply(){
      if (state.mode !== "doc") return;
      if (window.Search) Search.clearPaint();
      unwrapAll();
      wrapAll(list.filter(function(m){ return m.kind === "highlight" && typeof m.start === "number"; }));
      rendered = true;
      if (window.Search) Search.refresh();
    }
    /* one new highlight: wrap just that one instead of redrawing them all */
    function applyOne(m){
      if (state.mode !== "doc") return;
      if (!rendered){ apply(); return; }
      if (window.Search) Search.clearPaint();
      wrapAll([m]);
      if (window.Search) Search.refresh();
    }
    /* remove one highlight's <mark> elements and merge the text back */
    function unwrapOne(m){
      if (state.mode !== "doc") return;
      if (window.Search) Search.clearPaint();
      var parents = [];
      Array.prototype.slice.call($("#doc").querySelectorAll('mark.ll-mark[data-key="' + CSS.escape(m.key) + '"]')).forEach(function(mk){
        var p = mk.parentNode; while (mk.firstChild) p.insertBefore(mk.firstChild, mk); p.removeChild(mk);
        if (parents.indexOf(p) < 0) parents.push(p);
      });
      parents.forEach(function(p){ p.normalize(); });
      Anchor.invalidate();
      if (window.Search) Search.refresh();
    }
    function restyle(m){
      Array.prototype.slice.call($("#doc").querySelectorAll('mark.ll-mark[data-key="' + CSS.escape(m.key) + '"]')).forEach(function(mk){
        mk.classList.toggle("noted", !!m.note);
        if (m.color && m.color !== "accent") mk.dataset.color = m.color; else delete mk.dataset.color;
      });
    }
    function docReady(){ rendered = false; if (loaded) apply(); }

    /* ---- creating marks ---- */
    function textOf(start, end){
      var r = Anchor.rangeBetween(start, end);
      return r ? r.toString().replace(/\s+/g, " ").trim() : "";
    }
    function addHighlight(start, end, note, color){
      if (!docId || state.mode !== "doc" || !(end > start)) return null;
      var m = { key: docId + ":" + uid(), doc: docId, kind: "highlight", start: start, end: end, text: textOf(start, end).slice(0, 2000), note: note || "", color: color || "accent", created: Date.now() };
      list.push(m); list.sort(function(a, b){ return sortKey(a) - sortKey(b); });
      save(m); applyOne(m); refreshPanel();
      return m;
    }
    function selectionOffsets(){
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0);
      function pt(container, offset, isEnd){
        if (container.nodeType === 3) return Anchor.offsetOf(container, offset);
        /* the boundary sits between an element's children: for a start take the first text
           inside the next child, for an end the last text inside the previous one; an
           empty element or a boundary at the very edge walks on to the neighbouring text */
        var kids = container.childNodes, i = isEnd ? offset - 1 : offset;
        while (i >= 0 && i < kids.length){
          var k = kids[i];
          if (k.nodeType === 3) return Anchor.offsetOf(k, isEnd ? k.length : 0);
          var w = document.createTreeWalker(k, NodeFilter.SHOW_TEXT), t = null, last = null;
          while ((t = w.nextNode())){ if (!isEnd) return Anchor.offsetOf(t, 0); last = t; }
          if (last) return Anchor.offsetOf(last, last.length);
          i += isEnd ? -1 : 1;
        }
        /* the boundary is at the container's own edge: use the text just outside it */
        var w2 = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT), t2;
        w2.currentNode = container;
        if (isEnd){ while ((t2 = w2.previousNode())){ if (!container.contains(t2)) return Anchor.offsetOf(t2, t2.length); } }
        else { while ((t2 = w2.nextNode())){ if (!container.contains(t2)) return Anchor.offsetOf(t2, 0); } }
        return null;
      }
      var doc = $("#doc");
      if (!doc.contains(r.startContainer) || !doc.contains(r.endContainer)) return null;
      var a = pt(r.startContainer, r.startOffset, false), b = pt(r.endContainer, r.endOffset, true);
      if (a === null || b === null || b <= a) return null;
      return { start: a, end: b };
    }
    function highlightSelection(note){
      var o = selectionOffsets();
      if (!o) return null;
      var m = addHighlight(o.start, o.end, note);
      try { window.getSelection().removeAllRanges(); } catch(_){}
      return m;
    }
    function addBookmark(){
      if (!docId || (state.mode !== "doc" && state.mode !== "pdf")) return null;
      var m = { key: docId + ":" + uid(), doc: docId, kind: "bookmark", note: "", created: Date.now() };
      if (state.mode === "pdf"){
        m.pdfPage = Library.currentPdfPage();
        m.label = "Page " + m.pdfPage;
        if (list.some(function(x){ return x.kind === "bookmark" && x.pdfPage === m.pdfPage; })) { toast(_t("Already bookmarked")); return null; }
      } else {
        var off = Library.topCharOffset();
        if (off === null){ toast(_t("Couldn't find the spot")); return null; }
        /* the probe lands inside the first word when its first glyph is wide: back up to its start */
        var at = Anchor.rangeAt(off);
        if (at && at.startContainer.nodeType === 3){
          var tx = at.startContainer.textContent, ci = at.startOffset;
          while (ci > 0 && !/\s/.test(tx[ci - 1])) ci--;
          var o2 = Anchor.offsetOf(at.startContainer, ci); if (o2 !== null) off = o2;
        }
        m.start = off; m.end = off;
        var r = Anchor.rangeBetween(off, Math.min(Anchor.textLength(), off + 160));
        var words = (r ? r.toString() : "").replace(/\s+/g, " ").trim().split(" ").slice(0, 9).join(" ");
        m.label = words ? "\u201C" + words + "\u2026\u201D" : Math.round(readFrac() * 100) + "%";
        if (list.some(function(x){ return x.kind === "bookmark" && Math.abs((x.start || 0) - off) < 40; })) { toast(_t("Already bookmarked")); return null; }
      }
      m.pct = pctOf(m);
      list.push(m); list.sort(function(a, b){ return sortKey(a) - sortKey(b); });
      save(m); refreshPanel();
      /* a bookmark set by a stray tap in the ⋯ grid is one tap from gone */
      toast(_t("Bookmarked"), { undo: function(){ remove(m); toast(_t("Bookmark removed")); } });
      return m;
    }
    function remove(m){
      list = list.filter(function(x){ return x !== m; });
      del(m); if (m.kind === "highlight") unwrapOne(m); refreshPanel(); hidePop();
    }
    /* put a removed mark back as it was: kept again, and drawn again if it is a highlight in the open text */
    function restore(m){
      if (m.doc !== docId || list.indexOf(m) >= 0) return;
      list.push(m); list.sort(function(a, b){ return sortKey(a) - sortKey(b); });
      save(m);
      if (m.kind === "highlight") applyOne(m);
      refreshPanel();
    }
    /* the reader's own removal (the highlight's popover, the panel): with an Undo */
    function removeByHand(m){
      remove(m);
      toast(m.kind === "highlight" ? _t("Highlight removed") : m.kind === "bookmark" ? _t("Bookmark removed") : _t("Note removed"), { undo: function(){ restore(m); } });
    }
    function setNote(m, note){ m.note = note || ""; m.updated = Date.now(); save(m); if (m.kind === "highlight") restyle(m); refreshPanel(); }
    function setColor(m, color){ m.color = color; save(m); restyle(m); refreshPanel(); }
    function reveal(m){
      Side.close();
      if (Journal) Journal.jumped();
      if (m.pdfPage && state.mode === "pdf"){
        if (state.flow === "pages"){ state.pdfPageNum = m.pdfPage; renderPdfSingle(); }
        else { var c = $("#pdf").querySelector('.pdf-page[data-page="' + m.pdfPage + '"]'); if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 6)); }
      } else if (typeof m.start === "number") revealOffset(m.start);
    }

    /* ---- small toast ---- */
    var toastEl = null, toastTimer = null;
    /* ms: how long it stays (a longer message needs longer than the usual 1.8 s) */
    /* the toast's leading icon (app.css draws it at 18px in the toast's own colour): a warning for
       what went wrong, the bookmark, a check for what is done, else a note. It holds no text, so the
       toast's text (which screen readers and the tests read) is the message alone, and the icon and
       the words go in as one change */
    var TOAST_WARN = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
    /* the icon follows the message's English words: a Dutch message is read as the English it was
       translated from, and one with a name filled in (which the table has no single entry for) by its
       own Dutch words */
    var WARN_NL = /^(Kan|Kon)\b.*\bniet\b|niet beschikbaar|mislukt|^Voorlezen gestopt|^Niets|^Geen tekst|^Open eerst/,
        CHECK_NL = /^(Gekopieerd|Opgeslagen|Gemarkeerd|Verwijderd|Dagdoel)|gewist$|verwijderd$|hersteld$/;
    function toastIcon(msg){
      var en = _en(msg), nl = I18N.lang() === "nl" && en === msg;
      if (/^(Couldn|Speech stopped)|isn’t|not available|^Nothing|^No text|^Open a book/.test(en) || (nl && WARN_NL.test(msg))) return TOAST_WARN;
      if (/[Bb]ookmark/.test(en) || (nl && /[Bb]ladwijzer/.test(msg))) return ICONS.bookmark;
      if (/^(Copied|Saved|Highlighted|Removed|Daily goal)|cleared$|deleted$|removed$|reset$/.test(en) || (nl && CHECK_NL.test(msg))) return ICONS.check;
      return ICONS.info;
    }
    /* toast(msg, ms) or toast(msg, { undo: fn, ms }) / toast(msg, { action: "Mix…", run: fn }): a
       change of data (a bookmark added, a book or a highlight removed) offers to take it back. With
       a button the toast stays 4 s and takes taps; the button is a real one, so keys reach it too */
    function toast(msg, ms, act){
      if (ms && typeof ms === "object"){ act = ms; ms = act.ms; }
      if (act && act.undo){ act = { label: _t("Undo"), run: act.undo, ms: act.ms, isUndo: true }; }
      else if (act && act.action){ act = { label: act.action, run: act.run, ms: act.ms }; }
      if (!toastEl){ toastEl = document.createElement("div"); toastEl.id = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
      var ic = document.createElement("span"); ic.className = "toast-ic"; ic.setAttribute("aria-hidden", "true"); ic.innerHTML = toastIcon(String(msg)) || "";
      var parts = [ic, document.createTextNode(msg)];
      if (act && act.run){
        var b = document.createElement("button");
        b.type = "button"; b.className = "toast-act"; b.innerHTML = (act.isUndo || act.label === "Undo" ? ICONS.undo : "") + "<span></span>";
        b.lastChild.textContent = act.label;
        b.addEventListener("click", function(){ clearTimeout(toastTimer); toastEl.classList.remove("on", "act"); act.run(); });
        parts.push(b);
      }
      if (toastEl.replaceChildren) toastEl.replaceChildren.apply(toastEl, parts); else { toastEl.textContent = msg; }
      toastEl.classList.toggle("act", !!(act && act.run));
      toastEl.classList.add("on");
      clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toastEl.classList.remove("on", "act"); }, ms || (act && act.run ? 4000 : 1800));
    }

    /* ---- popover on a highlight ---- */
    function hidePop(){ pop.classList.remove("on"); popKey = null; }
    function showPop(mk){
      var m = list.filter(function(x){ return x.key === mk.dataset.key; })[0];
      if (!m) return;
      popKey = m.key;
      pop.innerHTML = '<button data-act="note">' + (m.note ? _t("Edit note") : _t("Note")) + '</button>' +
        COLORS.map(function(c){ var n = esc(colorLabel(c)); return '<button class="dot ' + c + '" data-color="' + c + '" title="' + n + '" aria-label="' + n + '"></button>'; }).join("") +
        '<button data-act="remove">' + _t("Remove") + '</button>';
      pop.classList.add("on");
      /* two rows where the labels are long (app.css): rounded corners, not a pill */
      pop.classList.remove("wrapped");
      if (pop.lastChild && pop.firstChild && pop.lastChild.offsetTop > pop.firstChild.offsetTop + 4) pop.classList.add("wrapped");
      var r = mk.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      var x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
      var y = r.top - ph - 8; if (y < 8) y = r.bottom + 8;
      pop.style.left = x + "px"; pop.style.top = y + "px";
    }
    pop.addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      var m = list.filter(function(x){ return x.key === popKey; })[0]; if (!m) return;
      if (b.dataset.color){ setColor(m, b.dataset.color); hidePop(); }
      else if (b.dataset.act === "remove") removeByHand(m);
      else if (b.dataset.act === "note"){ hidePop(); openPanel(m.key); }
    });
    $("#doc").addEventListener("click", function(e){
      var mk = e.target.closest && e.target.closest("mark.ll-mark");
      if (!mk){ hidePop(); return; }
      /* the mouse-up of a drag-selection inside a highlight also fires this click: the selection
         belongs to the pill, so leave the popover closed */
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()){ hidePop(); return; }
      e.stopImmediatePropagation(); e.preventDefault();
      if (popKey === mk.dataset.key) hidePop(); else showPop(mk);
    }, true);
    document.addEventListener("click", function(e){ if (!e.target.closest("#markPop") && !e.target.closest("mark.ll-mark")) hidePop(); });
    window.addEventListener("scroll", hidePop, { passive: true });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") hidePop(); });

    /* ---- panel ----
       Above the list: a search box, the filters in use (colours and tags, which narrow together),
       and what the colours mean. Only the list and the chips are redrawn while typing, so the
       search box keeps the caret. */
    var editKey = null, legendEdit = null, query = "", tagPick = [], colorPick = null;
    function refreshPanel(){
      if (!Side.is("marks")) return;
      var body = Side.body, top = body.scrollTop, a = document.activeElement;
      var find = a && a.id === "markFind", at = find ? a.selectionStart : 0;
      Side.refresh("marks", renderPanel);
      body.scrollTop = top;
      if (find){ var f = body.querySelector("#markFind"); if (f){ f.focus(); try { f.setSelectionRange(at, at); } catch(_){} } }
    }
    /* the marks the filters leave, in list order */
    function shown(){
      var q = query.trim().toLowerCase();
      return list.filter(function(m){
        if (colorPick && (m.kind !== "highlight" || (m.color || "accent") !== colorPick)) return false;
        if (tagPick.length){
          var t = tagsOf(m);
          for (var i = 0; i < tagPick.length; i++) if (t.indexOf(tagPick[i]) < 0) return false;
        }
        if (q && ((m.text || "") + " " + (m.note || "") + " " + labelOf(m)).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }
    function filtering(){ return !!(query.trim() || tagPick.length || colorPick); }
    /* a note with its #tags drawn as chips */
    function noteHtml(note){
      return esc(note || "").replace(TAG, function(whole){ return '<span class="tag">' + whole + '</span>'; });
    }
    function itemHtml(m){
      var pct = pctOf(m), h = '<div class="mark-item" data-key="' + esc(m.key) + '">' +
        '<div class="mark-kind">' + (m.kind === "bookmark" ? _tc("kind", "Bookmark") : _tc("kind", "Highlight")) + '<span>' + (m.pdfPage ? _t("page {n}", { n: m.pdfPage }) : pct + "%") + '</span></div>';
      if (m.kind === "bookmark") h += '<div class="mark-text">' + esc(labelOf(m)) + '</div>';
      else h += '<div class="mark-text q" data-color="' + esc(m.color || "accent") + '">' + esc(m.text || "") + '</div>';
      if (editKey === m.key) h += '<textarea data-note="' + esc(m.key) + '" placeholder="' + _t("Your note\u2026 use #tags to group it") + '">' + esc(m.note || "") + '</textarea>';
      else h += '<div class="mark-note">' + noteHtml(m.note) + '</div>';
      return h + '<div class="mark-acts">' +
        (editKey === m.key ? '<button data-act="savenote">' + _t("Save note") + '</button><button data-act="cancel">' + _t("Cancel") + '</button>'
                           : '<button data-act="note">' + (m.note ? _t("Edit note") : _t("Add note")) + '</button>') +
        '<button data-act="del">' + _t("Delete") + '</button></div></div>';
    }
    function renderList(){
      var host = Side.body.querySelector("#markList"), count = Side.body.querySelector("#markCount");
      if (!host) return;
      var rows = shown();
      host.innerHTML = rows.length ? rows.map(itemHtml).join("")
        : '<div class="empty-note">' + _t("Nothing here matches those filters.") + '</div>';
      if (count) count.textContent = filtering() ? _tn(list.length, "{shown} of {n} mark", "{shown} of {n} marks", { shown: rows.length })
                                                 : _tn(list.length, "{n} mark", "{n} marks");
    }
    function renderFilters(){
      var host = Side.body.querySelector("#markFilters");
      if (!host) return;
      var used = COLORS.filter(function(c){ return list.some(function(m){ return m.kind === "highlight" && (m.color || "accent") === c; }); });
      var h = used.map(function(c){
        var n = esc(colorLabel(c));
        return '<button type="button" class="chip mk-color' + (colorPick === c ? " on" : "") + '" data-pick-color="' + c + '" aria-pressed="' + (colorPick === c) +
          '" title="' + n + '" aria-label="' + _t("Only {name} highlights", { name: n }) + '"><i class="mk-dot ' + c + '" aria-hidden="true"></i><span>' + n + '</span></button>';
      }).join("");
      h += tagCounts().map(function(t){
        var on = tagPick.indexOf(t.tag) >= 0;
        return '<button type="button" class="chip mk-tag' + (on ? " on" : "") + '" data-pick-tag="' + esc(t.tag) + '" aria-pressed="' + on +
          '" aria-label="' + _t("Only notes tagged {tag}", { tag: esc(t.tag) }) + '">#' + esc(t.tag) + '<b>' + t.n + '</b></button>';
      }).join("");
      if (h && filtering()) h += '<button type="button" class="chip mk-clear" data-pick-clear="1">' + _t("Clear filters") + '</button>';
      host.innerHTML = h;
      host.hidden = !h;
    }
    function renderLegend(){
      var host = Side.body.querySelector("#markLegend");
      if (!host) return;
      host.innerHTML = '<span class="mk-leg-l">' + _t("Colours") + '</span>' + COLORS.map(function(c){
        if (legendEdit === c) return '<input class="mk-leg-in" data-leg-in="' + c + '" value="' + esc(legendText(c)) + '" maxlength="40" ' +
          'aria-label="' + esc(_t("What a {colour} highlight means", { colour: colorWord(c).toLowerCase() })) + '" placeholder="' + esc(colorWord(c)) + '">';
        return '<button type="button" class="mk-leg" data-leg="' + c + '" aria-label="' + _t("{name} \u2014 rename", { name: esc(colorLabel(c)) }) + '"><i class="mk-dot ' + c +
          '" aria-hidden="true"></i><span' + (legend[c] ? '' : ' class="mk-leg-none"') + '>' + esc(legendText(c) || _t("Name it")) + '</span></button>';
      }).join("");
    }
    function renderPanel(body, foot){
      if (!list.length){
        body.innerHTML = emptyState(ICONS.bookmark, _t("No bookmarks or highlights yet"),
          state.mode === "pdf" ? _t("Use \u201CBookmark here\u201D in the \u22EF menu to mark a page.") :
           _t("Select text and choose Highlight, or hold a sentence and tap Highlight. \u201CBookmark here\u201D in the \u22EF menu marks your spot."));
        foot.innerHTML = "";
        return;
      }
      body.innerHTML =
        '<div class="find-row mk-find"><input type="search" id="markFind" placeholder="' + _t("Search highlights and notes\u2026") + '" ' +
          'aria-label="' + _t("Search highlights, notes and bookmarks") + '" value="' + esc(query) + '"></div>' +
        '<div class="mk-filters" id="markFilters"></div>' +
        '<div class="mk-legend" id="markLegend" role="group" aria-label="' + _t("What the highlight colours mean") + '"></div>' +
        '<div class="mk-count" id="markCount" aria-live="polite"></div>' +
        '<div class="mk-list" id="markList"></div>';
      renderFilters(); renderLegend(); renderList();
      foot.innerHTML = '<button class="chip" data-exp="md">' + _t("Export Markdown") + '</button><button class="chip" data-exp="obsidian">' + _t("Export Obsidian") + '</button>' +
        '<button class="chip" data-exp="json">' + _t("Export JSON") + '</button><button class="chip" data-exp="copy">' + _t("Copy as text") + '</button>' +
        '<button class="chip" data-exp="copy-obsidian">' + _t("Copy for Obsidian") + '</button>';
      /* the note being written wins the focus the drawer hands out a moment after opening */
      var ta = body.querySelector("textarea");
      if (ta) setTimeout(function(){ if (document.contains(ta)){ ta.focus(); ta.selectionStart = ta.value.length; } }, 80);
      else if (legendEdit) setTimeout(function(){ var el = body.querySelector(".mk-leg-in"); if (el){ el.focus(); el.select(); } }, 80);
    }
    function openPanel(focusKey){
      editKey = focusKey || null; legendEdit = null;
      Side.open("marks", _t("Bookmarks & notes"), renderPanel, function(){ editKey = null; legendEdit = null; }, { family: "doc" });
    }
    Side.body.addEventListener("input", function(e){
      if (!Side.is("marks") || e.target.id !== "markFind") return;
      query = e.target.value;
      renderFilters(); renderList();
    });
    /* Enter saves a colour's meaning, Escape leaves it as it was */
    Side.body.addEventListener("keydown", function(e){
      if (!Side.is("marks") || !e.target.dataset || e.target.dataset.legIn === undefined) return;
      if (e.key === "Enter"){ e.preventDefault(); setLegend(e.target.dataset.legIn, e.target.value); legendEdit = null; refreshPanel(); }
      else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); legendEdit = null; refreshPanel(); }
    });
    /* leaving the little input keeps what was typed; clicking straight on to another colour
       opens that one, since the row is redrawn before the click could land */
    Side.body.addEventListener("focusout", function(e){
      if (!Side.is("marks") || !e.target.dataset || e.target.dataset.legIn === undefined || legendEdit === null) return;
      setLegend(e.target.dataset.legIn, e.target.value);
      var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest("[data-leg]") : null;
      legendEdit = to ? to.dataset.leg : null;
      refreshPanel();
    });
    Side.body.addEventListener("click", function(e){
      if (!Side.is("marks")) return;
      var pick = e.target.closest("[data-pick-color], [data-pick-tag], [data-pick-clear]");
      if (pick){
        if (pick.dataset.pickClear){ query = ""; tagPick = []; colorPick = null; refreshPanel(); return; }
        if (pick.dataset.pickColor) colorPick = colorPick === pick.dataset.pickColor ? null : pick.dataset.pickColor;
        else {
          var t = pick.dataset.pickTag, i = tagPick.indexOf(t);
          if (i < 0) tagPick.push(t); else tagPick.splice(i, 1);
        }
        renderFilters(); renderList();
        return;
      }
      var leg = e.target.closest("[data-leg]");
      if (leg){ legendEdit = leg.dataset.leg; refreshPanel(); return; }
      var item = e.target.closest(".mark-item"); if (!item) return;
      var m = list.filter(function(x){ return x.key === item.dataset.key; })[0]; if (!m) return;
      var b = e.target.closest("button");
      if (!b){ if (!e.target.closest("textarea")) reveal(m); return; }
      var act = b.dataset.act;
      if (act === "del"){ removeByHand(m); }
      else if (act === "note"){ editKey = m.key; refreshPanel(); }
      else if (act === "cancel"){ editKey = null; refreshPanel(); }
      else if (act === "savenote"){ var ta = item.querySelector("textarea"); editKey = null; setNote(m, ta ? ta.value.trim() : ""); }
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("marks")) return;
      var b = e.target.closest("button[data-exp]"); if (!b) return;
      exportMarks(b.dataset.exp);
    });

    /* ---- export ---- */
    function baseName(){ return (docName || "document").replace(/\.[^.]+$/, ""); }
    function toMarkdown(){
      var out = ["# " + ($("#fname").textContent || docName), "", "_" + _t("Exported from Lamplight on {date}", { date: I18N.dateTime(new Date()) }) + "_", ""];
      var bms = list.filter(function(m){ return m.kind === "bookmark"; }), his = list.filter(function(m){ return m.kind === "highlight"; });
      if (bms.length){
        out.push("## " + _t("Bookmarks"), "");
        bms.forEach(function(m){ out.push("- " + (m.pdfPage ? _t("Page {n}", { n: m.pdfPage }) : pctOf(m) + "%") + " \u2014 " + labelOf(m) + (m.note ? "  \n  " + m.note.replace(/\n/g, "  \n  ") : "")); });
        out.push("");
      }
      if (his.length){
        out.push("## " + _t("Highlights"), "");
        his.forEach(function(m){
          out.push("> " + (m.text || "").replace(/\n/g, " "), "");
          if (m.note) out.push(m.note, "");
          out.push("<sub>" + pctOf(m) + "%</sub>", "");
        });
      }
      return out.join("\n");
    }
    function toJSON(){
      return JSON.stringify({ document: { name: docName, title: $("#fname").textContent, id: docId }, exported: new Date().toISOString(),
        marks: list.map(function(m){ var o = {}; Object.keys(m).forEach(function(k){ if (k !== "doc") o[k] = m[k]; }); o.percent = pctOf(m); return o; }) }, null, 2);
    }
    /* ---- Obsidian: one note per book, with front matter and a heading per chapter ----
       The title shown in the bar is "Title \u2014 Author" for an EPUB; nothing else carries an author. */
    function shownTitle(){ return $("#fname").textContent || docName || _t("Untitled"); }
    function titleAndAuthor(){
      var t = shownTitle(), i = /\.epub$/i.test(docName || "") ? t.indexOf(" \u2014 ") : -1;
      return i > 0 ? { title: t.slice(0, i), author: t.slice(i + 3) } : { title: t, author: "" };
    }
    function yaml(s){ return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    function isoDay(){ var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate(); }
    /* the headings of a text document as character offsets, so each mark falls under one */
    function chapterHeads(){
      var out = [];
      if (state.mode !== "doc") return out;
      var entries = [];
      try { entries = Toc.entries() || []; } catch(_){ return out; }
      entries.forEach(function(e){
        if (!e.el) return;
        var w = document.createTreeWalker(e.el, NodeFilter.SHOW_TEXT), n = w.nextNode();
        var off = n ? Anchor.offsetOf(n, 0) : null;
        if (off !== null) out.push({ title: e.title, off: off });
      });
      out.sort(function(a, b){ return a.off - b.off; });
      return out;
    }
    function toObsidian(){
      var ta = titleAndAuthor(), heads = chapterHeads(), tags = tagCounts().map(function(t){ return t.tag; });
      var out = ["---", "title: " + yaml(ta.title)];
      if (ta.author) out.push("author: " + yaml(ta.author));
      out.push("source: Lamplight", "date: " + isoDay(), "tags: [" + ["reading"].concat(tags).join(", ") + "]", "---", "", "# " + ta.title, "");
      var named = COLORS.filter(function(c){ return legend[c]; });
      if (named.length){
        out.push("> [!note] " + _t("Legend"));
        named.forEach(function(c){ out.push("> - " + colorWord(c) + " \u2014 " + legendText(c)); });
        out.push("");
      }
      var his = list.filter(function(m){ return m.kind === "highlight"; });
      /* group the highlights under the last heading at or above each one */
      var groups = [], byTitle = {};
      function bucket(name){
        if (!byTitle[name]){ byTitle[name] = { title: name, marks: [] }; groups.push(byTitle[name]); }
        return byTitle[name];
      }
      his.forEach(function(m){
        var name = _tc("export", "Notes");
        if (heads.length && typeof m.start === "number"){
          for (var i = 0; i < heads.length; i++) if (heads[i].off <= m.start) name = heads[i].title;
        }
        bucket(name).marks.push(m);
      });
      groups.forEach(function(g){
        out.push("## " + g.title, "");
        g.marks.forEach(function(m){
          out.push("> " + (m.text || "").replace(/\n/g, " "));
          if (m.note) out.push(m.note.replace(/\n/g, " "));
          out.push("");
        });
      });
      var bms = list.filter(function(m){ return m.kind === "bookmark"; });
      if (bms.length){
        out.push("## " + _t("Bookmarks"), "");
        bms.forEach(function(m){
          out.push("- " + (m.pdfPage ? _t("Page {n}", { n: m.pdfPage }) : pctOf(m) + "%") + " \u2014 " + labelOf(m) + (m.note ? " " + m.note.replace(/\n/g, " ") : ""));
        });
        out.push("");
      }
      return out.join("\n");
    }
    function download(name, text, type){
      var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);
    }
    function copy(text){
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function(){ toast(_t("Copied")); }, function(){ toast(_t("Couldn\u2019t copy")); });
    }
    function exportMarks(fmt){
      if (fmt === "md") download(baseName() + "-notes.md", toMarkdown(), "text/markdown");
      else if (fmt === "obsidian") download(baseName() + ".md", toObsidian(), "text/markdown");
      else if (fmt === "json") download(baseName() + "-notes.json", toJSON(), "application/json");
      else if (fmt === "copy-obsidian") copy(toObsidian());
      else copy(toMarkdown());
    }

    Menu.add({ order: 30, quick: 2, group: "marks", icon: ICONS.bookmark, label: function(){ return _t("Bookmark here"); }, key: "B", run: addBookmark, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    Menu.add({ order: 31, pgroup: "reading", porder: 40.1, group: "marks", icon: ICONS.notes, label: function(){ return _t("Bookmarks & notes") + (list.length ? " (" + list.length + ")" : ""); }, key: "N", run: function(){ openPanel(); }, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });

    return { setDoc: setDoc, docReady: docReady, apply: apply, forget: forget, clearAll: clearAll, addHighlight: addHighlight, highlightSelection: highlightSelection,
             selectionOffsets: selectionOffsets, hidePop: hidePop, addBookmark: addBookmark, openPanel: openPanel, toast: toast, list: function(){ return list; },
             toMarkdown: toMarkdown, toJSON: toJSON, toObsidian: toObsidian, tagsOf: tagsOf, download: download,
             legend: function(){ return Object.assign({}, legend); }, setLegend: setLegend };
  })();

  /* ============================================================
     Table of contents — PDF outline, EPUB nav, or headings
     ============================================================ */
  /* the language of the open book (Speak works it out; English until it has), for the book's own words
     shown in a panel — its headings, search snippets, its hardest words — while the interface may be Dutch */
  function bookLang(){ return typeof Speak !== "undefined" && Speak && Speak.docLang ? Speak.docLang() : "en"; }
  var Toc = (function(){
    var pdfCache = null, pdfCacheDoc = null;
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function docEntries(){
      var doc = $("#doc"), out = [];
      if (state.toc && state.toc.length){
        state.toc.forEach(function(t){
          var el = document.getElementById(t.id);
          if (el && t.title) out.push({ title: t.title, level: Math.min(6, t.level || 1), el: el });
        });
        if (out.length) return out;
      }
      var hs = doc.querySelectorAll("h1, h2, h3, h4");
      var minLevel = 6;
      Array.prototype.forEach.call(hs, function(h){ minLevel = Math.min(minLevel, +h.tagName.charAt(1)); });
      Array.prototype.forEach.call(hs, function(h, i){
        var title = h.textContent.replace(/\s+/g, " ").trim();
        if (!title) return;
        if (!h.id) h.id = "ll-h-" + i;
        out.push({ title: title, level: (+h.tagName.charAt(1)) - minLevel + 1, el: h });
      });
      return out;
    }
    function pdfEntries(){
      var doc = state.pdfDoc;
      if (pdfCache && pdfCacheDoc === doc) return Promise.resolve(pdfCache);
      return doc.getOutline().then(function(outline){
        var out = [];
        function pageOf(dest){
          var p = typeof dest === "string" ? doc.getDestination(dest) : Promise.resolve(dest);
          return p.then(function(d){
            if (!d || !d[0]) return null;
            return typeof d[0] === "object" ? doc.getPageIndex(d[0]).then(function(i){ return i + 1; }) : (typeof d[0] === "number" ? d[0] + 1 : null);
          }).catch(function(){ return null; });
        }
        var jobs = [];
        (function walk(items, level){
          (items || []).forEach(function(it){
            var e = { title: (it.title || "").replace(/\s+/g, " ").trim(), level: Math.min(6, level), page: null };
            out.push(e);
            jobs.push(pageOf(it.dest).then(function(pg){ e.page = pg; }));
            walk(it.items, level + 1);
          });
        })(outline, 1);
        return Promise.all(jobs).then(function(){
          pdfCache = out.filter(function(e){ return e.title; }); pdfCacheDoc = doc;
          return pdfCache;
        });
      }).catch(function(){ pdfCache = []; pdfCacheDoc = doc; return pdfCache; });
    }
    function goPdfPage(n){
      n = Math.max(1, Math.min(n, state.pdfDoc.numPages));
      if (state.flow === "pages"){ state.pdfPageNum = n; renderPdfSingle(); }
      else {
        var c = $("#pdf").querySelector('.pdf-page[data-page="' + n + '"]');
        if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 6));
      }
    }
    function currentIndex(entries){
      /* the last entry at or above the top of the screen */
      var cur = -1;
      if (state.mode === "pdf"){
        var pg = Library.currentPdfPage();
        entries.forEach(function(e, i){ if (e.page && e.page <= pg) cur = i; });
        return cur;
      }
      /* Pages flow: the section at the page's first character, as the title and the pager say */
      if (state.flow === "pages"){ var hit = Section.at(pageTopOffset()); return hit ? hit.i : -1; }
      var head = Library.headerHeight();
      var line = head + (window.innerHeight - head) * 0.35;
      entries.forEach(function(e, i){
        if (e.el.getBoundingClientRect().top <= line) cur = i;
      });
      return cur;
    }
    function renderList(body, entries){
      if (!entries.length){
        body.innerHTML = '<div class="empty-note">' + (state.mode === "pdf" ? _t("This PDF has no outline.") : _t("No headings found in this document.")) + '</div>';
        return;
      }
      var cur = currentIndex(entries);
      body.innerHTML = entries.map(function(e, i){
        return '<div class="toc-item' + (i === cur ? ' cur' : '') + '" data-i="' + i + '" data-level="' + e.level + '" role="button" tabindex="0">' +
          '<span class="toc-t" lang="' + bookLang() + '" data-no-i18n>' + esc(e.title) + '</span>' + (e.page ? '<span class="toc-p">' + e.page + '</span>' : '') + '</div>';
      }).join("");
      var c = body.querySelector(".toc-item.cur"); if (c) c.scrollIntoView({ block: "center" });
      shown = entries;
    }
    /* one delegated pair of listeners on the shared panel body, live only while contents is open */
    var shown = null;
    Side.body.addEventListener("click", function(ev){
      if (!Side.is("toc") || !shown) return;
      var it = ev.target.closest(".toc-item"); if (!it) return;
      var e = shown[+it.dataset.i]; if (!e) return;
      Side.close();
      if (Journal) Journal.jumped();
      if (e.el) revealElement(e.el); else if (e.page) goPdfPage(e.page);
    });
    Side.body.addEventListener("keydown", function(ev){
      if (!Side.is("toc") || (ev.key !== "Enter" && ev.key !== " ")) return;
      var it = ev.target.closest(".toc-item"); if (it){ ev.preventDefault(); it.click(); }
    });
    function render(body, foot){
      if (state.mode === "pdf"){
        body.innerHTML = '<div class="empty-note">' + _t("Reading the outline\u2026") + '</div>';
        foot.innerHTML = '<label class="toc-goto">' + _t("Go to page {input} of {n}", { input: '<input type="number" id="tocGoto" min="1" max="' + state.pdfDoc.numPages + '" value="' + Library.currentPdfPage() + '">', n: state.pdfDoc.numPages }) + '</label>';
        foot.querySelector("#tocGoto").addEventListener("keydown", function(e){ if (e.key === "Enter"){ Side.close(); if (Journal) Journal.jumped(); goPdfPage(+e.target.value); } });
        foot.querySelector("#tocGoto").addEventListener("change", function(e){ if (Journal) Journal.jumped(); goPdfPage(+e.target.value); });
        var doc = state.pdfDoc;
        pdfEntries().then(function(entries){ if (Side.is("toc") && state.pdfDoc === doc) renderList(body, entries); });
      } else {
        renderList(body, docEntries());
      }
    }
    function openPanel(){ Side.open("toc", _t("Contents"), render, function(){ shown = null; }, { family: "doc" }); }
    Menu.add({ order: 10, quick: 3, group: "navigate", icon: ICONS.contents, label: function(){ return _t("Contents"); }, key: "C", run: openPanel, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { openPanel: openPanel, entries: docEntries, pdfEntries: pdfEntries, goPdfPage: goPdfPage };
  })();

  /* ============================================================
     Songs in the book — a chapter that opens on its song ("♪  “To Build a Home” — The Cinematic
     Orchestra", "Song “Eye of the Tiger” — Survivor") gets that line as a link: a tap plays it in
     Spotify, a hold offers YouTube Music, Apple Music or the name to copy, and Soundtrack in the
     menu lists every song of the book. A line counts when it opens with a music marker (♪ ♫ ♬ 🎵 🎶
     🎧, "Song", "Now playing:", "Nu speelt:", "Liedje:"… anywhere in the book), or, without one,
     when it is a short line of its own near the start of a chapter, a quoted title, a dash and an
     artist that reads like a name (so not “Hello,” — said Anna). The text of #doc stays exactly as
     it is (positions, highlights, notes and read-aloud are character offsets into it): the line's
     own nodes move into an <a class="ll-song">, and its note is drawn by the stylesheet.
     ============================================================ */
  var Songs = (function(){
    var NEAR = 8;            /* the blocks after a heading or a chapter break that count as its start */
    var SYM = "(?:[\\u2669-\\u266C]|\\uD83C[\\uDFB5\\uDFB6\\uDFA7\\uDFBC])\\uFE0F?";
    var OPENQ = "\"'\\u201C\\u201E\\u2018\\u00AB\\u2039";
    var MARKER = new RegExp("^\\s*(?:" + SYM + "\\s*|(?:now playing|playing|soundtrack|track|listening to|nu speelt|liedje|muziek|nummer|song)\\s*:\\s*|song\\s+(?=[" + OPENQ + "]))+", "i");
    /* a first, cheap look at a block far from a chapter's start: a marker anywhere in it */
    var HINT = new RegExp(SYM + "|\\b(?:playing|soundtrack|track|listening to|nu speelt|liedje|muziek|nummer|song)\\b", "i");
    var CLOSERS = { "“": "”“", "„": "”“", "\"": "\"", "'": "'", "‘": "’", "«": "»", "‹": "›" };
    var SEP = /^(?:\s*[—–]\s*|\s*-\s*|\s*,\s*|\s+(?:by|van|door)\s+)(?=\S)/i;
    var DASH_SEP = /^(?:\s*[—–]\s*|\s*-\s*|\s+(?:by|van|door)\s+)(?=\S)/i;
    var UNQ_DASH = /^(.+?)(?:\s+-\s+|\s*[—–]\s*)(\S.*)$/;
    var UNQ_BY = /^(.+)\s+(?:by|van|door)\s+(\S.*)$/i;      /* the last "by": "Stand by Me by Ben E. King" */
    var UNQ_COMMA = /^([^,]+),\s+(\S.*)$/;
    /* "Survivor — “Eye of the Tiger”": the artist first (only after a marker) */
    var REV = new RegExp("^([^" + OPENQ + "]+?)\\s*(?:[\\u2014\\u2013:]|\\s-)\\s*[" + OPENQ + "](.+)[\"'\\u201D\\u201C\\u2019\\u00BB\\u203A]$");
    /* a player drawn after the song: ◁◁ II ▷▷, ⏮ ⏸ ⏭, ━━━●────, 1:32 / 3:45, ♡ ↻ */
    var DECO = new RegExp("(?:\\sII(?![A-Za-z])|\\s|[\\u2669-\\u266C\\u25C0\\u25C1\\u25B6\\u25B7\\u23E9-\\u23FA\\u21BA\\u21BB\\u21C4\\u21C6\\u2661\\u2665\\u2764\\u275A\\u2016\\u2022\\u00B7|/\\uFE0E\\uFE0F=_~\\u2500-\\u257F\\u25A0-\\u25AC\\u25CB\\u25CF\\u25C9\\u2B24\\u26AA\\u26AB]|\\uD83C[\\uDFB5\\uDFB6\\uDFA7\\uDFBC]|\\uD83D[\\uDD00-\\uDD04]|\\d{1,2}:\\d{2}|-{2,}|[\\u2014\\u2013]{2,}|\\.{3,}|\\u2026)+$");
    var LETTER = /[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿가-힯]/;
    var ART_SMALL = /^(?:&|\+|x|×|and|the|of|feat\.?|ft\.?|featuring|with|vs\.?|en|met|van|de|der|den|het|von|und|y|la|le|les|el|los|las|des|du|da|di|del|a|an|in|on|at|for|to)$/i;
    var TITLE_SMALL = /^(?:a|an|the|and|or|of|in|on|at|to|for|with|by|from|my|me|you|your|is|it|be|i|am|are|was|de|het|een|en|van|op|met|je|ik)$/i;
    var SAID = /^(?:said|says|asked|asks|replied|whispered|shouted|zei|zegt|vroeg|vraagt|antwoordde|fluisterde|riep)$/i;
    var SCENE = /^(?:[*•·⁂~#=_\-—–❦❧§]\s*){1,12}$/;
    var CH_WORD = /^(?:chapter|hoofdstuk|part|deel|book|boek)\s+(\S+)/i;
    var CH_SOLO = /^(?:prologue|proloog|epilogue|epiloog|interlude|intermezzo|introduction|inleiding)\b/i;
    var BLOCKS = "p, li, div, blockquote, pre, dd, dt, figcaption";
    var BREAKS = "h1, h2, h3, h4, h5, h6, hr, section.ll-chapter";
    var ALL = BREAKS + ", " + BLOCKS;
    var count = 0, chapterOf = new WeakMap(), nearOf = new WeakMap();

    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function clean(s){ return String(s || "").replace(/\s+/g, " ").trim(); }

    /* ---- reading a line ---- */
    function titleLike(t){
      if (!t || t.length > 80 || !LETTER.test(t)) return false;
      var u = t.replace(/\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|feat|ft)\./g, "").replace(/(?:\b[A-Z]\.)+/g, "");
      if (/[.!?…,;:—–-]$/.test(u) || /[.!?…]\s/.test(u)) return false;
      var words = t.split(" ");
      if (words.length > 10) return false;
      /* a longer quote in sentence case is an epigraph (“Not all those who wander are lost”), not a title */
      if (words.length > 4){
        var all = 0, big = 0;
        words.forEach(function(w){ if (TITLE_SMALL.test(w)) return; all++; if (/^[^a-zß-ÿ]/.test(w)) big++; });
        if (big * 2 < all) return false;
      }
      return true;
    }
    /* capitalised words, with "and", "the", "feat.", "van", "de"… between them; never a speech verb */
    function nameLike(s){
      if (!s || s.length > 60 || /[,;:"“”„«»]/.test(s)) return false;
      if (/[.!?…]$/.test(s) && !/(?:^|\s)(?:[A-Z]\.)+$/.test(s) && !/\b(?:Jr|Sr|St|Dr)\.$/.test(s)) return false;
      var words = s.split(" "), cap = 0;
      if (words.length > 7 || SAID.test(words[0])) return false;
      for (var i = 0; i < words.length; i++){
        var w = words[i];
        if (/^[^a-zß-ÿ]/.test(w)){ if (/^[A-ZÀ-Þ0-9]/.test(w)) cap++; continue; }
        if (i === 0 || !ART_SMALL.test(w)) return false;
      }
      return cap > 0;
    }
    function quoted(rest){
      var close = CLOSERS[rest.charAt(0)];
      for (var i = 1; i < rest.length; i++){
        if (close.indexOf(rest.charAt(i)) < 0) continue;
        var after = rest.slice(i + 1), sm = SEP.exec(after);
        if (sm) return { title: rest.slice(1, i), artist: after.slice(sm[0].length), quoted: true, dash: DASH_SEP.test(after) };
        if (!after.trim()) return { title: rest.slice(1, i), artist: "", quoted: true, dash: false };
      }
      return null;
    }
    /* { title, artist, marked } for a line that names a song, else null; near: the line is close to a chapter's start */
    function parse(line, near){
      var s = clean(line);
      if (!s || s.length > 200) return null;
      var mk = MARKER.exec(s), marked = !!(mk && mk[0].trim());
      if (!marked && (!near || s.length >= 120)) return null;
      var rest = (marked ? s.slice(mk[0].length) : s).replace(DECO, "").trim(), r = null, m;
      if (!rest) return null;
      if (CLOSERS[rest.charAt(0)]) r = quoted(rest);
      if (!r && marked){
        if ((m = REV.exec(rest)) && m[1].length <= 60) r = { title: m[2], artist: m[1] };
        else if ((m = UNQ_DASH.exec(rest)) || (m = UNQ_BY.exec(rest)) || (m = UNQ_COMMA.exec(rest))) r = { title: m[1], artist: m[2] };
      }
      if (!r) return null;
      var title = clean(r.title), artist = clean(r.artist).replace(/^[\s,;:\-—–]+|[\s,;:\-—–]+$/g, "");
      if (marked){
        title = title.replace(/[\s,;:]+$/, "");          /* “Eye of the Tiger,” by Survivor */
        if (!title || title.length > 120 || !LETTER.test(title) || artist.length > 80) return null;
        if (!r.quoted && (title.length > 80 || artist.split(" ").length > 8)) return null;
        if (artist && !LETTER.test(artist)) artist = "";
      } else if (!r.quoted || !r.dash || !titleLike(title) || !nameLike(artist)) return null;
      return { title: title, artist: artist, marked: marked };
    }
    function chapterLine(t){
      if (t.length > 80) return false;
      if (/^#{1,6}\s+\S/.test(t) || /^(?:\d{1,3}|[IVXLCDM]{1,7})\.?$/.test(t)) return true;
      if (/[.!?,;]$/.test(t)) return false;
      if (CH_SOLO.test(t)) return true;
      var m = CH_WORD.exec(t);
      return !!(m && /^(?:\d{1,3}|[IVXLCDM]{1,7}|[A-Z][a-z]+(?:-[a-z]+)?)$/.test(m[1].replace(/[.:—–-]+$/, "")));
    }

    /* ---- finding the lines in the document ---- */
    /* a block's text cut at <br> and at the line breaks inside its text, as trimmed [start, end) offsets */
    function linesOf(el){
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n, text = "", cuts = [], out = [], at = 0;
      while ((n = w.nextNode())){
        if (n.nodeType === 3){
          var v = n.nodeValue, k = v.indexOf("\n");
          while (k >= 0){ cuts.push([text.length + k, 1]); k = v.indexOf("\n", k + 1); }
          text += v;
        } else if (n.tagName === "BR") cuts.push([text.length, 0]);
      }
      cuts.push([text.length, 0]);
      cuts.forEach(function(c){
        var a = at, b = c[0];
        while (a < b && /\s/.test(text.charAt(a))) a++;
        while (b > a && /\s/.test(text.charAt(b - 1))) b--;
        if (b > a) out.push([a, b]);
        at = c[0] + c[1];
      });
      return { text: text, lines: out };
    }
    /* (text node, offset) for an offset into el's text; end: a boundary belongs to the node before it */
    function pointIn(el, off, end){
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, sum = 0;
      while ((n = w.nextNode())){
        var len = n.nodeValue.length;
        if (end ? off <= sum + len : off < sum + len) return { node: n, offset: off - sum };
        sum += len;
      }
      return null;
    }
    function link(song){
      var a = document.createElement("a");
      a.className = "ll-song";
      a.href = url("spotify", song);
      a.setAttribute("data-title", song.title);
      a.setAttribute("data-artist", song.artist);
      a.title = _t("Play in Spotify · hold for more");
      return a;
    }
    /* the line's own nodes move into the link: the text, and so every offset, stays as it was */
    function wrap(el, a, b, whole, song){
      var ln = link(song);
      if (whole){
        if (el.querySelector("a")) return null;
        while (el.firstChild) ln.appendChild(el.firstChild);
        el.appendChild(ln);
        return ln;
      }
      var s = pointIn(el, a, false), e = pointIn(el, b, true);
      if (!s || !e) return null;
      var r = document.createRange();
      r.setStart(s.node, s.offset); r.setEnd(e.node, e.offset);
      var probe = r.cloneContents();
      if (probe.querySelector && probe.querySelector("a")) return null;
      ln.appendChild(r.extractContents());
      r.insertNode(ln);
      return ln;
    }
    function found(ln, chapter, near){ if (!ln) return; chapterOf.set(ln, chapter); nearOf.set(ln, near); count++; }
    function scanHtml(doc){
      var els = doc.querySelectorAll(ALL), since = 0, chapter = "";
      for (var i = 0; i < els.length; i++){
        var el = els[i];
        if (el.matches(BREAKS)){
          since = 0;
          if (/^H\d$/.test(el.tagName)){ var ht = clean(el.textContent); if (ht) chapter = ht; }
          continue;
        }
        if (el.querySelector(ALL) || el.closest(".ll-tr, .ll-song, a, nav, table")) continue;
        var text = el.textContent;
        if (!/\S/.test(text)) continue;
        if (text.length <= 160){
          var t = clean(text);
          if (SCENE.test(t)){ since = 0; continue; }
          if (chapterLine(t)){ since = 0; chapter = t.replace(/^#+\s*/, ""); continue; }
        }
        var near = since < NEAR;
        since++;
        if (text.length > 4000 || (!near && !HINT.test(text))) continue;
        var L = linesOf(el);
        for (var j = 0; j < L.lines.length; j++){
          var ln = L.lines[j];
          if (ln[1] - ln[0] > 240) continue;
          var song = parse(L.text.slice(ln[0], ln[1]), near);
          if (song) found(wrap(el, ln[0], ln[1], L.lines.length === 1, song), chapter, near);
        }
      }
    }
    /* a plain-text book is one block: its lines, with "Chapter 3", "Hoofdstuk 3", "12", "# Title" or a
       scene break ("* * *") as the chapter starts */
    function scanPlain(el){
      var L = linesOf(el), since = 0, chapter = "", hits = [];
      L.lines.forEach(function(ln){
        var t = L.text.slice(ln[0], ln[1]);
        if (t.length <= 80 && SCENE.test(t)){ since = 0; return; }
        if (chapterLine(t)){ since = 0; chapter = t.replace(/^#+\s*/, ""); return; }
        var near = since < NEAR;
        since++;
        if (t.length > 240 || (!near && !HINT.test(t))) return;
        var song = parse(t, near);
        if (song) hits.push({ a: ln[0], b: ln[1], song: song, chapter: chapter, near: near });
      });
      hits.forEach(function(h){ found(wrap(el, h.a, h.b, false, h.song), h.chapter, h.near); });
    }
    /* once per document, right after its text is in #doc (setDocHtml, the plain-text path) */
    function scan(){
      count = 0; closePop(true);
      var doc = $("#doc");
      if (!doc) return;
      try {
        var plain = doc.querySelector(":scope > div.plain");
        if (plain) scanPlain(plain); else scanHtml(doc);
      } catch(err){ if (window.console) console.warn("songs", err); }
      Anchor.invalidate();
    }

    /* ---- a song and where it plays ---- */
    function info(a){ return { el: a, title: a.getAttribute("data-title") || "", artist: a.getAttribute("data-artist") || "" }; }
    function name(s){ return s.title + (s.artist ? " — " + s.artist : ""); }
    function query(s){ return clean(s.title + " " + s.artist); }
    function url(app, s){
      var q = encodeURIComponent(query(s));
      if (app === "ytm") return "https://music.youtube.com/search?q=" + q;
      if (app === "apple") return "https://music.apple.com/search?term=" + q;
      return "https://open.spotify.com/search/" + q;
    }
    function openWeb(u){
      var w = null;
      try { w = window.open(u, "_blank"); } catch(_){}
      if (w){ try { w.opener = null; } catch(_){} }
      else Marks.toast(_t("Couldn’t open the music app"));
    }
    /* the Spotify app first; still here after 1.2 s (no app, or it said no) the web player in a new tab */
    function spotify(s){
      var done = false, timer = null;
      function finish(){ done = true; clearTimeout(timer); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", finish); }
      function hidden(){ if (document.hidden) finish(); }
      document.addEventListener("visibilitychange", hidden);
      window.addEventListener("pagehide", finish);
      timer = setTimeout(function(){ if (done) return; finish(); if (!document.hidden) openWeb(url("spotify", s)); }, 1200);
      try { window.location.href = "spotify:search:" + encodeURIComponent(query(s)); } catch(_){}
    }
    function copy(text){
      if (!navigator.clipboard){ Marks.toast(_t("Couldn’t copy")); return; }
      navigator.clipboard.writeText(text).then(function(){ Marks.toast(_t("Copied")); }, function(){ Marks.toast(_t("Couldn’t copy")); });
    }
    function go(app, s){
      if (app === "copy") copy(name(s));
      else if (app === "spotify") spotify(s);
      else openWeb(url(app, s));
    }
    /* what read-aloud says for the line: the song, in the book's language, never the note or the player */
    function say(a){
      var s = info(a), nl = /^nl/i.test(bookLang());
      return (nl ? "Nummer: " : "Song: ") + s.title + (s.artist ? (nl ? ", van " : ", by ") + s.artist : "") + ".";
    }

    /* ---- a tap plays it; a hold (or a right-click) offers the other apps ---- */
    var pop = null, popFor = null, heldAt = 0, holdTimer = null, hx = 0, hy = 0;
    var APPS = [["spotify", "Spotify"], ["ytm", "YouTube Music"], ["apple", "Apple Music"]];
    function buildPop(){
      pop = document.createElement("div");
      pop.id = "songPop"; pop.setAttribute("role", "menu");
      document.body.appendChild(pop);
      pop.addEventListener("click", function(e){
        var b = e.target.closest("button[data-app]");
        if (!b || !popFor) return;
        var s = info(popFor); closePop(true); go(b.getAttribute("data-app"), s);
      });
      pop.addEventListener("keydown", function(e){
        var bs = Array.prototype.slice.call(pop.querySelectorAll("button")), i = bs.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length].focus(); }
        else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); closePop(); }
        else if (e.key === "Tab") closePop(true);
      });
    }
    function showPop(a){
      if (!pop) buildPop();
      if (popFor === a && pop.classList.contains("on")) return;
      popFor = a;
      var s = info(a);
      pop.setAttribute("aria-label", _t("Play “{title}”", { title: s.title }));
      pop.innerHTML = '<div class="sng-head" lang="' + bookLang() + '" data-no-i18n>' + esc(name(s)) + '</div>' +
        APPS.map(function(p){ return '<button type="button" role="menuitem" data-app="' + p[0] + '">' + ICONS.music + '<span>' + p[1] + '</span></button>'; }).join("") +
        '<button type="button" role="menuitem" data-app="copy">' + COPY_ICON + '<span>' + esc(_t("Copy song name")) + '</span></button>';
      pop.classList.add("on");
      var r = a.getClientRects()[0] || a.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      var x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
      var y = r.top - ph - 8; if (y < 8) y = Math.min(r.bottom + 8, window.innerHeight - ph - 8);
      pop.style.left = Math.round(x) + "px"; pop.style.top = Math.round(Math.max(8, y)) + "px";
      var first = pop.querySelector("button"); if (first) first.focus({ preventScroll: true });
    }
    function closePop(quiet){
      if (!pop || !pop.classList.contains("on")) return;
      var a = popFor;
      pop.classList.remove("on"); popFor = null;
      if (!quiet && a && document.contains(a)) a.focus({ preventScroll: true });
    }
    function songAt(e){ var t = e.target; return t && t.closest ? t.closest("#doc a.ll-song") : null; }
    /* the capture phase on the document: before the dictionary's word tap, the page-turn taps and the link handler of #doc */
    document.addEventListener("click", function(e){
      var a = songAt(e);
      if (!a){ if (pop && pop.classList.contains("on") && !(e.target.closest && e.target.closest("#songPop")) && Date.now() - heldAt > 700) closePop(true); return; }
      e.preventDefault(); e.stopPropagation();
      if (Date.now() - heldAt < 700) return;           /* the click a hold leaves behind */
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      closePop(true);
      spotify(info(a));
    }, true);
    document.addEventListener("contextmenu", function(e){
      var a = songAt(e);
      if (!a) return;
      e.preventDefault(); e.stopPropagation();
      clearTimeout(holdTimer);
      heldAt = Date.now();
      showPop(a);
    }, true);
    /* a hold on a phone, should the browser send no contextmenu */
    document.addEventListener("touchstart", function(e){
      clearTimeout(holdTimer);
      var a = songAt(e);
      if (!a || e.touches.length > 1) return;
      hx = e.touches[0].clientX; hy = e.touches[0].clientY;
      holdTimer = setTimeout(function(){ heldAt = Date.now(); if (navigator.vibrate) navigator.vibrate(12); showPop(a); }, 520);
    }, { passive: true, capture: true });
    document.addEventListener("touchmove", function(e){
      if (holdTimer && e.touches.length && (Math.abs(e.touches[0].clientX - hx) > 10 || Math.abs(e.touches[0].clientY - hy) > 10)) clearTimeout(holdTimer);
    }, { passive: true, capture: true });
    document.addEventListener("touchend", function(){ clearTimeout(holdTimer); }, { passive: true, capture: true });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape" && pop && pop.classList.contains("on")){ e.stopPropagation(); closePop(); } }, true);
    window.addEventListener("scroll", function(){ if (Date.now() - heldAt > 400) closePop(true); }, { passive: true });
    window.addEventListener("resize", function(){ closePop(true); });

    /* ---- Soundtrack: every song of the book, in order, with its chapter ---- */
    function all(){
      var doc = $("#doc"), heads = [];
      if (state.mode !== "doc" || !doc) return [];
      try { heads = Toc.entries() || []; } catch(_){ heads = []; }
      return Array.prototype.map.call(doc.querySelectorAll("a.ll-song"), function(a){
        var s = info(a), head = null;
        heads.forEach(function(h){
          if (h.el && (h.el === a || (h.el.compareDocumentPosition(a) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)))) head = h;
        });
        s.chapter = head ? head.title : (chapterOf.get(a) || "");
        s.head = head && nearOf.get(a) ? head.el : null;
        return s;
      });
    }
    var shown = null;
    function render(body, foot){
      var list = all(), lang = bookLang();
      shown = list;
      if (!list.length){ body.innerHTML = '<div class="empty-note">' + esc(_t("No songs found in this book.")) + '</div>'; return; }
      body.innerHTML = '<p class="sng-intro">' + esc(_tn(list.length, "One song in this book. Tap it to play it in Spotify.", "{n} songs, in the order of the book. Tap one to play it in Spotify.")) + '</p>' +
        '<ol class="sng-list">' + list.map(function(s, i){
          var lbl = s.artist ? _t("Play “{title}” by {artist} in Spotify", { title: s.title, artist: s.artist }) : _t("Play “{title}” in Spotify", { title: s.title });
          return '<li class="sng-item">' +
            '<button type="button" class="sng-play" data-i="' + i + '" aria-label="' + esc(lbl + (s.chapter ? " · " + s.chapter : "")) + '">' +
              '<span class="sng-ic" aria-hidden="true">' + ICONS.music + '</span>' +
              '<span class="sng-txt" lang="' + lang + '" data-no-i18n><span class="sng-t">' + esc(s.title) + '</span>' +
                (s.artist ? '<span class="sng-a">' + esc(s.artist) + '</span>' : '') +
                (s.chapter ? '<span class="sng-c">' + esc(s.chapter) + '</span>' : '') + '</span>' +
            '</button>' +
            '<button type="button" class="sng-go" data-go="' + i + '" aria-label="' + esc(_t("Go to the chapter")) + '" title="' + esc(_t("Go to the chapter")) + '">' + GO_ICON + '</button>' +
          '</li>';
        }).join("") + '</ol>';
      foot.innerHTML = '<button type="button" class="chip" data-sng="copy">' + esc(_t("Copy list")) + '</button>';
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("songs") || !shown) return;
      var p = e.target.closest(".sng-play"), g = e.target.closest(".sng-go"), s;
      if (p && (s = shown[+p.getAttribute("data-i")])) spotify(s);
      else if (g && (s = shown[+g.getAttribute("data-go")])){
        Side.close();
        if (Journal) Journal.jumped();
        revealElement(s.head || s.el);
      }
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("songs") || !e.target.closest("[data-sng=copy]")) return;
      copy(all().map(name).join("\n"));
    });
    function openPanel(){ Side.open("songs", _t("Soundtrack"), render, function(){ shown = null; }); }
    document.addEventListener("ll:fileopened", function(){ count = 0; closePop(true); if (Side.is("songs")) Side.close(); });

    var SVG = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    ICONS.music = SVG + '<path d="M9 18V5l11-2v13"/><path d="M6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M17 13a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>';
    var COPY_ICON = SVG + '<path d="M9 9h11v11H9z"/><path d="M5 15H4V4h11v1"/></svg>';
    var GO_ICON = SVG + '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    Menu.add({ order: 21, pgroup: "reading", porder: 40.25, group: "navigate", icon: ICONS.music, label: function(){ return _t("Soundtrack"); }, run: openPanel,
               show: function(){ return state.mode === "doc" && count > 0; } });

    return { scan: scan, say: say, parse: parse, openPanel: openPanel, list: all, count: function(){ return count; } };
  })();

  /* ============================================================
     Search inside the document (text documents and PDFs)
     ============================================================ */
  /* text of a PDF page, cached per document (search and read-aloud share it) */
  var PdfText = (function(){
    var cache = null, cacheDoc = null;
    function get(i){
      var doc = state.pdfDoc;
      if (!doc) return Promise.resolve("");
      if (cacheDoc !== doc){ cache = new Array(doc.numPages); cacheDoc = doc; }
      if (cache[i-1] !== undefined) return Promise.resolve(cache[i-1]);
      return doc.getPage(i).then(function(pg){ return pg.getTextContent(); }).then(function(tc){
        var s = "";
        tc.items.forEach(function(it){ s += it.str + (it.hasEOL ? "\n" : " "); });
        s = s.replace(/[ \t]+/g, " ");
        if (cacheDoc === doc) cache[i-1] = s;
        return s;
      }).catch(function(){ return ""; });
    }
    return { get: get };
  })();

  var Search = (function(){
    var query = "", results = [], cur = -1, gen = 0, input = null, listEl = null, statusEl = null;
    var hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function rx(q){
      var parts = q.trim().split(/\s+/).map(function(w){ return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
      return new RegExp(parts.join("\\s+"), "gi");
    }
    function snippet(text, a, b){
      var s = Math.max(0, a - 44), e = Math.min(text.length, b + 60);
      return (s > 0 ? "\u2026" : "") + esc(text.slice(s, a)) + "<b>" + esc(text.slice(a, b)) + "</b>" + esc(text.slice(b, e)) + (e < text.length ? "\u2026" : "");
    }
    /* headings with their character offsets, gathered once per search */
    function headingIndex(){
      var hs = $("#doc").querySelectorAll("h1, h2, h3"), out = [];
      for (var i = 0; i < hs.length; i++){
        var first = document.createTreeWalker(hs[i], NodeFilter.SHOW_TEXT).nextNode();
        var o = first ? Anchor.offsetOf(first, 0) : null;
        if (o !== null) out.push({ off: o, title: hs[i].textContent.replace(/\s+/g, " ").trim() });
      }
      return out;
    }
    /* the last heading at or before an offset */
    function sectionTitleFor(heads, off){
      var lo = 0, hi = heads.length - 1;
      if (hi < 0 || heads[0].off > off) return "";
      while (lo < hi){ var mid = (lo + hi + 1) >> 1; if (heads[mid].off <= off) lo = mid; else hi = mid - 1; }
      return heads[lo].title;
    }
    var painted = [];      /* { r: range, i: result, n: its text's length } as last painted */
    function paint(){
      if (!hasHL) return;
      CSS.highlights.delete("ll-find"); CSS.highlights.delete("ll-find-cur");
      painted = [];
      if (state.mode !== "doc" || !results.length) return;
      results.forEach(function(r, i){
        var range = Anchor.rangeBetween(r.start, r.end);
        if (range) painted.push({ r: range, i: i, n: range.toString().length });
      });
      setHL();
    }
    function setHL(){
      var all = [], curR = null;
      painted.forEach(function(p){ if (p.i === cur) curR = p.r; else all.push(p.r); });
      CSS.highlights.set("ll-find", new (Function.prototype.bind.apply(Highlight, [null].concat(all))));
      if (curR) CSS.highlights.set("ll-find-cur", new Highlight(curR)); else CSS.highlights.delete("ll-find-cur");
    }
    /* the text under some hits was moved (focus reading bolds a word's start by moving it into a <b>, which collapses a
       live range in it): those hits are drawn again from their offsets and the rest kept (every live range costs a
       little at each change to the page, so none are made that are not needed) */
    function repair(){
      if (!hasHL || !painted.length || state.mode !== "doc") return;
      var any = false;
      painted.forEach(function(p){
        if (p.r.toString().length === p.n) return;
        var res = results[p.i], r = res && Anchor.rangeBetween(res.start, res.end);
        if (r){ p.r = r; p.n = r.toString().length; any = true; }
      });
      if (any) setHL();
    }
    function clearPaint(){
      painted = [];
      if (hasHL){ CSS.highlights.delete("ll-find"); CSS.highlights.delete("ll-find-cur"); }
    }
    function runDoc(q){
      var text = Anchor.textNodes().map(function(n){ return n.textContent; }).join("");
      var re = rx(q), m, out = [];
      while ((m = re.exec(text)) && out.length < 500){
        out.push({ start: m.index, end: m.index + m[0].length, html: snippet(text, m.index, m.index + m[0].length) });
        if (!m[0].length) re.lastIndex++;
      }
      var heads = headingIndex();
      out.forEach(function(r){ r.where = sectionTitleFor(heads, r.start); });
      return Promise.resolve(out);
    }
    function runPdf(q, myGen){
      var doc = state.pdfDoc;
      var out = [], i = 1;
      return new Promise(function(resolve){
        (function next(){
          if (myGen !== gen || state.pdfDoc !== doc){ resolve(null); return; }
          if (i > doc.numPages){ resolve(out); return; }
          PdfText.get(i).then(function(t){
            var re = rx(q), m;
            while ((m = re.exec(t)) && out.length < 500){
              out.push({ page: i, html: snippet(t, m.index, m.index + m[0].length), where: _t("Page {n}", { n: i }) });
              if (!m[0].length) re.lastIndex++;
            }
            if (i % 10 === 0 && statusEl) statusEl.textContent = out.length ? _t("Searching\u2026 page {i} of {n} \u00B7 {k} so far", { i: i, n: doc.numPages, k: out.length }) : _t("Searching\u2026 page {i} of {n}", { i: i, n: doc.numPages });
            i++;
            if (i % 5 === 0) setTimeout(next, 0); else next();
          });
        })();
      });
    }
    function run(){
      var q = input ? input.value.trim() : "";
      query = q; cur = -1; results = []; clearPaint();
      var myGen = ++gen;
      if (!q || q.length < 2){ renderResults(); return; }
      if (statusEl) statusEl.textContent = _t("Searching\u2026");
      var job = state.mode === "pdf" ? runPdf(q, myGen) : runDoc(q);
      job.then(function(out){
        if (myGen !== gen || !out) return;
        results = out;
        renderResults();
        if (results.length){ go(0, true); }
      });
    }
    function renderResults(){
      if (!listEl) return;
      if (!query || query.length < 2){ statusEl.textContent = ""; listEl.innerHTML = '<div class="empty-note">' + _t("Type at least two letters.") + '</div>'; return; }
      var many = results.length >= 500, at = { i: cur + 1, total: results.length };
      statusEl.textContent = !results.length ? _t("No matches")
        : cur >= 0 ? (many ? _t("500+ matches \u00B7 {i} of {total}", at) : _tn(results.length, "{n} match \u00B7 {i} of {total}", "{n} matches \u00B7 {i} of {total}", at))
        : (many ? _t("500+ matches") : _tn(results.length, "{n} match", "{n} matches"));
      var bl = bookLang();
      listEl.innerHTML = results.length ? results.map(function(r, i){
        return '<div class="find-item' + (i === cur ? ' cur' : '') + '" data-i="' + i + '" role="button" tabindex="0" data-no-i18n>' + (r.where ? '<span class="find-where"' + (state.mode === "pdf" ? '' : ' lang="' + bl + '"') + '>' + esc(r.where) + '</span>' : '') + '<span lang="' + bl + '">' + r.html + '</span></div>';
      }).join("") : emptyState(ICONS.search, _t("No matches"), state.mode === "pdf" ? _t("Nothing in this PDF matches \u201C{q}\u201D.", { q: esc(query) }) : _t("Nothing in this document matches \u201C{q}\u201D.", { q: esc(query) }));
    }
    function go(i, keepPanel){
      if (!results.length) return;
      cur = (i + results.length) % results.length;
      var r = results[cur];
      if (Journal) Journal.jumped();
      if (state.mode === "pdf") Toc.goPdfPage(r.page);
      else {
        revealOffset(r.start, { center: true });
        paint();
        if (!hasHL){
          try { var range = Anchor.rangeBetween(r.start, r.end); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } catch(_){}
        }
      }
      if (Side.is("find")){
        renderResults();
        var el = listEl.querySelector(".find-item.cur"); if (el) el.scrollIntoView({ block: "nearest" });
        if (!keepPanel && window.innerWidth <= 560) Side.close();
      }
    }
    function render(body, foot){
      body.innerHTML = '<div class="find-row"><input type="search" id="findInput" aria-label="' + _t("Find in this document") + '" placeholder="' + (state.mode === "pdf" ? _t("Find in this PDF\u2026") : _t("Find in this document\u2026")) + '" autocomplete="off" spellcheck="false">' +
        '<button class="ctl" id="findPrev" title="' + _t("Previous match") + '" aria-label="' + _t("Previous match") + '">' + ICONS.chevronL + '</button><button class="ctl" id="findNext" title="' + _t("Next match") + '" aria-label="' + _t("Next match") + '">' + ICONS.chevronR + '</button></div>' +
        '<div class="find-status" id="findStatus" aria-live="polite"></div><div id="findList"></div>';
      input = body.querySelector("#findInput"); listEl = body.querySelector("#findList"); statusEl = body.querySelector("#findStatus");
      input.value = query;
      var t = null;
      input.addEventListener("input", function(){ clearTimeout(t); t = setTimeout(run, 220); });
      input.addEventListener("keydown", function(e){
        if (e.key === "Enter"){ e.preventDefault(); if (!results.length || input.value.trim() !== query) run(); else go(cur + (e.shiftKey ? -1 : 1)); }
      });
      body.querySelector("#findPrev").addEventListener("click", function(){ go(cur - 1, true); });
      body.querySelector("#findNext").addEventListener("click", function(){ go(cur + 1, true); });
      listEl.addEventListener("click", function(e){ var it = e.target.closest(".find-item"); if (it) go(+it.dataset.i); });
      listEl.addEventListener("keydown", function(e){ if (e.key === "Enter"){ var it = e.target.closest(".find-item"); if (it) go(+it.dataset.i); } });
      renderResults();
      setTimeout(function(){ input.focus(); if (query) input.select(); }, 60);
    }
    function openPanel(){
      Side.open("find", _t("Search"), render, function(){ /* keep matches painted until the next document */ }, { family: "doc" });
    }
    function reset(){ query = ""; results = []; cur = -1; clearPaint(); }
    function refresh(){ if (results.length && state.mode === "doc") paint(); }
    document.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F") && (state.mode === "doc" || state.mode === "pdf")){
        e.preventDefault(); openPanel();
      }
    });
    Menu.add({ order: 20, pgroup: "reading", porder: 40.2, group: "navigate", icon: ICONS.search, label: function(){ return _t("Search"); }, key: "/", run: openPanel, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { openPanel: openPanel, reset: reset, refresh: refresh, repair: repair, clearPaint: clearPaint, go: go, results: function(){ return results; } };
  })();

  /* ============================================================
     About this text — reading level, vocabulary, hardest words
     ============================================================ */
  var About = (function(){
    var CHUNK = 20000, WINDOW = 1000, MAX_PDF_PAGES = 600, HARD = 30, RARE = 7000, UNCOMMON = 4500;
    /* a word: letters (Latin with accents, Greek, Cyrillic) and digits, apostrophes and hyphens
       inside; "1,000" and "3.14" stay whole. Quotes and sentence ends come through as their
       own matches so one pass sees them all */
    var TOKEN = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ0-9]+(?:['’-][A-Za-zÀ-ɏͰ-ϿЀ-ӿ0-9]+|[.,][0-9]+)*|["“”]|[.!?…]+/g;
    var SENT_END = /[.!?…]+[”’"')\]]*(?=\s|$)/g;
    var HASWORD = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ0-9]/;
    var WORDY = /^[a-zà-ɏͰ-ϿЀ-ӿ]+(?:['-][a-zà-ɏͰ-ϿЀ-ӿ]+)*$/;
    var ABBR = { mr:1, mrs:1, ms:1, dr:1, st:1, vs:1, "e.g":1, "i.e":1, etc:1, prof:1, sr:1, jr:1, mt:1, fig:1, vol:1, pp:1, inc:1, ltd:1, "a.m":1, "p.m":1, "u.s":1, "u.k":1 };
    var BANDS = [
      [90, "Very easy", "Easily understood by an average 11-year-old."],
      [80, "Easy", "Conversational English; most 12-year-olds can follow it."],
      [70, "Fairly easy", "Most 13-year-olds can follow it."],
      [60, "Standard", "Plain English; easily understood by most 14- to 15-year-olds."],
      [50, "Fairly difficult", "Fairly hard to read; comfortable for older teenagers."],
      [30, "Difficult", "Hard to read; best understood by university-level readers."],
      [0,  "Very difficult", "Very hard to read; best understood by graduates and specialists."]
    ];
    var TIER = { 3: "very rare", 2: "rare", 1: "uncommon" };
    var FIND_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="6.8" cy="6.8" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>';
    var cache = null, gen = 0, statusEl = null;
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    /* 12,345 and 4.5 in English; 12.345 and 4,5 in Dutch */
    function fmtN(n){ return I18N.lang() === "nl" ? I18N.num(Math.round(n)) : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    function one(n){ return dec(Math.round(n * 10) / 10, 1).replace(/[.,]0$/, ""); }

    /* ---- syllables: an English heuristic ----
       vowel groups, minus the silent endings, plus the vowel pairs that are usually spoken
       apart; a short list of very common words the rules get wrong */
    var SYL_FIX = { every:2, everything:3, everyone:3, everybody:4, everywhere:3, evening:2, something:2, sometimes:2,
      somewhere:2, someone:2, somebody:3, somehow:2, somewhat:2, business:2, businesses:3, eye:1, eyes:1, eyed:1,
      area:3, areas:3, idea:3, ideas:3, real:2, really:2, science:2, sciences:3, society:4, theatre:3, poem:2, poems:2,
      poet:2, poets:2, poetry:3 };
    function syllables(word){
      var w = String(word).toLowerCase().replace(/[^a-zà-öø-ÿ]/g, "");
      if (!w) return 1;
      if (SYL_FIX.hasOwnProperty(w)) return SYL_FIX[w];
      var s = w.replace(/^y/, "").replace(/qu/g, "q");
      /* silent -es / -ed ("makes", "jumped"), not "boxes", "pages", "tables", "wanted", "settled", "agreed" */
      if (/es$/.test(s) && !/(?:[sxzcg]|[cs]h)es$/.test(s) && !/[^aeiouylr]les$/.test(s)) s = s.slice(0, -2);
      else if (/ed$/.test(s) && !/[tde]ed$/.test(s) && !/[^aeiouylr]led$/.test(s)) s = s.slice(0, -2);
      var n = (s.match(/[aeiouyà-öø-ÿ]+/g) || []).length;
      /* a silent final e ("whale", "some", "bye"), unless it sounds after l + consonant ("table") */
      if (/[^aeiou]e$/.test(s) && !/[^aeiouy]le$/.test(s)) n--;
      /* the same e before -ly, -ment, -ness… ("lonely", "movement"), but not in "settlement" */
      if (/[^aeiouy]e(?:ly|ment|ness|less|ful|some)$/.test(s) && !/[^aeiouy]le(?:ly|ment|ness|less|ful|some)$/.test(s)) n--;
      /* vowel pairs spoken as two: "quiet", "client", "radio", "video", "actual", "chaos", "radius" — but
         "nation", "special", "people", "pigeon", "million", "guard" keep one */
      n += (s.match(/[^tcs]ie[nt](?!d)|[^ctsx]ia|[^tscxgn]io|[^g]eo(?!p)|geo(?![nu])|[^gq]ua|uo|ao|ii|iu/g) || []).length;
      n -= (s.match(/llio/g) || []).length;
      /* "going", "seeing", "playing"; "player", "royal", "beyond" */
      if (/[aeiouy]ing$/.test(s)) n++;
      n += (s.match(/[aeiou]y(?!ing$)[aeiou]/g) || []).length;
      return Math.max(1, n);
    }

    /* ---- the text ----
       a document block by block: a blank line between blocks (paragraph breaks end sentences),
       a line break for <br>; the text nodes as they are, so counts match what is shown */
    var BLOCK = /^(?:P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TR|TD|TH|DT|DD|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|FIGURE|FIGCAPTION|UL|OL|TABLE|CAPTION|HR|NAV|MAIN|DETAILS|SUMMARY|ADDRESS)$/;
    function docText(){
      var out = [], w = document.createTreeWalker($("#doc"), NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())){
        if (n.nodeType === 3) out.push(n.nodeValue);
        else if (n.tagName === "BR") out.push("\n");
        else if (BLOCK.test(n.tagName)) out.push("\n\n");
      }
      return out.join("");
    }
    /* every page of the PDF, one after another with a breather between pages; each page is a
       paragraph, words split by a line-end hyphen are joined again */
    function pdfText(doc, status, live){
      var n = Math.min(doc.numPages, MAX_PDF_PAGES), pages = [], i = 1;
      return new Promise(function(resolve){
        (function next(){
          if (!live()){ resolve(null); return; }
          if (i > n){ resolve({ text: pages.join("\n\n"), capped: doc.numPages > n }); return; }
          status(_t("Reading page {i} of {n}…", { i: i, n: doc.numPages }));
          PdfText.get(i).then(function(t){
            pages.push(t.replace(/([A-Za-zÀ-ɏ])-\n\s*([a-zà-ɏ])/g, "$1$2"));
            i++;
            setTimeout(next, 0);
          });
        })();
      });
    }

    /* ---- sentences ----
       an end is . ! ? or … before a space, unless what comes before is an abbreviation or an
       initial, or what follows starts in lower case ("e.g. this", "wait… what"). A number that
       opens the paragraph is a list marker, not a sentence */
    function sentencesIn(p){
      var n = 0, last = 0, m;
      SENT_END.lastIndex = 0;
      while ((m = SENT_END.exec(p))){
        var end = m.index + m[0].length;
        if (m[0].charAt(0) === "."){
          var prev = /([A-Za-zÀ-ɏ]+(?:\.[A-Za-zÀ-ɏ]+)*)$/.exec(p.slice(Math.max(0, m.index - 12), m.index));
          if (prev){
            var a = prev[1].toLowerCase();
            if (ABBR[a] || (a.length === 1 && prev[1] !== "I" && prev[1] !== a)) continue;
          } else if (m.index <= 3 && /^\s*\d{1,3}$/.test(p.slice(0, m.index))) continue;
        }
        if (/^\s+[a-zà-ɏ]/.test(p.slice(end, end + 4))) continue;
        if (HASWORD.test(p.slice(last, m.index))) n++;
        last = end;
      }
      if (HASWORD.test(p.slice(last))) n++;
      return n;
    }

    /* ---- counting ----
       one pass over the text in chunks of CHUNK words with a breather between them, so a whole
       novel is counted without freezing the page. Resolves to the stats, or null when `live`
       says the result is no longer wanted */
    function analyse(text, opts){
      opts = opts || {};
      var paras = String(text).replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/);
      var forms = new Map(), words = 0, sentences = 0, paragraphs = 0, dialogue = 0;
      var win = new Set(), winN = 0, ttrSum = 0, windows = 0;
      var pi = 0, pos = 0, pw = 0, inQ = false, atStart = true;
      return new Promise(function(resolve){
        function live(){ return !opts.live || opts.live(); }
        function step(){
          if (!live()){ resolve(null); return; }
          var budget = CHUNK;
          while (pi < paras.length){
            var p = paras[pi], m = null;
            TOKEN.lastIndex = pos;
            while (budget > 0 && (m = TOKEN.exec(p))){
              var t = m[0], c = t.charCodeAt(0);
              if (c === 34){ inQ = !inQ; continue; }
              if (c === 0x201C){ inQ = true; continue; }
              if (c === 0x201D){ inQ = false; continue; }
              if (c === 46 || c === 33 || c === 63 || c === 0x2026){ atStart = true; continue; }
              budget--; words++; pw++;
              if (inQ) dialogue++;
              var lw = t.toLowerCase();
              if (lw.indexOf("’") >= 0) lw = lw.replace(/’/g, "'");
              var f = forms.get(lw);
              if (!f){ f = { n: 0, mid: 0, capMid: 0 }; forms.set(lw, f); }
              f.n++;
              /* capitals count only away from a sentence start, where every word gets one */
              if (atStart) atStart = false;
              else { f.mid++; if (t.charAt(0) !== lw.charAt(0)) f.capMid++; }
              win.add(lw);
              if (++winN === WINDOW){ ttrSum += win.size / WINDOW; windows++; win.clear(); winN = 0; }
            }
            if (m){ pos = TOKEN.lastIndex; if (opts.onProgress) opts.onProgress(words); setTimeout(step, 0); return; }
            if (pw){ paragraphs++; sentences += sentencesIn(p); }
            pi++; pos = 0; pw = 0; inQ = false; atStart = true;
          }
          finish();
        }
        /* per distinct form once, then weighted by how often it occurs */
        function finish(){
          var keys = [], ki = 0, hapax = 0, syl = 0, letters = 0;
          forms.forEach(function(f, w){ keys.push(w); });
          (function more(){
            if (!live()){ resolve(null); return; }
            var stop = Math.min(keys.length, ki + 5000);
            for (; ki < stop; ki++){
              var w = keys[ki], f = forms.get(w);
              f.syl = syllables(w); f.len = w.replace(/['-]/g, "").length;
              syl += f.syl * f.n; letters += f.len * f.n;
              if (f.n === 1) hapax++;
            }
            if (ki < keys.length){ setTimeout(more, 0); return; }
            var s = Math.max(1, sentences), safe = Math.max(1, words);
            var asl = words / s, asw = syl / safe;
            resolve({
              words: words, unique: forms.size, sentences: s, paragraphs: paragraphs, syllables: syl, letters: letters,
              dialogue: dialogue, hapax: hapax, forms: forms,
              avgSentence: asl, avgWord: letters / safe,
              ttr: windows ? ttrSum / windows : (words ? forms.size / words : 0),
              flesch: Math.round(Math.max(0, Math.min(100, 206.835 - 1.015 * asl - 84.6 * asw))),
              grade: 0.39 * asl + 11.8 * asw - 15.59,
              cli: 0.0588 * (letters / safe * 100) - 0.296 * (s / safe * 100) - 15.8,
              note: null, hard: null
            });
          })();
        }
        step();
      });
    }

    /* ---- reading the numbers ---- */
    function band(score){ for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i][0]) return BANDS[i]; return BANDS[BANDS.length - 1]; }
    function gradeText(g){
      var n = Math.round(g);
      if (n < 1) return _t("before grade 1 · about age 5–6");
      if (n >= 17) return _t("beyond grade 16 · postgraduate reading");
      if (n >= 13) return _t("grade {n} · university level", { n: n });
      return _t("grade {n} · about age {a}–{b}", { n: n, a: n + 5, b: n + 6 });
    }
    function ttrLabel(r){ return r < 0.40 ? _t("Simple") : r < 0.48 ? _t("Moderate") : r < 0.56 ? _t("Rich") : _t("Very rich"); }
    function readingTime(words){
      var min = words / Math.max(60, Progress.wpm());
      if (min < 1) return _t("under a minute");
      if (min < 59.5) return _t("about {n} min", { n: Math.round(min) });
      var h = Math.floor(min / 60), m = Math.round(min % 60);
      if (m === 60){ h++; m = 0; }
      return m ? _t("about {h} h {m} min", { h: h, m: m }) : _t("about {h} h", { h: h });
    }
    /* the hardest words: outside the common-word list (or in its long tail), the long and
       many-syllabled first; names, numbers and short words don't count */
    function rankOf(ex, w){
      var r = ex.rank(w);
      if (ex.lemmas) ex.lemmas(w).forEach(function(l){ r = Math.min(r, ex.rank(l[0])); });
      return r;
    }
    function hardest(st){
      var ex = window.llExplain;
      if (!ex || !st || !st.forms) return null;
      var out = [];
      st.forms.forEach(function(f, w){
        if ((f.mid && f.capMid === f.mid) || !WORDY.test(w)) return;
        var len = f.len !== undefined ? f.len : w.replace(/['-]/g, "").length;
        if (len < 4) return;
        var r = rankOf(ex, w), tier = r === Infinity ? 3 : r > RARE ? 2 : r > UNCOMMON ? 1 : 0;
        if (!tier) return;
        var syl = f.syl !== undefined ? f.syl : syllables(w);
        out.push({ w: w, n: f.n, tier: tier, syl: syl, score: tier * 4 + len * 0.5 + syl * 1.5 });
      });
      out.sort(function(a, b){ return b.score - a.score || a.n - b.n || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0); });
      return out.slice(0, HARD);
    }

    /* ---- the panel ---- */
    function docLabel(){
      var id = Library.currentId(), b = Library.books().filter(function(x){ return x.id === id; })[0];
      return { name: bookName(b) || $("#fname").textContent || _t("This document"),
               type: b ? b.type : (state.mode === "pdf" ? "PDF" : "") };
    }
    function keyNow(){
      return (Library.currentId() || "") + ":" + state.mode + ":" + (state.mode === "pdf" ? (state.pdfDoc ? state.pdfDoc.numPages : 0) : $("#doc").textContent.length);
    }
    function header(st){
      var d = docLabel();
      return '<div class="about-doc"><span class="about-name" data-no-i18n>' + esc(d.name) + '</span>' +
        (d.type ? '<span class="about-fmt">' + esc(d.type) + '</span>' : '') +
        (st && st.note ? '<span class="about-part">' + esc(st.note) + '</span>' : '') + '</div>';
    }
    function tile(value, label, cls){ return '<div class="about-tile' + (cls ? ' ' + cls : '') + '"><b>' + value + '</b><span>' + label + '</span></div>'; }
    function wordRow(x){
      return '<div class="about-row"><button type="button" class="about-word" data-w="' + esc(x.w) + '">' +
        '<span class="w" lang="' + bookLang() + '" data-no-i18n>' + esc(x.w) + '</span><span class="n">×' + x.n + '</span><span class="r">' + _t(TIER[x.tier]) + '</span></button>' +
        '<button type="button" class="about-find" data-find="' + esc(x.w) + '" title="' + _t("Find in the text") + '" aria-label="' + esc(_t("Find “{word}” in the text", { word: x.w })) + '">' + FIND_ICON + '</button></div>';
    }
    function draw(st){
      var body = Side.body, foot = Side.foot, h = header(st);
      statusEl = null;
      if (!st.words){
        body.innerHTML = h + '<div class="empty-note">' + _t("Nothing to count yet.") + '</div>';
        foot.innerHTML = ""; foot.style.display = "none";
        return;
      }
      var bd = band(st.flesch), share = Math.round(st.dialogue / st.words * 100);
      h += '<h2 class="about-h sec">' + _t("At a glance") + '</h2><div class="about-grid">' +
        tile(fmtN(st.words), _t("Words")) + tile(fmtN(st.unique), _t("Unique words")) + tile(fmtN(st.sentences), _t("Sentences")) +
        tile(esc(readingTime(st.words)), _t("Reading time at your speed"), "full") +
        tile(one(st.avgSentence), _t("Words per sentence")) + tile(one(st.avgWord), _t("Letters per word")) +
        (share > 0 ? tile(share + "%", _t("Dialogue")) : "") + '</div>';
      h += '<h2 class="about-h sec">' + _t("Reading level") + '</h2><div class="about-level">' +
        '<div class="about-score"><b>' + st.flesch + '</b><span>' + _t(bd[1]) + '</span><small>' + _t("Flesch reading ease") + '</small></div>' +
        '<div class="about-scale" aria-hidden="true"><i style="left:' + st.flesch + '%"></i></div>' +
        '<div class="about-ends" aria-hidden="true"><span>' + _t("harder") + '</span><span>' + _t("easier") + '</span></div>' +
        '<p class="about-note">' + esc(_t(bd[2])) + '</p>' +
        '<p class="about-note muted">Flesch–Kincaid: ' + gradeText(st.grade) + '<br>' + _t("Coleman–Liau, as a second opinion: {grade}", { grade: gradeText(st.cli) }) + '</p></div>';
      h += '<h2 class="about-h sec">' + _t("Vocabulary") + '</h2><div class="about-grid">' +
        tile(ttrLabel(st.ttr), _t("Vocabulary richness ({n})", { n: dec(st.ttr, 2) }), "wide") + tile(fmtN(st.hapax), _t("Words used only once")) + '</div>';
      h += '<h2 class="about-h sec">' + _t("Hardest words") + '</h2><div class="about-words" id="aboutWords"><div class="empty-note">' + _t("Preparing…") + '</div></div>';
      body.innerHTML = h;
      foot.innerHTML = '<button class="chip" data-about="copy">' + _t("Copy") + '</button>' +
        '<div class="about-foot-note">' + _t("Counts are from the text as shown; numbers, headings and captions are included.") + '</div>';
      foot.style.display = "flex";
      fillHardest(st);
    }
    /* the word list needs explain.js's frequency list, fetched the first time it is wanted */
    function fillHardest(st){
      var el = function(){ return Side.is("about") && cache && cache.stats === st ? Side.body.querySelector("#aboutWords") : null; };
      need(["explain"]).then(function(){
        var box = el(); if (!box) return;
        var list = hardest(st) || [];
        st.hard = list;
        box.innerHTML = list.length ? list.map(wordRow).join("") : '<div class="empty-note">' + _t("No unusual words — everything here is everyday English.") + '</div>';
      }, function(){
        var box = el(); if (box) box.innerHTML = '<div class="empty-note">' + _t("Couldn’t load the word list.") + '</div>';
      });
    }
    function compute(){
      var myGen = ++gen, key = keyNow(), mode = state.mode, pdf = state.pdfDoc, note = null;
      function live(){ return myGen === gen && Side.is("about") && state.mode === mode && (mode !== "pdf" || state.pdfDoc === pdf); }
      function status(msg){ if (live() && statusEl) statusEl.textContent = msg; }
      /* a document switched to a moment ago may still be rendering: count it once it is in */
      function whenReady(){
        return new Promise(function(resolve){
          (function poll(n){
            var ready = !state.opening && (state.mode !== "doc" || Library._debug().ready.doc);
            if (ready || n > 150) resolve(); else { status(_t("Waiting for the document\u2026")); setTimeout(function(){ poll(n + 1); }, 100); }
          })(0);
        });
      }
      var src = whenReady().then(function(){
        if (!live()) return null;
        return mode === "pdf" && pdf
          ? pdfText(pdf, status, live).then(function(r){ if (r && r.capped) note = _t("first {n} pages", { n: MAX_PDF_PAGES }); return r ? r.text : null; })
          : docText();
      });
      src.then(function(text){
        if (text === null || !live()) return null;
        status(_t("Counting words…"));
        return analyse(text, { live: live, onProgress: function(n){ status(_t("Counting words… {n} so far", { n: fmtN(n) })); } });
      }).then(function(st){
        if (!st || !live()) return;
        st.note = note;
        cache = { key: key, stats: st };
        draw(st);
      }).catch(function(err){ console.warn("about: couldn’t read the text", err); status(_t("Couldn’t read the text.")); });
    }
    function render(body){
      var key = keyNow();
      if (cache && cache.key === key){ draw(cache.stats); return; }
      body.innerHTML = header() + '<div class="empty-note" id="aboutStatus" aria-live="polite">' + _t("Reading the text…") + '</div>';
      statusEl = body.querySelector("#aboutStatus");
      compute();
    }
    function openPanel(){
      if (!docOpen()) return;
      Side.open("about", _t("About this text"), render, function(){ gen++; statusEl = null; }, { family: "doc" });
    }
    /* a plain-text summary for the clipboard */
    function summary(st, name){
      var bd = band(st.flesch), share = Math.round(st.dialogue / Math.max(1, st.words) * 100), out = [];
      out.push(st.note ? _t("About “{name}” ({note})", { name: name, note: st.note }) : _t("About “{name}”", { name: name }));
      out.push(_t("Words: {words} · unique words: {unique} · sentences: {sentences}", { words: fmtN(st.words), unique: fmtN(st.unique), sentences: fmtN(st.sentences) }));
      out.push(_t("Reading time: {time} at {wpm} words a minute", { time: readingTime(st.words), wpm: Math.round(Progress.wpm()) }));
      var avg = { s: one(st.avgSentence), w: one(st.avgWord), pct: share };
      out.push(share > 0 ? _t("Average sentence: {s} words · average word: {w} letters · dialogue: {pct}%", avg) : _t("Average sentence: {s} words · average word: {w} letters", avg));
      out.push(_t("Reading level: Flesch reading ease {score} ({band}) — {text}", { score: st.flesch, band: _t(bd[1]), text: _t(bd[2]) }));
      out.push("Flesch–Kincaid: " + gradeText(st.grade) + " · Coleman–Liau: " + gradeText(st.cli));
      out.push(_t("Vocabulary richness: {label} ({ttr}) · words used only once: {n}", { label: ttrLabel(st.ttr), ttr: dec(st.ttr, 2), n: fmtN(st.hapax) }));
      if (st.hard && st.hard.length) out.push(_t("Hardest words: {list}", { list: st.hard.map(function(x){ return x.w + " (" + x.n + ")"; }).join(", ") }));
      return out.join("\n");
    }
    function copy(text){
      var done = function(){ Marks.toast(_t("Copied")); }, fail = function(){ Marks.toast(_t("Couldn’t copy")); };
      if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done, fail); return; }
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand("copy"); ta.remove();
        if (ok) done(); else fail();
      } catch(_){ fail(); }
    }
    /* Search has no query API: open it, then type into its box */
    function findWord(word){
      Search.openPanel();
      var input = Side.body.querySelector("#findInput");
      if (input){ input.value = word; input.dispatchEvent(new Event("input", { bubbles: true })); }
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("about")) return;
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.w !== undefined){ if (window.llDict) window.llDict.defineWord(b.dataset.w); }
      else if (b.dataset.find !== undefined) findWord(b.dataset.find);
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("about") || !cache) return;
      var b = e.target.closest("button[data-about]"); if (!b) return;
      copy(summary(cache.stats, docLabel().name));
    });
    /* a new document (a file, or another tab) replaces the text under the panel: its numbers
       would be the old document's, so the panel closes, which also stops a count under way */
    document.addEventListener("ll:fileopened", function(){ if (Side.is("about")) Side.close(); });
    Menu.add({ order: 60, pgroup: "reading", porder: 40.3, group: "navigate", icon: ICONS.info, label: function(){ return _t("About this text"); }, key: "I", run: openPanel, show: docOpen });
    window.llAbout = { openPanel: openPanel, stats: analyse, syllables: syllables, sentences: sentencesIn, hardest: hardest, summary: summary };
    return { openPanel: openPanel, stats: analyse, syllables: syllables, hardest: hardest };
  })();

  /* ============================================================
     Read aloud — sentence by sentence, with a narrator, a second voice
     for quoted speech (or a device voice per character, cast by
     audiobook.js) and a little expression read off the text, through a
     pluggable engine: the device voice (Web Speech API, built in below)
     or one that registers itself, such as ElevenLabs narration or the
     natural voices (Piper or Kokoro, run on the device) in audiobook.js.
     Engine interface: label, supported(), prepare(units, ctx) → Promise
     (or nothing: the device path stays synchronous), speak(i, opts),
     cancel(); optionally ready() → Promise<bool> (may ask for a key),
     setRate(rate), fillVoices(select), voiceChanged(value),
     narratorName(), stop(), syncSettings(asked).
     opts: { rate, ramp, live(), onend({ advanceTo, pauseAfter }?),
             onerror(err), onboundary(start, end, unitIndex) }
     ============================================================ */
  var Speak = (function(){
    var supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    var bar = $("#tts"), playBtn = $("#ttsPlay"), rateEl = $("#ttsRate"), rateV = $("#ttsRateV"), voiceSel = $("#ttsVoice");
    var voicesBtn = $("#ttsVoiceBtn"), voiceNameEl = $("#ttsVoiceName"), sleepBtn = $("#ttsSleep");
    var units = [], idx = -1, playing = false, active = false, utter = null, gen = 0, pdfPage = 0, pdfUnitsDoc = null;
    var startGen = 0;     /* bumped by every start and stop: a PDF page load from an earlier reading bails out */
    var wait = null, between = false, sampleGen = 0, voiceKey = "";
    var rate = parseFloat(Store.get("ll_tts_rate") || "1") || 1;
    var voiceName = "";        /* the narrator's voice id, remembered per language */
    var dialogueName = "";     /* "" = auto (the other voice), "same", or a voice id */
    var expr = Store.get("ll_tts_expr") || "natural";           /* off | natural | dramatic */
    var pitchPref = clamp(parseFloat(Store.get("ll_tts_pitch") || "1") || 1, 0.7, 1.3);
    var hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
    if (!/^(off|natural|dramatic)$/.test(expr)) expr = "natural";
    var speedBtn = $("#ttsSpeed"), speedPop = $("#ttsSpeedPop");
    /* the speed as the chip says it: one decimal (1.0×), two where a preset needs them (1.25×) */
    function fmtRate(r){ var x = Math.round(r * 100) / 100; return (Math.abs(x * 10 - Math.round(x * 10)) < 1e-6 ? dec(x, 1) : dec(x, 2)) + "×"; }
    function showRate(){
      var t = fmtRate(rate);
      rateV.textContent = t; $("#ttsRateN").textContent = t;
      speedBtn.setAttribute("aria-label", _t("Speed {x} — change", { x: t }));
      rateEl.setAttribute("aria-valuetext", t);
      Array.prototype.forEach.call(document.querySelectorAll("#ttsPresets .chip"), function(c){
        var on = Math.abs(+c.dataset.rate - rate) < 0.001; c.classList.toggle("on", on); c.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    /* the presets' numbers with the decimal comma in Dutch (1,25×) */
    if (I18N.lang() === "nl") Array.prototype.forEach.call(document.querySelectorAll("#ttsPresets .chip"), function(c){ c.textContent = c.textContent.replace(".", ","); });
    rateEl.value = rate; showRate();
    function clamp(x, lo, hi){ return Math.min(hi, Math.max(lo, x)); }

    /* ---- engines ---- */
    var ENGINE_LIB = { eleven: "audiobook", piper: "audiobook", kokoro: "audiobook" };   /* which on-demand script provides an engine */
    var engineName = /^(eleven|piper|kokoro)$/.test(Store.get("ll_tts_engine") || "") ? Store.get("ll_tts_engine") : "device";
    /* natural voices come in two qualities (ll_natural_quality): Fast, Piper ("piper"), keeps up with reading on a phone;
       Best, Kokoro ("kokoro"), is slower than reading there. Once, a reader on Kokoro is moved to Fast; Best is a tap away */
    if (Store.get("ll_natural_moved") !== "1"){
      Store.set("ll_natural_moved", "1");
      if (engineName === "kokoro"){ engineName = "piper"; Store.set("ll_tts_engine", "piper"); Store.set("ll_natural_quality", "fast"); }
    }
    function isNatural(name){ return name === "piper" || name === "kokoro"; }
    var castOn = Store.get("ll_tts_cast") !== "off";  /* a device voice per character (audiobook.js works out who speaks) */
    var engines = {}, runEngine = null, ctx = null, session = 0, devPlan = null;
    var planned = 0, replanT = null;                  /* units the engine has planned; a re-plan waiting while PDF pages load */
    /* one audio element for engines that play clips: it is created and touched inside the user gesture that starts
       reading, since iOS Safari only lets an element play later once a gesture has played or loaded it */
    var sharedAudio = null, audioPrimed = false;
    function audioElement(){
      if (!sharedAudio){ sharedAudio = new Audio(); sharedAudio.preload = "auto"; }
      return sharedAudio;
    }
    function primeAudio(){
      if (audioPrimed || engineName === "device" || !window.Audio) return;
      try { audioElement().load(); audioPrimed = true; } catch(_){}
    }
    function registerEngine(name, engine){ engine.name = name; engines[name] = engine; }
    function engineFor(){ return runEngine || engines.device; }
    /* the engine chosen in settings, loaded on demand; the device voice when it cannot run */
    function chooseEngine(cb){
      if (engineName === "device" || (!engines[engineName] && !ENGINE_LIB[engineName])){ cb(engines.device); return; }
      var fallback = function(){ Marks.toast(_t("Using the device voice")); cb(engines.device); };
      (engines[engineName] ? Promise.resolve() : need([ENGINE_LIB[engineName]])).then(function(){
        var eng = engines[engineName];
        if (!eng) return fallback();
        if (!eng.supported()){ Marks.toast(_t("{name} isn’t available in this browser", { name: eng.label })); cb(engines.device); return; }
        /* null: the engine cannot run this time and has already said why, so no second toast */
        return Promise.resolve(eng.ready ? eng.ready() : true).then(function(ok){ if (ok) cb(eng); else if (ok === null) cb(engines.device); else fallback(); });
      }).catch(function(err){ console.warn("read-aloud engine", err); fallback(); });
    }
    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

    /* ---- what language this document is in ----
       Which voices to offer, and what to tell the engine, both hang on this. The browser's
       detector reads the first couple of thousand characters where there is one; failing that,
       what the book declares (an EPUB's dc:language); failing that, the page's own language.
       The answer is kept per document, and #doc carries it so hyphenation follows the text. */
    var declaredLang = "", detectedLang = "", langGen = 0, langSeen = {}, lastPrefix = null;
    /* the fallback is English, not <html lang>: that follows the interface (i18n.js), which may be Dutch */
    function docLang(){ return (detectedLang || declaredLang || "en").slice(0, 2).toLowerCase(); }
    function applyDocLang(){
      var d = $("#doc"), l = detectedLang || declaredLang;
      if (d && l) d.setAttribute("lang", l);
      loadForLang();
      if (Side.is("voices")) Side.refresh("voices", renderPanel);
    }
    function setDocLang(l){
      l = String(l || "").trim();
      if (!l) return;
      declaredLang = l; applyDocLang();
    }
    /* without a detector (most browsers): Dutch is told from English by its commonest words, so a Dutch book gets
       Dutch voices (and the English-only natural voices step aside). Only Dutch is guessed, and only when its words
       clearly outnumber English ones; anything else is left to what the book declares */
    function wordSet(s){ var o = {}; s.split(" ").forEach(function(w){ o[w] = 1; }); return o; }
    var NL_WORDS = wordSet("de het een en van ik je niet dat zijn op te met voor maar ze hij zij er wat naar ook als bij nog uit wel mijn geen door heeft " +
                           "werd heb kan zou wordt deze dit hun ons jij wij toen nu hoe waar zich hebben worden omdat want dus nooit iets niets zei tot aan zo haar");
    var EN_WORDS = wordSet("the and of to that it he for on with as his they at be this have from or by but not what all were when your can said there " +
                           "which she do their if will would been has her him my you them then could into its our who did very just than more about after");
    function guessLang(text){
      var ws = String(text).toLowerCase().match(/[a-zà-ÿ]+/g) || [], nl = 0, en = 0, i;
      for (i = 0; i < ws.length; i++){ if (NL_WORDS[ws[i]] === 1) nl++; else if (EN_WORDS[ws[i]] === 1) en++; }
      return nl >= 12 && nl > en * 3 ? "nl" : "";
    }
    function guessed(text, key){
      var l = guessLang(text);
      if (!l) return false;
      detectedLang = l;
      if (key) langSeen[key] = l;
      return true;
    }
    /* the browser's on-device detector, where it exists; anything it can't place is left alone */
    function detectFrom(text, key){
      text = String(text || "").slice(0, 2000);
      if (!/\S{20}|\S+\s+\S+\s+\S+/.test(text)) return;
      if (key && langSeen[key]){ detectedLang = langSeen[key]; applyDocLang(); return; }
      var LD = window.LanguageDetector || (window.ai && window.ai.languageDetector) || null;
      if (!LD || typeof LD.create !== "function"){ guessed(text, key); applyDocLang(); return; }
      var my = ++langGen;
      Promise.resolve(LD.create()).then(function(det){ return det.detect(text); }).then(function(rs){
        if (my !== langGen) return;
        var top = rs && rs[0], l = top && (top.detectedLanguage || top.language) || "";
        if (!l || l === "und"){ if (guessed(text, key)) applyDocLang(); return; }
        detectedLang = l;
        if (key) langSeen[key] = l;
        applyDocLang();
      }).catch(function(){ if (my === langGen && guessed(text, key)) applyDocLang(); });
    }
    /* a new file wipes the last answer; the text itself arrives later, when #doc is rebuilt */
    document.addEventListener("ll:fileopened", function(){
      declaredLang = ""; detectedLang = ""; langGen++; lastPrefix = null;
    });
    if (typeof MutationObserver !== "undefined") new MutationObserver(function(){
      var t = ($("#doc").textContent || "").slice(0, 2000);
      if (t === lastPrefix) return;
      lastPrefix = t;
      detectFrom(t, Library.currentId && Library.currentId());
      /* natural voices make the document's first minute of audio as soon as it opens (audiobook.js, once the model is on the
         device), so a first play starts at once; more is made only once read aloud is on */
      if (isNatural(engineName)) need(["audiobook"]).then(function(){ if (window.llAudiobook && window.llAudiobook.feed) window.llAudiobook.feed(3000); }).catch(function(){});
    }).observe($("#doc"), { childList: true });

    /* ---- voices ----
       The API says nothing about gender or quality, so both are read off the voice's name and
       its voiceURI. Android names four voices "English United States" and puts the only clue in
       the URI (en-us-x-sfg#female_1-local); Microsoft writes "Microsoft Aria Online (Natural) -
       English (United States)"; Apple hides the name in a bundle id. Whatever the guess, a
       reader can correct it from the picker, and that correction wins for good. */
    function set(s){ var o = {}; s.split(" ").forEach(function(w){ if (w) o[w] = 1; }); return o; }
    var WOMEN = set("samantha karen moira tessa fiona victoria kate serena allison ava susan zira hazel heera aria jenny sara sonia libby emma olivia amy joanna kendra kimberly salli ivy nicole raveena aditi zoe flo martha shelley nicky sandy grandma kathy princess vicki catherine natasha matilda isha veena sangeeta anna alice ellen laura paulina monica luciana joana yuna kyoko ting-ting mei-jia sin-ji lekha milena amelie audrey aurelie chantal marie carmit damayanti ioana melina alva nora satu zosia zuzana mariska kanya yelda helena petra federica paola angelica marisol laila o-ren yu-shu linda hedda katja hortense julie elsa haruka ayumi sayaka heami huihui yaoyao hanhan yating tracy irina maria gadis kalpana hoda vlasta heidi helle sabina daria ewa " +
      /* Microsoft's natural (neural) set, and the Samsung / CereProc / Acapela names */
      "michelle ana maisie clara emily molly luna leah mia nancy neerja denise vivienne amala louisa isabella elvira dalia paloma francisca nanami sunhi xiaoxiao xiaoyi yunjhe hiujia hsiaochen aarohi kalina nabanita vesna adri lena bianca giselle carla pernille sofie noora hulda dhwani gul dilara hila rehema imani zuri ella marta agnieszka wanda inga tanishaa yasmin heather rachel lucy sharon katherine sarah nadia astrid xenia klara ines lia salome eleni zofia bella " +
      "jessa shruti swara sneha kavya nilam eda seyma leyla oksana polina svetlana anu");
    var MEN = set("daniel alex fred david george mark ryan guy christopher eric steffan thomas brian matthew joey justin kevin russell aaron arthur gordon lee oliver reed rishi rocko tom bruce junior ralph albert eddy grandpa evan nathan jamie jorge diego juan carlos luca xander yannick maged majed tarik otoya hattori nicolas markus viktor jordi li-mu yuri james richard sean stefan conrad paul pablo raul cosimo ichiro kangkang zhiwei danny pavel adam frank andika hemant naayf ivan filip lado szabolcs jakub karsten jon bengt pattara tolga rizwan ravi " +
      /* Microsoft's natural (neural) set, and the Samsung / CereProc / Acapela names */
      "davis tony jason roger brandon andrew alfie william duncan liam connor mitchell sam wayne prabhat henri killian alvaro keita injoon yunxi yunyang yunjian wangwen hamed shakir bassel moaz taim saleh hoang namminh dmitry maxim borys ostap jonas mattias finn magnus harri klaus bernd christoph lorenzo antonio miguel rodrigo joaquin nestor rafael arnau macia " +
      "graham rod will peter giles madhur mohan valluvar arjun anbu kumar orhan ahmet burak taha");
    /* old, thin voices and outright novelties: kept, but never recommended */
    var PLAIN = set("fred albert junior ralph bruce kathy princess agnes bahh bells boing bubbles cellos deranged hysterical jester organ superstar trinoids whisper zarvox wobble");
    var NOVELTY = /\b(bad|good) news\b|\bpipe organ\b|\bzarvox\b|\btrinoids\b|\bbubbles\b|\bderanged\b|\bboing\b|\bjester\b|\bsuperstar\b/i;
    var GOOD = /natural|neural|premium|enhanced|siri|wavenet|studio/i;
    var THIN = /compact|e-?speak|pico|flite|festival/i;

    function nameOf(v){ return typeof v === "string" ? v : (v && v.name) || ""; }
    function uriOf(v){ return typeof v === "string" ? "" : (v && v.voiceURI) || ""; }
    /* a voice's stable id: Android gives four voices one name, so the URI comes first */
    function voiceId(v){ return typeof v === "string" ? v : (v && (v.voiceURI || v.name)) || ""; }
    function readMap(key){
      try { var o = JSON.parse(Store.get(key) || "{}"); return o && typeof o === "object" ? o : {}; } catch(_){ return {}; }
    }
    var genderFix = readMap("ll_voice_gender");     /* the reader's own corrections, by voice id */
    var hiddenFix = readMap("ll_voice_hidden");     /* voices struck off the short lists */
    function isHidden(v){ return !!hiddenFix[voiceId(v)]; }
    function setHidden(v, on){
      var id = voiceId(v);
      if (on) hiddenFix[id] = 1; else delete hiddenFix[id];
      Store.set("ll_voice_hidden", JSON.stringify(hiddenFix));
    }
    /* "woman" or "man" written out, wherever it hides: "…#female_1-local", "…_m_…", "en+f3".
       Underscores are word characters, so \b is no use here */
    function genderWord(s){
      var low = String(s).toLowerCase();
      if (/(^|[^a-z])(fe-?male|woman|women|girl)([^a-z]|$)/.test(low)) return "f";
      if (/(^|[^a-z])(male|man|men|boy)([^a-z]|$)/.test(low)) return "m";
      if (/[_#][f][_#0-9]/.test(low)) return "f";
      if (/[_#][m][_#0-9]/.test(low)) return "m";
      return "";
    }
    /* a first name we know, from the name or from an Apple bundle id. Hyphens are kept inside a
       token, so Ting-Ting and Li-Mu still match; a trailing Neural / Natural is trimmed off */
    function tokenGender(s){
      var ts = String(s).toLowerCase().split(/[\s,.()+_\/\\:\[\]#"'’]+/), i, t;
      for (i = 0; i < ts.length; i++){
        t = ts[i].replace(/(neural|natural)$/, "");
        if (!t) continue;
        if (WOMEN[t] || /^(f|female)\d$/.test(t)) return "f";     /* espeak variants: en+f3 */
        if (MEN[t] || /^(m|male)\d$/.test(t)) return "m";
      }
      return "";
    }
    function voiceGender(v){
      var fix = genderFix[voiceId(v)];
      if (fix === "f" || fix === "m") return fix;
      if (fix === "x") return "";                    /* corrected to "neither" */
      var name = nameOf(v), uri = uriOf(v);
      return genderWord(name) || tokenGender(name) || genderWord(uri) || tokenGender(uri) ||
             (/^google\s/i.test(name) ? "f" : "");   /* Chrome's Google voices are women except "UK English Male" */
    }
    function setGender(v, g){
      var id = voiceId(v);
      if (g) genderFix[id] = g; else delete genderFix[id];
      Store.set("ll_voice_gender", JSON.stringify(genderFix));
    }
    /* does this device tell us anything at all about who is speaking? */
    function anyGenderKnown(){
      return voices().some(function(v){ return !!voiceGender(v); });
    }
    /* the name a reader recognises: "Microsoft Aria Online (Natural) - English (United States)"
       is Aria; an Android voice with no name of its own is the woman or the man its URI numbers */
    function baseName(v){
      var n = nameOf(v).trim(), m = n.match(/^Microsoft\s+([A-Za-zÀ-ɏ'’-]+)/);
      if (m) return m[1].replace(/(Neural|Natural)$/, "");
      n = n.replace(/^(Google|Android|Chrome OS|Samsung|CereProc|Acapela)\s+/i, "");
      n = n.split(/\s+[-–—]\s+/)[0];
      n = n.replace(/\s*\([^)]*\)/g, "").replace(/\s+(Online|Desktop|Mobile|Compact|Premium|Enhanced|Natural|Neural)$/i, "").trim();
      if (!tokenGender(n)){
        var u = uriOf(v).toLowerCase().match(/#(fe)?male[_\-]?(\d+)?/);
        if (u) return (u[1] ? _t("Woman") : _t("Man")) + (u[2] ? " " + u[2] : "");
      }
      return n || nameOf(v) || _t("Voice");
    }
    /* where a device names two voices the same ("English United States" twice over), the second
       and third are numbered, so the bar, the cards and the list all call one voice one thing */
    var nameCache = null;
    function buildNames(){
      var seen = {}, map = {};
      voices().forEach(function(v){
        var base = baseName(v);
        seen[base] = (seen[base] || 0) + 1;
        map[voiceId(v)] = seen[base] > 1 ? base + " " + seen[base] : base;
      });
      nameCache = map;
    }
    function shortName(v){
      if (!v || typeof v === "string") return baseName(v);
      if (!nameCache) buildNames();
      return nameCache[voiceId(v)] || baseName(v);
    }
    /* the little words under a name: what it is good at, and where it speaks from */
    function voiceTags(v){
      var t = [], both = nameOf(v) + " " + uriOf(v);
      if (GOOD.test(both)) t.push(_t("natural"));
      t.push(v.localService ? _t("offline") : _t("online"));
      if (v.lang) t.push(v.lang);
      return t;
    }
    function voices(){ return supported ? speechSynthesis.getVoices() : []; }
    function langOf(v){ return (v.lang || "").slice(0, 2).toLowerCase(); }
    /* the reader's own locale, tidied: some systems report "en-US@posix" */
    function uiLocale(){ return String(navigator.language || "en").toLowerCase().replace(/_/g, "-").split("@")[0] || "en"; }
    /* how good a voice is likely to sound, for this document: a natural voice, one that works
       offline, one that speaks the right language — less the compact and novelty voices */
    function voiceScore(v, lang){
      var both = (nameOf(v) + " " + uriOf(v)), s = 0;
      if (GOOD.test(both)) s += 4;
      if (v.localService) s += 3;
      if (langOf(v) === (lang || docLang())) s += 2;
      if ((v.lang || "").toLowerCase().replace(/_/g, "-") === uiLocale()) s += 1;
      if (THIN.test(both) || tokenIn(PLAIN, nameOf(v))) s -= 2;
      if (NOVELTY.test(nameOf(v))) s -= 3;
      return s;
    }
    function tokenIn(table, s){
      return String(s).toLowerCase().split(/[\s,.()+_\/\\:\[\]#"'’-]+/).some(function(t){ return !!table[t]; });
    }
    /* best first: the score, then the document's language, then the name */
    function sortedVoices(lang){
      var l = lang || docLang();
      return voices().slice().sort(function(a, b){
        var d = voiceScore(b, l) - voiceScore(a, l);
        if (d) return d;
        var al = langOf(a) === l ? 0 : 1, bl = langOf(b) === l ? 0 : 1;
        if (al !== bl) return al - bl;
        return nameOf(a).localeCompare(nameOf(b));
      });
    }
    function gendered(g, lang){ return sortedVoices(lang).filter(function(v){ return voiceGender(v) === g; }); }
    /* a voice struck off is not offered again, unless nothing else is left */
    function unhidden(vs){ var open = vs.filter(function(v){ return !isHidden(v); }); return open.length ? open : vs; }
    /* the best voice of a gender: language match first; strict = only that language */
    function bestVoice(g, lang, notId, strict){
      var vs = unhidden(gendered(g, lang).filter(function(v){ return voiceId(v) !== notId && nameOf(v) !== notId; }));
      if (lang){ var same = vs.filter(function(v){ return langOf(v) === lang; }); if (same.length || strict) vs = same; }
      return vs[0] || null;
    }
    /* with nothing chosen, the best woman for this document reads it (and the best man the
       quoted speech): the pair a reader is offered before they touch anything */
    function autoNarrator(){
      var lang = docLang();
      return bestVoice("f", lang) || unhidden(sortedVoices(lang))[0] || null;
    }
    function findVoice(id){
      if (!id) return null;
      var vs = voices(), i;
      for (i = 0; i < vs.length; i++) if (voiceId(vs[i]) === id) return vs[i];
      for (i = 0; i < vs.length; i++) if (nameOf(vs[i]) === id) return vs[i];     /* a name stored by an older version */
      return null;
    }
    function voiceOptions(vs, selected){
      var groups = { f: [], m: [], "": [] };
      vs.forEach(function(v){ groups[voiceGender(v)].push(v); });
      return [["f", _t("Women")], ["m", _t("Men")], ["", _t("Other")]].map(function(g){
        if (!groups[g[0]].length) return "";
        return '<optgroup label="' + g[1] + '">' + groups[g[0]].map(function(v){
          var id = voiceId(v);
          return '<option value="' + esc(id) + '"' + (id === selected || nameOf(v) === selected ? ' selected' : '') + '>' + esc(nameOf(v)) + (v.localService ? "" : " (online)") + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
    }
    function currentVoice(){ return findVoice(voiceName) || autoNarrator(); }
    /* the voice for quoted speech: the one chosen, the narrator, or (auto) the other gender in
       the narrator's language; failing that the narrator's own voice pitched a little away */
    function dialogueVoice(narr){
      narr = narr || currentVoice();
      if (dialogueName === "same") return { voice: narr, pitchOffset: 0 };
      var chosen = dialogueName ? findVoice(dialogueName) : null;
      if (chosen) return { voice: chosen, pitchOffset: 0 };
      var g = narr ? voiceGender(narr) : "", lang = narr ? langOf(narr) : docLang(), not = narr ? voiceId(narr) : "";
      var other = g === "f" ? bestVoice("m", lang, not, true) : g === "m" ? bestVoice("f", lang, not, true)
                : (bestVoice("m", lang, not, true) || bestVoice("f", lang, not, true));
      /* no second voice of the other gender: the next best voice of any gender still reads it */
      if (!other && !g) other = sortedVoices(lang).filter(function(v){ return langOf(v) === lang && voiceId(v) !== not; })[0] || null;
      if (other) return { voice: other, pitchOffset: 0 };
      return { voice: narr, pitchOffset: g === "m" ? 0.15 : -0.15 };
    }
    /* the bar says who is reading, in one word */
    function syncBar(){
      var v = currentVoice(), n = v ? shortName(v) : "";
      if (runEngine && runEngine.narratorName) n = runEngine.narratorName() || n;
      voiceNameEl.textContent = n || _t("Voices");
      voicesBtn.setAttribute("aria-label", n ? _t("Voice: {name} — choose another", { name: n }) : _t("Voices"));
      voicesBtn.title = n ? _t("{name} — choose another voice", { name: n }) : _t("Voices");
    }
    function fillVoices(){
      if (runEngine && runEngine.fillVoices){ runEngine.fillVoices(voiceSel); syncBar(); return; }
      var vs = sortedVoices(), key = vs.map(function(v){ return voiceId(v); }).join("\n");
      var fresh = key !== voiceKey;     /* voices arrive late, and a phone can gain or lose them */
      if (fresh){ voiceKey = key; nameCache = null; loadForLang(); }
      voiceSel.innerHTML = voiceOptions(vs, voiceName || voiceId(currentVoice())) || '<option value="">' + _t("Default voice") + '</option>';
      syncBar();
      if (fresh && Side.is("voices")) Side.refresh("voices", renderPanel);
    }
    if (supported){ loadForLang(); fillVoices(); speechSynthesis.addEventListener("voiceschanged", fillVoices); }
    /* the narrator and the dialogue voice are remembered per language, so an English book and a
       Spanish one keep their own pair; the last choice of all is the fallback for a new language */
    function langKey(k, lang){ return "ll_tts_" + k + "_" + (lang || docLang()); }
    function loadForLang(){
      var lang = docLang();
      var v = Store.get(langKey("voice", lang)), d = Store.get(langKey("dialogue", lang));
      if (v === null){
        var last = Store.get("ll_tts_voice") || "", lv = findVoice(last);
        v = lv && langOf(lv) === lang ? last : "";
        d = lv && langOf(lv) === lang ? (Store.get("ll_tts_dialogue") || "") : "";
      }
      voiceName = v || ""; dialogueName = d || "";
      voiceSel.value = voiceName || voiceId(currentVoice());
      syncBar();
    }
    function setVoice(id){
      voiceName = id;
      Store.set(langKey("voice"), id); Store.set("ll_tts_voice", id);
      voiceSel.value = id || voiceId(currentVoice());
      syncBar(); syncPanel();
      restart();
    }
    function setDialogue(id){
      dialogueName = id;
      Store.set(langKey("dialogue"), id); Store.set("ll_tts_dialogue", id);
      syncPanel();
      restart();
    }
    /* Swap: the narrator reads the dialogue and the dialogue voice reads the narration */
    function swapPair(){
      var narr = currentVoice(), d = dialogueVoice(narr).voice;
      if (!narr || !d || d === narr) return;
      setDialogue(voiceId(narr)); setVoice(voiceId(d));
    }

    /* ---- sentence units ---- */
    var SENT = /[^.!?…]+[.!?…]*["”’)»]?\s*/g;
    /* „ opens Dutch quotes („Kom je?”) and German ones („Kommst du?“): either mark closes it */
    var CLOSER = { "“": "”", "«": "»", "\"": "\"", "‘": "’", "„": "”“" };
    function splitLong(text, base, out, meta){
      /* keep utterances short: some engines cut off after ~15 seconds. Offsets stay in the
         document's raw coordinates; only the spoken text has its whitespace runs collapsed */
      function say(s){ return s.replace(/\s+/g, " "); }
      if (text.length <= 220){ out.push(Object.assign({ start: base, end: base + text.length, text: say(text) }, meta || {})); return; }
      var i = 0;
      while (i < text.length){
        while (i < text.length && /\s/.test(text.charAt(i))) i++;    /* a piece starts on its first word */
        var j = Math.min(text.length, i + 200);
        if (j < text.length){ var k = j; while (k > i && !/\s/.test(text.charAt(k))) k--; if (k > i + 60) j = k; }
        if (j <= i) break;
        out.push(Object.assign({ start: base + i, end: base + j, text: say(text.slice(i, j)) }, meta || {}));
        i = j;
      }
    }
    /* where quoted speech runs in a paragraph, as [open, close] index pairs; a quote left open
       stays speech to the end of the paragraph. Curly and straight doubles, „…” and „…“, guillemets, and
       single curly quotes only when the opener follows a space and the closer precedes space or
       punctuation, so apostrophes are left alone. A quoted scrap under two characters isn't speech. */
    function quoteSpans(seg){
      var spans = [], open = -1, closer = "", i, c;
      for (i = 0; i < seg.length; i++){
        c = seg.charAt(i);
        if (open < 0){
          if (c === "“" || c === "«" || c === "„" || (c === "\"" && /\S/.test(seg.charAt(i + 1))) ||
              (c === "‘" && (i === 0 || /[\s(\[—–-]/.test(seg.charAt(i - 1))))){ open = i; closer = CLOSER[c]; }
        } else if (closer.indexOf(c) >= 0){
          if (c === "’" && i < seg.length - 1 && /[^\s.,;:!?…)\]—–-]/.test(seg.charAt(i + 1))) continue;
          spans.push([open, i]); open = -1;
        }
      }
      if (open >= 0) spans.push([open, seg.length]);
      return spans.filter(function(s){ return seg.slice(s[0] + 1, s[1]).trim().length >= 2; });
    }
    function parenSpans(seg){
      var spans = [], open = -1, i, c;
      for (i = 0; i < seg.length; i++){
        c = seg.charAt(i);
        if (c === "(" && open < 0) open = i;
        else if (c === ")" && open >= 0){ spans.push([open, i]); open = -1; }
      }
      return spans;
    }
    /* dialogue written with dashes, as Dutch, French, Spanish and Russian books often do:
         — Kom je mee? vroeg Anna.            – Nee, zei Tom, ik blijf hier.
         — Ik weet het niet — antwoordde ze — misschien morgen.
       A paragraph that opens with a dash (—, – or a spaced -) is speech up to its speech tag ("vroeg Anna", "zei hij",
       "she said"), which is narration, or up to a closing dash; after the tag or the next dash the speech goes on to the
       paragraph's end, unless the tag's sentence is followed by narration ("…, zei Tom. Hij draaide zich om."). A dash
       anywhere else (an aside — like this — in the narration) stays narration, a dash-led list is not speech, and a
       document is read this way only when enough of its dash paragraphs read like speech (dashStyle). */
    var DASH_OPEN = /^\s*(?:[—–]|-(?=\s))/;
    var DASH_V = "zei|zegt|zeiden|vroeg|vraagt|vroegen|riep|roept|riepen|antwoordde|antwoordt|fluisterde|fluistert|mompelde|mompelt|zuchtte|zucht|" +
      "lachte|schreeuwde|snauwde|stamelde|herhaalde|vervolgde|sprak|bromde|gilde|snikte|grinnikte|hijgde|smeekte|beval|protesteerde|kreunde|" +
      "jammerde|merkte|voegde|vulde|ging|dacht|" +
      "said|says|asked|asks|replied|answered|cried|called|whispered|shouted|muttered|murmured|exclaimed|added|continued|laughed|sighed|snapped|" +
      "repeated|insisted|demanded|suggested|remarked|protested|agreed|admitted|began|went on|told|thought|interrupted|retorted|groaned|yelled|explained";
    /* who says it: a pronoun, a name (with a title), or "de dokter", "haar moeder", "the old man" */
    var DASH_WHO = "(?:hij|zij|ze|ik|wij|we|he|she|I|they|" +
      "(?:(?:[Mm]eneer|[Mm]evrouw|[Jj]uffrouw|[Dd]okter|[Tt]ante|[Oo]om|Mr|Mrs|Ms|Dr|Miss)\\.?\\s+)?[A-Z][a-zà-ɏ'’-]*[a-zà-ɏ](?:\\s+[A-Z][a-zà-ɏ'’-]*[a-zà-ɏ])?|" +
      "(?:de|het|zijn|haar|mijn|hun|the|his|her|my|their)\\s+(?:[a-zà-ɏ]+\\s+){0,2}?[a-zà-ɏ]+)";
    /* a tag: "zei Anna", "said the captain"; or "Anna said", "she asked softly" when nothing follows it but punctuation */
    var DASH_TAG = new RegExp("^(?:(?:" + DASH_V + ")\\s+" + DASH_WHO + "(?![A-Za-zà-ɏ'’])|" + DASH_WHO + "\\s+(?:[a-z]+ly\\s+)?(?:" + DASH_V + ")(?:\\s+[a-z]+ly)?(?=\\s*(?:[,.!?…;:—–]|-\\s|$)))");
    /* narration after a tag: someone (not I, not you) doing something in the past tense ("Hij draaide zich om.", "She turned.") */
    var DASH_ACT = /^(?!(?:Ik|I|Je|Jij|U|You|We|Wij|Het|Dat|Dit|Die|Er|Daar|Toen|En|Maar|Dan|Nu|Ja|Nee|It|That|This|There|Then|And|But|So|Yes|No)\s)(?:[Hh]ij|[Zz]ij|[Zz]e|[Hh]e|[Ss]he|[Tt]hey|[A-Z][a-zà-ɏ]+)\s+(?:[a-z]+ly\s+)?(?:[a-zà-ɏ]{2,}(?:de|te|ed)|stond|zat|liep|keek|ging|kwam|zag|nam|gaf|bleef|werd|trok|sloot|hield|greep|schudde|took|went|stood|sat|ran|came|gave|held|shook|looked|turned)(?![a-zà-ɏ])/;
    /* "zei hij, en hij zette zijn tas neer": after these the narration goes on */
    var DASH_CONJ = /^(?:en|maar|terwijl|toen|die|dat|waarna|want|met|zonder|and|but|while|as|who|which|with|without|then)(?![a-zà-ɏ])/;
    function dashAt(seg, i){
      var c = seg.charAt(i);
      return c === "—" || c === "–" || (c === "-" && (i === 0 || /\s/.test(seg.charAt(i - 1))) && /\s/.test(seg.charAt(i + 1)));
    }
    /* the speech of a paragraph that opens with a dash, as [open, close] pairs like quoteSpans gives (the characters
       at open and close are left out: the dash, the comma or space before a tag) */
    function dashSpans(seg){
      var spans = [], m = DASH_OPEN.exec(seg);
      if (!m) return spans;
      /* a list ("- melk\n- brood"), or a line that does not end like a sentence, is not speech */
      var lines = seg.replace(/\s+$/, "").split(/\n/);
      if (lines.length > 1 && lines.every(function(l){ return DASH_OPEN.test(l) && !/[.!?…]["”’»]?\s*$/.test(l); })) return spans;
      if (!/[.!?…,;:—–\-"”’»)]\s*$/.test(seg) && !/[?!]/.test(seg)) return spans;
      var n = seg.length, open = m[0].length - 1, i = open + 1, c, w, head, held = false;
      function skip(k){ while (k < n && /\s/.test(seg.charAt(k))) k++; return k; }
      while (i < n){
        c = seg.charAt(i);
        if (open >= 0){
          /* in speech: a tag after a comma, ? or ! ("Nee, zei Tom", "Kom je? vroeg ze", and any lower-case word after ? or !) */
          if (/[,;:?!…]/.test(c) && /\s/.test(seg.charAt(i + 1))){
            w = skip(i + 1); head = seg.substr(w, 80);
            if (DASH_TAG.test(head) || (/[?!]/.test(c) && /^[a-zà-ɏ]/.test(head))){ spans.push([open, w - 1]); open = -1; held = false; i = w; continue; }
          } else if (dashAt(seg, i)){
            /* a closing dash: a tag ("— antwoordde ze —") or someone acting between two dashes ("— ze ging zitten —") */
            w = skip(i + 1); head = seg.substr(w, 120);
            if (DASH_TAG.test(head) || (DASH_ACT.test(head) && /\s(?:[—–]|-\s)/.test(head))){ spans.push([open, i]); open = -1; held = false; i = w; continue; }
          }
          i++;
          continue;
        }
        /* in narration (a tag): speech again after a dash, a comma, or the tag's sentence, unless narration follows it */
        if (!held && dashAt(seg, i)){ open = i; i++; continue; }
        if (!held && c === "," && /\s/.test(seg.charAt(i + 1))){
          w = skip(i + 1);
          if (DASH_CONJ.test(seg.substr(w, 12))) held = true;
          else { open = i; i = w; continue; }
        }
        if (/[.!?…]/.test(c) && (i + 1 >= n || /\s/.test(seg.charAt(i + 1)))){
          w = skip(i + 1);
          if (w >= n) break;
          if (dashAt(seg, w)){ open = w; held = false; i = w + 1; continue; }
          if (!held){
            if (DASH_ACT.test(seg.substr(w, 60))) held = true;
            else { open = i + 1; i = w; continue; }
          }
        }
        i++;
      }
      if (open >= 0) spans.push([open, n]);
      return spans.filter(function(s){ return /[A-Za-z0-9À-ɏ]/.test(seg.slice(s[0] + 1, s[1])) && seg.slice(s[0] + 1, s[1]).trim().length >= 2; });
    }
    /* whether texts (a document's blocks, or one plain text) write their dialogue with dashes: at least two dash
       paragraphs that read like speech (a question, an exclamation, a tag), and they are a third of all the dash paragraphs */
    var DASH_SAID = new RegExp("[,?!…—–-]\\s*(?:" + DASH_V + ")\\s+\\S");
    function dashStyle(texts){
      var all = 0, talk = 0;
      (texts || []).forEach(function(t){
        String(t || "").split(/\r?\n[ \t]*\r?\n/).forEach(function(p){
          if (!DASH_OPEN.test(p)) return;
          all++;
          var head = p.slice(0, 400);
          if (dashSpans(head).length && (/[?!]/.test(head) || DASH_SAID.test(head))) talk++;
        });
      });
      return talk >= 2 && talk * 3 >= all;
    }
    /* text: a block or a plain-text document; dashes: whether the document writes dialogue with dashes (dashStyle),
       left out to decide it from this text alone */
    function unitsFromText(text, base, out, meta, dashes){
      /* paragraphs (blank lines, CRLF too), then sentences, then the quoted speech cut out of each
         sentence as its own unit (dialogue: true, quote marks left out of the text). Offsets are
         relative to base and exact, so highlighting and "read from here" line up. */
      var re = /\r?\n[ \t]*\r?\n/g, last = 0, m;
      var paras = [];
      while ((m = re.exec(text))){ paras.push([last, m.index]); last = m.index + m[0].length; }
      paras.push([last, text.length]);
      if (dashes === undefined) dashes = dashStyle([text]);
      paras.forEach(function(p){
        var seg = text.slice(p[0], p[1]), dash = dashes && DASH_OPEN.test(seg) ? dashSpans(seg) : null;
        var quotes = dash && dash.length ? dash : quoteSpans(seg), parens = parenSpans(seg), before = out.length;
        /* both span lists are sorted and sentences only move forward, so a cursor into each
           replaces a rescan per sentence (a plain-text book can be one paragraph) */
        var qi = 0, pi = 0;
        SENT.lastIndex = 0;
        var sm;
        while ((sm = SENT.exec(seg))){
          var t = sm[0], ss = sm.index + (t.length - t.replace(/^\s+/, "").length), se = sm.index + t.replace(/\s+$/, "").length;
          if (!t.length) SENT.lastIndex++;
          if (se <= ss) continue;
          var pieces = [], pos = ss;
          while (qi < quotes.length && quotes[qi][1] < ss) qi++;
          for (var qj = qi; qj < quotes.length && quotes[qj][0] < se; qj++){
            var q = quotes[qj];
            if (q[0] > pos) pieces.push([pos, Math.min(q[0], se), false]);
            pieces.push([Math.max(q[0] + 1, ss), Math.min(q[1], se), true]);
            pos = Math.min(q[1] + 1, se);
          }
          if (pos < se) pieces.push([pos, se, false]);
          pieces.forEach(function(pc){
            var piece = seg.slice(pc[0], pc[1]);
            var lead = piece.length - piece.replace(/^\s+/, "").length, trail = piece.length - piece.replace(/\s+$/, "").length;
            var core = piece.slice(lead, piece.length - trail);
            if (!/[A-Za-z0-9À-ɏ]/.test(core)) return;
            var a = pc[0] + lead, b = pc[1] - trail;
            while (pi < parens.length && parens[pi][1] + 1 < b) pi++;
            var paren = false;
            for (var pj = pi; pj < parens.length && parens[pj][0] <= a; pj++){ if (b <= parens[pj][1] + 1){ paren = true; break; } }
            splitLong(core, base + p[0] + a, out, Object.assign({ dialogue: pc[2], paren: paren, para: base + p[0] }, meta || {}));
          });
        }
        if (out.length > before) out[out.length - 1].last = true;
      });
    }
    function buildDocUnits(){
      var doc = $("#doc"), out = [];
      var SEL = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, pre, figcaption, div.plain";
      var blocks = Array.prototype.slice.call(doc.querySelectorAll(SEL)).filter(function(b){ return !b.querySelector(SEL); });
      if (!blocks.length) blocks = [doc];
      var nodes = Anchor.textNodes(), offsetOfNode = new Map(), sum = 0;
      nodes.forEach(function(n){ offsetOfNode.set(n, sum); sum += n.length; });
      var got = [];
      blocks.forEach(function(b){
        var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), n, first = null, text = "";
        while ((n = w.nextNode())){ if (!first) first = n; text += n.textContent; }
        if (!first || !text.trim()) return;
        var base = offsetOfNode.get(first);
        if (base === undefined) return;
        got.push({ b: b, text: text, base: base });
      });
      /* dialogue dashes are decided over the whole document, not block by block */
      var dashes = dashStyle(got.map(function(g){ return g.text; }));
      got.forEach(function(g){
        var h = /^H[1-4]$/.test(g.b.tagName), meta = h ? { heading: true, level: +g.b.tagName.charAt(1) } : { heading: false };
        var songs = typeof Songs !== "undefined" && Songs ? g.b.querySelectorAll("a.ll-song") : [];
        if (!songs.length){ unitsFromText(g.text, g.base, out, meta, dashes); return; }
        /* a song line (Songs) is one unit that says the song ("Song: Eye of the Tiger, by Survivor."), not its
           note, quotes or player; the text around it is read as usual. Offsets stay the line's own. */
        var pos = 0;
        Array.prototype.forEach.call(songs, function(a){
          var tn = Anchor.textNodes(a);
          if (!tn.length) return;
          var s = offsetOfNode.get(tn[0]), e = offsetOfNode.get(tn[tn.length - 1]);
          if (s === undefined || e === undefined) return;
          s -= g.base; e += tn[tn.length - 1].length - g.base;
          if (s < pos || e > g.text.length) return;
          if (s > pos) unitsFromText(g.text.slice(pos, s), g.base + pos, out, meta, dashes);
          out.push(Object.assign({ start: g.base + s, end: g.base + e, text: Songs.say(a), song: true, para: g.base + s, last: true }, meta));
          pos = e;
        });
        if (pos < g.text.length) unitsFromText(g.text.slice(pos), g.base + pos, out, meta, dashes);
      });
      return out;
    }

    /* ---- expression: pitch, rate and volume for a unit, read off its punctuation, and the
       breath after it. Pure: unit + { prev, next, expr } → { pitch, rate, volume, pauseAfter }.
       pitch and rate are relative to 1; the caller adds the user's pitch and speed. ---- */
    var TAGS = [
      [/\b(whisper|murmur|mutter|breath)/i, { volume: 0.55, rate: 0.9 }],
      [/\b(shout|yell|scream|cried|exclaim|roar)/i, { volume: 1, pitch: 0.12, rate: 1.1 }],
      [/\b(sigh|slowly|wear)/i, { rate: 0.85 }],
      [/\b(laugh|grin|chuckl)/i, { pitch: 0.08 }],
      [/\b(hiss|snap|growl)/i, { pitch: -0.08, rate: 1.05 }]
    ];
    /* the narration right before or after a quote, the ~40 characters nearest it */
    function saidTag(u, prev, next){
      var s = "";
      if (prev && !prev.dialogue && u.start - prev.end <= 40) s += prev.text.slice(-48) + " ";
      if (next && !next.dialogue && next.start - u.end <= 40) s += next.text.slice(0, 48);
      return s;
    }
    function express(u, ctx){
      ctx = ctx || {};
      var k = ctx.expr === "off" ? 0 : ctx.expr === "dramatic" ? 1.8 : 1;
      var t = u.text || "", pitch = 0, rate = 1, vol = 1, pause = 0;
      var tail = t.replace(/[\s"”’)\]»]+$/, ""), end = tail.charAt(tail.length - 1);
      if (end === "?"){ pitch += 0.08; pause = 260; }
      else if (end === "!"){ pitch += 0.1; rate *= 1.08; pause = 260; }
      else if (end === "…" || /\.\.\.$/.test(tail)){ rate *= 0.92; pause = 500; }
      else if (end === "."){ pause = 260; }
      else if (end === "," || end === ";" || end === ":"){ pause = 120; }
      else if (end === "—" || end === "–" || /--$/.test(tail)){ pause = 0; }    /* cut off mid-sentence: run straight on */
      if (u.heading){ rate *= 0.9; pitch -= 0.05; pause = 700; }
      else if (u.last) pause += 350;
      if (u.paren){ pitch -= 0.06; vol = Math.min(vol, 0.9); rate *= 1.05; }
      if (u.dialogue){
        var tag = saidTag(u, ctx.prev, ctx.next);
        TAGS.forEach(function(r){
          if (!r[0].test(tag)) return;
          var d = r[1];
          if (d.pitch) pitch += d.pitch;
          if (d.rate) rate *= d.rate;
          if (d.volume !== undefined) vol = Math.min(vol, d.volume);
        });
      }
      /* a word in capitals: engines can't stress one word, so the whole unit slows a touch */
      if (/\b[A-Z]{3,}\b/.test(t)) rate *= 0.95;
      var r3 = function(x){ return Math.round(x * 1000) / 1000; };
      return {
        pitch: r3(1 + clamp(pitch * k, -0.3, 0.3)),
        rate: r3(1 + clamp((rate - 1) * k, -0.45, 0.45)),
        volume: r3(1 - Math.min(0.6, (1 - vol) * k)),
        pauseAfter: pause
      };
    }
    /* the first sentences after Play come in a little under speed and settle: an engine that
       opens at full tilt sounds like it is already late */
    var RAMP = [0.85, 0.92, 1], rampN = RAMP.length, rampAt = -1;
    function rampFactor(){ return RAMP[rampN] || 1; }
    /* a sentence said again after a settings change keeps its own step on the ramp */
    function rampStep(i){ if (i !== rampAt){ rampAt = i; if (rampN < RAMP.length) rampN++; } }
    function utterFor(u, prev, next, ramp, cast){
      var x = express(u, { prev: prev, next: next, expr: expr });
      var narr = currentVoice(), v = narr, off = 0;
      if (u.dialogue){
        /* a character's own voice: its pitch is added to the expression's */
        if (cast && cast.voice){ v = cast.voice; off = (+cast.pitch || 1) - 1; }
        else { var d = dialogueVoice(narr); v = d.voice; off = d.pitchOffset; }
      }
      var ut = new SpeechSynthesisUtterance(u.text);
      ut.rate = clamp(rate * x.rate * (ramp || 1), 0.5, 2.5);
      ut.pitch = clamp(pitchPref + (x.pitch - 1) + off, 0.5, 1.6);
      ut.volume = clamp(x.volume, 0.4, 1);
      if (v){ ut.voice = v; ut.lang = v.lang; }
      return { utter: ut, pauseAfter: x.pauseAfter };
    }

    /* ---- the built-in engine: the device's own voices. With "a voice per character" on,
       audiobook.js works out who speaks each dialogue unit and casts a device voice (and a pitch)
       for every named character; lines no one is named for keep the dialogue voice ---- */
    function castVoiceFor(i){
      if (!devPlan || !castOn) return null;
      var u = units[i];
      if (!u || !u.dialogue) return null;
      if (i >= devPlan.n) devPlan.extend(units);        /* PDF pages appended since the plan was made */
      return devPlan.voiceFor(i);
    }
    engines.device = {
      name: "device", label: _t("Read aloud"),
      supported: function(){ return supported; },
      /* nothing to plan with one voice, and returning nothing keeps that path synchronous */
      prepare: function(us, c){
        devPlan = null;
        if (!castOn) return;
        var loaded = window.llAudiobook ? Promise.resolve() : need(["audiobook"]);
        return loaded.then(function(){
          return window.llAudiobook.deviceCast(us, c, { lang: docLang(), narrator: currentVoice(), voices: sortedVoices, gender: voiceGender, id: voiceId, find: findVoice });
        }).then(function(p){ devPlan = p; }, function(err){ console.warn("read-aloud cast", err); devPlan = null; });   /* one voice, quietly */
      },
      speak: function(i, opts){
        var u = units[i], s = utterFor(u, units[i - 1], units[i + 1], opts.ramp, castVoiceFor(i));
        utter = s.utter;
        utter.onend = function(){ opts.onend({ pauseAfter: s.pauseAfter }); };
        utter.onerror = function(e){
          if (e.error === "interrupted" || e.error === "canceled") return;
          opts.onerror(e.error || "error");
        };
        /* Chrome needs a fresh call after cancel() on some platforms */
        var mine = utter;
        setTimeout(function(){ if (opts.live()) speechSynthesis.speak(mine); }, 0);
      },
      cancel: function(){ try { speechSynthesis.cancel(); } catch(_){} }
    };

    /* ---- painting + revealing ---- */
    function paint(u){
      if (!hasHL) return;
      CSS.highlights.delete("ll-speak"); CSS.highlights.delete("ll-speak-dialogue");
      if (!u || state.mode !== "doc") return;
      var r = Anchor.rangeBetween(u.start, u.end);
      if (r) CSS.highlights.set(u.dialogue ? "ll-speak-dialogue" : "ll-speak", new Highlight(r));
    }
    function ensureVisible(u){
      if (state.mode !== "doc") return;
      var r = Anchor.rangeAt(u.start); if (!r) return;
      var rect = r.getBoundingClientRect();
      if (state.flow === "pages"){
        var v = $("#docView").getBoundingClientRect();
        if (rect.left < v.left - 2 || rect.left > v.right) revealOffset(u.start);
      } else {
        var head = Library.headerHeight(), bottom = window.innerHeight - $("#dock").offsetHeight;
        if (rect.top < head + 4 || rect.bottom > bottom - 10) revealOffset(u.start, { center: true });
      }
    }

    /* ---- lock-screen, notification and headphone controls. Browsers only surface media
       controls while an <audio> or <video> element plays, and speech alone doesn't count, so a
       silent eight-second loop plays alongside the reading (started from the same gesture, at a
       whisper of volume: a fully muted element is dropped from the controls on some platforms).
       The handlers drive the same play / pause / step code as the bar. ---- */
    var media = "mediaSession" in navigator ? navigator.mediaSession : null;
    var silence = null, album = null, sections = [];
    function silentWav(){
      /* eight seconds of 8-bit mono silence at 8 kHz (64 kB) as a WAV data: URL, so no file is needed. Longer than five
         seconds: Chrome on Android treats shorter media as a one-off sound and shows no media controls for it */
      var n = 64000, b = new Uint8Array(44 + n), i, s = "";
      function str(o, t){ for (var k = 0; k < t.length; k++) b[o + k] = t.charCodeAt(k); }
      function u32(o, v){ b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >>> 24) & 255; }
      str(0, "RIFF"); u32(4, 36 + n); str(8, "WAVE");
      str(12, "fmt "); u32(16, 16); u32(20, 1 | (1 << 16)); u32(24, 8000); u32(28, 8000); u32(32, 1 | (8 << 16));
      str(36, "data"); u32(40, n);
      for (i = 44; i < b.length; i++) b[i] = 128;       /* unsigned 8-bit: 128 is silence */
      for (i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(b.length, i + 8192)));
      return "data:audio/wav;base64," + btoa(s);
    }
    function silentAudio(){
      if (silence) return silence;
      silence = document.createElement("audio");
      silence.id = "ttsSilence"; silence.loop = true; silence.volume = 0.01; silence.preload = "auto";
      silence.setAttribute("aria-hidden", "true");
      silence.src = silentWav();
      bar.appendChild(silence);
      return silence;
    }
    function mediaPlay(){
      if (!runEngine || runEngine === engines.device) try { var p = silentAudio().play(); if (p && p.catch) p.catch(function(){}); } catch(_){}     /* refused: no controls, reading carries on */
      mediaState("playing");
    }
    function mediaPause(){
      if (silence) try { silence.pause(); } catch(_){}
      mediaState(active ? "paused" : "none");
    }
    function mediaState(s){ if (media) try { media.playbackState = s; } catch(_){} }
    function mediaTitle(){
      return ($("#fname").textContent || document.title.replace(/\s+—\s+lamplight$/i, "")).trim() || "Lamplight";
    }
    /* title, app and the current section, with the app icon as artwork */
    function setMeta(section){
      album = section;
      if (!media || typeof MediaMetadata === "undefined") return;
      try {
        media.metadata = new MediaMetadata({ title: mediaTitle(), artist: "Lamplight", album: section || "",
          artwork: [{ src: "./icon-192.png", sizes: "192x192", type: "image/png" }, { src: "./icon-512.png", sizes: "512x512", type: "image/png" }] });
      } catch(_){}
    }
    function clearMeta(){ album = null; if (media) try { media.metadata = null; } catch(_){} }
    /* where the contents' sections start, so the album can follow the chapter: character
       offsets for a text document, page numbers for a PDF (its outline arrives later) */
    function loadSections(my){
      sections = [];
      if (state.mode === "pdf"){
        Toc.pdfEntries().then(function(es){
          if (my !== startGen || !active) return;
          sections = es.filter(function(e){ return e.page; }).map(function(e){ return { at: e.page, title: e.title }; });
        });
        return;
      }
      var w = document.createTreeWalker($("#doc"), NodeFilter.SHOW_TEXT);
      Toc.entries().forEach(function(e){
        w.currentNode = e.el;
        var n = w.nextNode(), at = n ? Anchor.offsetOf(n, 0) : null;     /* the first text at or after the section's element */
        if (at !== null) sections.push({ at: at, title: e.title });
      });
      sections.sort(function(a, b){ return a.at - b.at; });
    }
    function sectionFor(u){
      var key = state.mode === "pdf" ? u.page : u.start, t = "";
      for (var i = 0; i < sections.length && sections[i].at <= key; i++) t = sections[i].title;
      return t;
    }
    if (media){
      [["play", function(){ if (active && !playing) play(); }], ["pause", function(){ if (playing) pause(); }],
       ["stop", function(){ if (active) stop(); }],
       ["previoustrack", function(){ step(-1); }], ["nexttrack", function(){ step(1); }],
       ["seekbackward", function(){ step(-3); }], ["seekforward", function(){ step(3); }]].forEach(function(h){
        try { media.setActionHandler(h[0], h[1]); } catch(_){}     /* an action this browser doesn't know throws */
      });
    }

    /* ---- sleep timer: stop after so many minutes, or at the end of the chapter (before the
       next h1–h3; in a PDF, at the end of the page). It counts from the moment it is chosen, or
       from when reading starts if chosen while paused; reading stops at the end of a sentence,
       never inside one. Stopping clears it. Not persisted. ---- */
    var SLEEP = [[0, _t("Off"), ""], [15, "15", _t("{n} minutes", { n: 15 })], [30, "30", _t("{n} minutes", { n: 30 })], [45, "45", _t("{n} minutes", { n: 45 })],
                 [60, _t("{n} min", { n: 60 }), _t("{n} minutes", { n: 60 })], ["chapter", _t("End of chapter"), ""]];
    var sleepMode = 0, sleepAt = 0, sleepTick = null;
    function setSleep(mode){
      sleepMode = mode; sleepAt = 0; clearInterval(sleepTick); sleepTick = null;
      if (typeof mode === "number" && mode > 0){
        if (playing) sleepAt = Date.now() + mode * 60000;
        sleepTick = setInterval(tickSleep, 15000);
      }
      syncSleepChips(); drawSleep();
    }
    function clearSleep(){ if (sleepMode) setSleep(0); }
    /* on play: a minutes timer chosen while paused starts counting now; one that ran out
       meanwhile had nothing to stop, so it is spent */
    function armSleep(){
      if (typeof sleepMode !== "number" || !sleepMode) return;
      if (!sleepAt) sleepAt = Date.now() + sleepMode * 60000;
      else if (Date.now() >= sleepAt) clearSleep();
      drawSleep();
    }
    function tickSleep(){
      if (!sleepAt) return;
      if (Date.now() >= sleepAt && !playing){ clearSleep(); return; }
      drawSleep();
    }
    function sleepDue(u, next){
      if (sleepMode === "chapter"){
        if (state.mode === "pdf") return !!(u.page && next.page && next.page !== u.page);
        return !!(next.heading && next.level <= 3);
      }
      return sleepAt > 0 && Date.now() >= sleepAt;
    }
    function drawSleep(){
      var on = !!sleepMode && active;
      if (on){
        var mn = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : sleepMode, pg = state.mode === "pdf";
        var l = sleepMode === "chapter"
              ? [_t("Stops at"), pg ? _t("end of page") : _t("end of chapter"), pg ? _t("Stops at end of page — sleep timer") : _t("Stops at end of chapter — sleep timer")]
              : [_t("Stops in"), _t("{n} min", { n: mn }), _t("Stops in {n} min — sleep timer", { n: mn })];
        $("#ttsSleepW").textContent = l[0]; $("#ttsSleepV").textContent = l[1];     /* two spans: a phone shows only the second */
        sleepBtn.setAttribute("aria-label", l[2]);
      }
      if (sleepBtn.hidden !== !on){ sleepBtn.hidden = !on; measure(); }
    }
    function sleepChips(){
      return SLEEP.map(function(c){
        var on = c[0] === sleepMode;
        return '<button class="chip' + (on ? ' on' : '') + '" aria-pressed="' + (on ? "true" : "false") + '" data-sleep="' + c[0] + '"' + (c[2] ? ' aria-label="' + c[2] + '"' : '') + '>' + c[1] + '</button>';
      }).join("");
    }
    function syncSleepChips(){
      var box = $("#ttsSleepChips");
      if (box) Array.prototype.forEach.call(box.querySelectorAll(".chip"), function(c){
        var on = c.dataset.sleep === String(sleepMode); c.classList.toggle("on", on); c.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    /* ---- speaking ---- */
    function speakCurrent(){
      if (!units.length || idx < 0 || idx >= units.length){ finish(); return; }
      var u = units[idx], myGen = ++gen, eng = engineFor();
      clearTimeout(wait); between = false; sampleGen++;
      eng.cancel();
      paint(u); ensureVisible(u);
      if (state.mode === "pdf" && u.page && Library.currentPdfPage() !== u.page) Toc.goPdfPage(u.page);
      var sec = sectionFor(u); if (sec !== album) setMeta(sec);
      var ramp = rampFactor();
      rampStep(idx);
      eng.speak(idx, {
        rate: rate, ramp: ramp,
        live: function(){ return myGen === gen && playing; },
        onend: function(r){
          if (myGen !== gen || !playing) return;
          /* an engine that played a whole clip of several units says where to carry on */
          var to = (r && typeof r.advanceTo === "number") ? r.advanceTo : idx + 1;
          if (to >= units.length){ finish(); return; }
          if (sleepDue(units[to - 1], units[to])){ stop(); Marks.toast(_t("Stopped by the sleep timer")); return; }
          /* a breath between sentences, a longer one after a paragraph; Prev / Next cut it short */
          between = true;
          wait = setTimeout(function(){ if (myGen !== gen || !playing) return; idx = to; speakCurrent(); }, (r && r.pauseAfter) || 0);
        },
        onerror: function(err){
          if (myGen !== gen) return;
          if (err) Marks.toast(_t("Speech stopped ({error})", { error: err }));
          pause();
        },
        /* a sub-range (a sentence inside a longer clip) is being spoken now */
        onboundary: function(start, end, i){
          if (myGen !== gen || !playing) return;
          if (typeof i === "number" && units[i]){
            /* a clip of several sentences (ElevenLabs) moves on inside itself: the sleep timer is checked there too */
            if (i > idx && units[i - 1] && sleepDue(units[i - 1], units[i])){ stop(); Marks.toast(_t("Stopped by the sleep timer")); return; }
            idx = i;
            if (state.mode === "pdf" && units[i].page && Library.currentPdfPage() !== units[i].page) Toc.goPdfPage(units[i].page);
          }
          var span = { start: start, end: end, dialogue: !!(typeof i === "number" && units[i] && units[i].dialogue) };
          paint(span); ensureVisible(span);
        }
      });
    }
    /* a settings change mid-sentence restarts it; during the breath after one the pending timer
       starts the next unit with the new settings (restarting would replay the finished one) */
    function restart(){ if (playing && !between) speakCurrent(); }
    /* Prev / Next and the headphone buttons: n sentences on, cutting a breath short */
    function step(n){
      if (!units.length) return;
      idx = clamp(idx + n, 0, units.length - 1);
      if (playing) speakCurrent(); else { paint(units[idx]); ensureVisible(units[idx]); }
    }
    function play(){
      if (!units.length) return;
      playing = true; playIcon(playBtn, true); playBtn.setAttribute("aria-label", _t("Pause"));
      rampN = 0; rampAt = -1;
      armSleep(); mediaPlay();
      speakCurrent();
    }
    function pause(){
      playing = false; between = false; gen++; sampleGen++; clearTimeout(wait);
      engineFor().cancel();
      mediaPause();
      playIcon(playBtn, false); playBtn.setAttribute("aria-label", _t("Play"));
    }
    function finish(){ pause(); paint(null); idx = Math.max(0, units.length - 1); clearSleep(); }
    function stop(){
      startGen++;     /* a PDF page load still in flight belongs to a reading that is over */
      pause(); paint(null); active = false; units = []; idx = -1; sections = [];
      mediaState("none"); clearMeta(); clearSleep();
      clearTimeout(replanT); replanT = null;
      var was = runEngine;
      if (runEngine && runEngine.stop) runEngine.stop();
      runEngine = null; ctx = null; devPlan = null; session++;
      bar.classList.remove("on"); bar.removeAttribute("data-engine"); speedMenu(false);
      if (was && was !== engines.device) fillVoices();     /* the mirror select lists the device voices again */
      document.body.classList.remove("tts-on");
      if (state.flow === "pages") relayoutPaged();
    }
    /* the bar's height, for the page to clear it. It is one row at every width now: the voice, ‹ ▶ ›,
       the speed chip and the close; the sleep timer is a badge on the voice and the slider lives in
       the speed chip's popover, so nothing is left to wrap */
    function measure(){
      if (!active) return;
      bar.classList.remove("tts-wrap");
      document.documentElement.style.setProperty("--ttsH", bar.offsetHeight + "px");
      dockVar();
    }
    /* the speed chip's popover: the slider and four presets, over the bar. Escape, a tap outside or
       the chip again closes it; focus goes to the slider and back to the chip */
    function speedMenu(open){
      var was = !speedPop.hidden;
      if (open === undefined) open = !was;
      if (open === was) return;
      speedPop.hidden = !open;
      speedBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) rateEl.focus({ preventScroll: true });
      else if (speedPop.contains(document.activeElement)) speedBtn.focus({ preventScroll: true });
    }
    function setRate(r){
      rate = clamp(Math.round(r * 100) / 100, 0.5, 2); rateEl.value = rate; showRate(); Store.set("ll_tts_rate", String(rate));
      if (runEngine && runEngine.setRate) runEngine.setRate(rate);     /* clips play faster or slower, nothing is made again */
      else restart();
    }
    /* the engine looks at the units (who speaks, clips…) before the first sentence plays */
    function prepared(fn){
      var eng = runEngine, mySession = session, p = null;
      planned = units.length;
      try { p = eng.prepare(units, ctx); } catch(err){ p = Promise.reject(err); }
      if (!p || typeof p.then !== "function"){ fn(); return; }
      mediaPlay();     /* still inside the gesture that started reading, so the lock-screen controls may follow */
      p.then(function(){ if (mySession === session && active) fn(); }, function(err){
        console.warn("read-aloud engine", err);
        if (mySession !== session || !active) return;
        Marks.toast((err && err.message) || _t("{name} couldn’t start", { name: eng.label }));
        stop();
      });
    }
    /* a translated book shown as "Translation only" (translate.js) keeps its original in the text, hidden: that is what
       is read, and what the highlight follows. Said once per document, so the voice in another language is not a surprise */
    var trToldFor = null;
    function trOnlyNote(){
      var T = window.llTranslate, id = Library.currentId();
      if (!T || !T.isOn() || T.view() !== "only" || trToldFor === id) return;
      trToldFor = id;
      Marks.toast(_t("Read aloud reads the original, not the translation — “{item}” in the menu lets you follow it", { item: _t("Show both languages") }), 5000);
    }
    function startFrom(offset){
      if (engineName === "device" && !supported){ Marks.toast(_t("Read aloud isn’t available in this browser")); return; }
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      var my = ++startGen, mySession = ++session;
      primeAudio();
      chooseEngine(function(eng){
        if (my !== startGen || mySession !== session) return;
        if (state.mode !== "doc" && state.mode !== "pdf") return;
        if (!eng.supported()){ Marks.toast(_t("Read aloud isn’t available in this browser")); return; }
        runEngine = eng;
        ctx = { docId: Library.currentId(), mode: state.mode, lang: docLang(), title: mediaTitle() };
        active = true; bar.classList.add("on"); album = null;
        if (eng === engines.device) bar.removeAttribute("data-engine"); else bar.setAttribute("data-engine", eng.name);
        fillVoices();
        document.body.classList.add("tts-on");
        drawSleep(); measure();
        if (state.flow === "pages") relayoutPaged();
        loadSections(my);
        if (state.mode === "doc"){
          units = buildDocUnits();
          var off = typeof offset === "number" ? offset : (Library.topCharOffset() || 0);
          idx = 0;
          for (var i = 0; i < units.length; i++){ if (units[i].end > off){ idx = i; break; } }
          if (!units.length){ Marks.toast(_t("Nothing to read")); stop(); return; }
          paint(units[idx]); ensureVisible(units[idx]);
          trOnlyNote();
          prepared(play);
        } else {
          var page = Library.currentPdfPage();
          loadPdfUnits(page, my).then(function(ok){
            if (!ok) return;       /* stopped, restarted or the document changed while the page's text loaded */
            if (!units.length){ Marks.toast(_t("No text on this page")); stop(); return; }
            prepared(function(){ idx = 0; play(); });
          });
        }
      });
    }
    /* the engine plans the PDF units loaded so far (who speaks, clips…) */
    function replan(doc){
      replanT = null;
      if (state.pdfDoc !== doc || !active || !runEngine || runEngine === engines.device) return;
      planned = units.length;
      var pp = null;
      try { pp = runEngine.prepare(units, ctx); } catch(_){}
      if (pp && pp.catch) pp.catch(function(){});
    }
    /* resolves to whether this reading is still the live one once the first page is in */
    function loadPdfUnits(page, my){
      var doc = state.pdfDoc;
      units = [];
      function live(){ return my === startGen && active && state.pdfDoc === doc; }
      /* load the first page now, the rest while reading */
      return PdfText.get(page).then(function(t){
        if (!live()) return false;
        detectFrom(t, Library.currentId && Library.currentId());     /* a PDF has no #doc to read the language off */
        unitsFromText(t, 0, units); units.forEach(function(u){ u.page = page; });
        pdfUnitsDoc = doc;
        var next = page + 1;
        (function more(){
          if (next > doc.numPages || !live()) return;
          var pg = next++;
          PdfText.get(pg).then(function(tt){
            if (!live()) return;
            var add = []; unitsFromText(tt, 0, add); add.forEach(function(u){ u.page = pg; });
            units = units.concat(add);
            /* pages were appended: an engine that plans ahead extends its plan — at once when the reader is near
               the end of it or this was the last page, otherwise once the pages stop coming */
            if (runEngine && runEngine !== engines.device){
              clearTimeout(replanT); replanT = null;
              if (next > doc.numPages || idx >= planned - 20) replan(doc);
              else replanT = setTimeout(function(){ replan(doc); }, 1500);
            }
            setTimeout(more, 50);
          });
        })();
        return true;
      });
    }
    /* a short line in both voices, so the panel's choices can be heard */
    var SAMPLE = "The lamp hums quietly. \"Are you still reading?\" she asked. \"Just one more chapter!\"";
    function sample(){
      if (!supported) return;
      if (playing) pause();
      var list = [], myGen = ++sampleGen, i = 0;
      unitsFromText(SAMPLE, 0, list);
      try { speechSynthesis.cancel(); } catch(_){}
      (function next(){
        if (myGen !== sampleGen || i >= list.length) return;
        var s = utterFor(list[i], list[i - 1], list[i + 1]);
        s.utter.onend = function(){ if (myGen !== sampleGen) return; i++; setTimeout(next, s.pauseAfter); };
        setTimeout(function(){ if (myGen === sampleGen) speechSynthesis.speak(s.utter); }, 0);
      })();
    }
    /* one voice, one line, in the voice's own language: what every ▶ in the picker plays. A new
       preview (or closing the panel) stops the one before it */
    var PREVIEW = "The lamp hums quietly. \"Are you still reading?\" she asked.";
    /* a Dutch voice says it in Dutch */
    var PREVIEW_NL = "De lamp zoemt zachtjes. \"Lees je nog?\" vroeg ze.";
    function preview(v){
      if (!supported) return;
      if (playing) pause();
      var list = [], myGen = ++sampleGen, i = 0;
      unitsFromText(v && /^nl/i.test(v.lang || "") ? PREVIEW_NL : PREVIEW, 0, list);
      try { speechSynthesis.cancel(); } catch(_){}
      (function next(){
        if (myGen !== sampleGen || i >= list.length) return;
        var u = list[i], x = express(u, { prev: list[i - 1], next: list[i + 1], expr: expr });
        var ut = new SpeechSynthesisUtterance(u.text);
        ut.rate = clamp(rate * x.rate, 0.5, 2.5);
        ut.pitch = clamp(pitchPref + (x.pitch - 1), 0.5, 1.6);
        ut.volume = clamp(x.volume, 0.4, 1);
        if (v){ ut.voice = v; ut.lang = v.lang; }
        ut.onend = function(){ if (myGen !== sampleGen) return; i++; setTimeout(next, x.pauseAfter); };
        setTimeout(function(){ if (myGen === sampleGen) speechSynthesis.speak(ut); }, 0);
      })();
    }
    function stopPreview(){ sampleGen++; if (supported) try { speechSynthesis.cancel(); } catch(_){} }

    /* ---- the voices panel ---- */
    function pitchLabel(){ return dec(pitchPref, 2); }
    function hintText(){
      var narr = currentVoice();
      if (!narr) return "";
      if (dialogueName === "same") return _t("Quoted speech is read in the narrator’s voice.");
      var d = dialogueVoice(narr), g = voiceGender(narr);
      if (dialogueName) return d.voice && d.voice !== narr ? _t("{name} reads the quoted speech.", { name: shortName(d.voice) }) : "";
      if (d.voice && d.voice !== narr) return _t("Chosen for you: {name} reads the quoted speech.", { name: shortName(d.voice) });
      var up = d.pitchOffset > 0;
      if (g === "f") return up ? _t("No man’s voice for this language, so quoted speech is the narrator pitched higher.") : _t("No man’s voice for this language, so quoted speech is the narrator pitched lower.");
      if (g === "m") return up ? _t("No woman’s voice for this language, so quoted speech is the narrator pitched higher.") : _t("No woman’s voice for this language, so quoted speech is the narrator pitched lower.");
      return up ? _t("No second voice for this language, so quoted speech is the narrator pitched higher.") : _t("No second voice for this language, so quoted speech is the narrator pitched lower.");
    }
    function syncHint(){ var h = $("#ttsDlgHint"); if (h) h.textContent = hintText(); }
    function exprChips(){
      return [["off", _t("Off")], ["natural", _t("Natural")], ["dramatic", _t("Dramatic")]].map(function(c){
        return '<button class="chip' + (expr === c[0] ? ' on' : '') + '" role="radio" aria-checked="' + (expr === c[0] ? "true" : "false") + '" data-expr="' + c[0] + '">' + c[1] + '</button>';
      }).join("");
    }
    /* the engine chips: the natural voices are one chip ("natural"), their quality a pair of chips under it */
    function engineGroup(){ return isNatural(engineName) ? "natural" : engineName; }
    function engineChips(){
      return [["device", _tc("engine", "Device voice")], ["eleven", "ElevenLabs"], ["natural", _t("Natural voices")]].map(function(c){
        var on = engineGroup() === c[0];
        return '<button class="chip' + (on ? ' on' : '') + '" role="radio" aria-checked="' + (on ? "true" : "false") + '" data-engine="' + c[0] + '">' + c[1] + '</button>';
      }).join("");
    }
    function qualityChips(){
      return [["fast", _t("Fast · keeps up on phones")], ["best", _t("Best · slower, prepare first")]].map(function(c){
        var on = (engineName === "kokoro" ? "best" : "fast") === c[0];
        return '<button class="chip' + (on ? ' on' : '') + '" role="radio" aria-checked="' + (on ? "true" : "false") + '" data-quality="' + c[0] + '">' + c[1] + '</button>';
      }).join("");
    }
    /* what the natural voices' rows say for each quality */
    var NATURAL = {
      piper: { dl: _t("Download natural voices (≈ {mb} MB, once)", { mb: 80 }), narr: ["493", "Grace"],
               hint: _t("Runs on this device and keeps up with reading on most phones. Nothing is sent anywhere."),
               prep: _t("Prepare book makes the whole book ahead, to listen offline. Keep Lamplight open; it carries on where it left off.") },
      kokoro: { dl: _t("Download natural voices (≈ {mb} MB, once)", { mb: 105 }), narr: ["af_heart", _t("Heart (woman)")],
                hint: _t("Runs on this device. Nothing is sent anywhere. Slower than reading on most phones: press Prepare book first, then listen with no pauses."),
                prep: _t("Keep Lamplight open (plugging in helps); it carries on where it left off.") }
    };
    /* Fast on a Dutch book: its Dutch voices, a pack of their own (audiobook.js keeps these rows in step with the book) */
    NATURAL.piperNl = { dl: _t("Download Dutch voices (≈ {mb} MB, once)", { mb: 77 }), narr: ["nl:14", "Eva"], hint: NATURAL.piper.hint, prep: NATURAL.piper.prep };
    function naturalText(){ return NATURAL[engineName === "kokoro" ? "kokoro" : docLang() === "nl" ? "piperNl" : "piper"]; }
    function castChips(){
      return [["off", _t("One voice")], ["on", _t("A voice per character")]].map(function(c){
        var on = (castOn ? "on" : "off") === c[0];
        return '<button class="chip' + (on ? ' on' : '') + '" role="radio" aria-checked="' + (on ? "true" : "false") + '" data-cast="' + c[0] + '">' + c[1] + '</button>';
      }).join("");
    }
    var MODELS = [["eleven_multilingual_v2", "Multilingual v2"], ["eleven_v3", _t("v3 expressive")], ["eleven_flash_v2_5", "Flash v2.5"]];
    function modelChips(){
      return MODELS.map(function(c){ return '<button class="chip" role="radio" aria-checked="false" data-model="' + c[0] + '">' + c[1] + '</button>'; }).join("");
    }
    /* which engine reads: the panel's first row, since everything under it follows the choice */
    function engineChipRow(){
      return '<div class="rowline"><label id="ttsEngineL">' + _t("Voices from") + '</label><div class="chips seg" role="radiogroup" aria-labelledby="ttsEngineL" id="engineChips">' + engineChips() + '</div></div>';
    }
    /* the rows under the pair: whether characters get voices of their own, the ElevenLabs rows and the natural
       voices' rows (both filled by audiobook.js once it has loaded), and how much read-aloud audio the device keeps */
    function engineRows(){
      return '<div class="rowline" id="castRow"><label id="ttsCastL">' + _t("Characters") + '</label><div class="chips" role="radiogroup" aria-labelledby="ttsCastL" id="castChips">' + castChips() + '</div></div>' +
        '<p class="hint" id="ttsCastHint">' + _t("Every character gets a device voice of their own, the unnamed ones too, worked out from the text on this device (“said Anna”, “he whispered”, who acts beside a line, who takes turns).") + '</p>' +
        '<div class="rowline" id="castBtnRow"><button type="button" class="chip" id="ttsCastBtn">' + _t("Voices for characters…") + '</button></div>' +
        '<div class="subgroup" id="elevenRow" data-engine-only="eleven">' +
          '<div class="rowline"><label for="elevenNarrator">' + _t("Narrator") + '</label><select id="elevenNarrator" class="sel" disabled><option value="">' + _t("Add a key first") + '</option></select></div>' +
          '<div class="rowline"><label id="elevenModelL">' + _t("Model") + '</label><div class="chips" role="radiogroup" aria-labelledby="elevenModelL" id="elevenModelChips">' + modelChips() + '</div></div>' +
          '<div class="rowline"><button type="button" class="link-btn" id="elevenKeyLink">' + _t("ElevenLabs API key…") + '</button></div>' +
          '<p class="hint">' + _t("Each sentence is sent to ElevenLabs once and kept on this device, so replaying is free. Uses your ElevenLabs credits.") + '</p>' +
        '</div>' +
        '<div class="subgroup" id="kokoroRow" data-engine-only="piper kokoro">' +
          '<div class="rowline"><label id="naturalQualityL">' + _t("Quality") + '</label><div class="chips" role="radiogroup" aria-labelledby="naturalQualityL" id="naturalQuality">' + qualityChips() + '</div></div>' +
          '<div class="rowline"><label for="kokoroNarrator">' + _t("Narrator") + '</label><select id="kokoroNarrator" class="sel"><option value="' + naturalText().narr[0] + '">' + naturalText().narr[1] + '</option></select></div>' +
          '<div class="rowline" id="kokoroDlRow"><span class="k-state" id="kokoroState" aria-live="polite">' + _t("Checking…") + '</span>' +
            '<button type="button" class="chip" id="kokoroDl" hidden>' + naturalText().dl + '</button>' +
            '<button type="button" class="chip" id="kokoroRm" hidden>' + _t("Remove") + '</button></div>' +
          '<progress id="kokoroProgress" class="k-progress" max="100" value="0" aria-label="' + _t("Downloading the natural voices") + '" hidden></progress>' +
          '<p class="hint" id="naturalHint">' + naturalText().hint + '</p>' +
          '<div class="rowline" id="kokoroPrepRow"><span class="k-state" id="kokoroPrepState" aria-live="polite"></span>' +
            '<button type="button" class="chip" id="kokoroPrep">' + _t("Prepare book") + '</button></div>' +
          '<progress id="kokoroPrepProgress" class="k-progress" max="100" value="0" aria-label="' + _t("Preparing the audiobook") + '" hidden></progress>' +
          '<p class="hint" id="naturalPrepHint">' + naturalText().prep + '</p>' +
        '</div>' +
        '<div class="rowline" id="audioKeptRow" hidden><span class="k-state" id="audioKept">' + _t("Audio kept on this device") + '</span><button type="button" class="chip" id="audioClear">' + _t("Clear") + '</button></div>';
    }
    /* the chips and rows above follow the settings; asked = the reader did something (opened the panel, chose an
       engine, changed the key), so the ElevenLabs engine may fetch what its rows show */
    function syncEngineUI(asked){
      if (!Side.is("voices")) return;
      var box = Side.body;
      Array.prototype.forEach.call(box.querySelectorAll("#engineChips .chip"), function(c){
        var on = c.dataset.engine === engineGroup(); c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
      });
      /* the natural voices' quality, and the rows' words for it (the rows themselves are filled by audiobook.js) */
      Array.prototype.forEach.call(box.querySelectorAll("#naturalQuality .chip"), function(c){
        var on = c.dataset.quality === (engineName === "kokoro" ? "best" : "fast"); c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
      });
      var nt = naturalText(), nDl = box.querySelector("#kokoroDl"), nHint = box.querySelector("#naturalHint"), nPrep = box.querySelector("#naturalPrepHint");
      if (nDl && nDl.textContent !== nt.dl) nDl.textContent = nt.dl;
      if (nHint && nHint.textContent !== nt.hint) nHint.textContent = nt.hint;
      if (nPrep && nPrep.textContent !== nt.prep) nPrep.textContent = nt.prep;
      Array.prototype.forEach.call(box.querySelectorAll("#castChips .chip"), function(c){
        var on = c.dataset.cast === (castOn ? "on" : "off"); c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
      });
      var row = box.querySelector("#castRow"), hint = box.querySelector("#ttsCastHint"), btn = box.querySelector("#castBtnRow");
      if (row) row.hidden = engineName !== "device";
      if (hint) hint.hidden = engineName !== "device";
      if (btn) btn.hidden = !(engineName !== "device" || castOn);
      var kept = box.querySelector("#audioKeptRow"); if (kept) kept.hidden = engineName === "device";
      Array.prototype.forEach.call(box.querySelectorAll("[data-engine-only]"), function(el){
        el.hidden = (" " + el.dataset.engineOnly + " ").indexOf(" " + engineName + " ") < 0;   /* only the chosen engine's rows show (a row may name several) */
      });
      /* "Hear the pair" plays the device voices, so it shows only when they are the ones reading */
      var smp = document.getElementById("ttsSample"); if (smp) smp.hidden = engineName !== "device";
      if (engineName !== "device" && ENGINE_LIB[engineName]){
        need([ENGINE_LIB[engineName]]).then(function(){ var e = engines[engineName]; if (e && e.syncSettings && Side.is("voices")) e.syncSettings(asked); }).catch(function(){});
      }
    }
    /* name: "device", "eleven", "piper" or "kokoro"; "natural" is the natural voices at the quality last chosen */
    function setEngine(name){
      if (name === "natural") name = isNatural(engineName) ? engineName : Store.get("ll_natural_quality") === "best" ? "kokoro" : "piper";
      if (name !== "device" && name !== "eleven" && !isNatural(name)) return;
      if (isNatural(name)) Store.set("ll_natural_quality", name === "kokoro" ? "best" : "fast");
      if (name === engineName){ syncEngineUI(true); return; }
      engineName = name; Store.set("ll_tts_engine", name);
      syncEngineUI(true);
      /* a reading under way starts again from its sentence with the new engine */
      if (active){ var at = units[idx] ? units[idx].start : undefined; stop(); startFrom(at); }
      /* a natural-voices model no longer chosen gives its memory back */
      if (window.llAudiobook && window.llAudiobook.engineChanged) window.llAudiobook.engineChanged();
    }
    function setCast(on){
      castOn = !!on; Store.set("ll_tts_cast", castOn ? "on" : "off");
      syncEngineUI(true);
      if (!active || runEngine !== engines.device) return;
      if (!castOn){ devPlan = null; restart(); return; }
      var p = engines.device.prepare(units, ctx);
      if (p && p.then) p.then(function(){ if (active) restart(); }); else restart();
    }
    /* an engine's own script, loaded on demand (the key link and the Cast panel work before the engine has run) */
    function withAudiobook(fn){
      need(["audiobook"]).then(function(){ if (window.llAudiobook) fn(window.llAudiobook); }).catch(function(){ Marks.toast(_t("Couldn’t load the voices module")); });
    }
    function setExpr(v){
      if (!/^(off|natural|dramatic)$/.test(v)) return;
      expr = v; Store.set("ll_tts_expr", v);
      var chips = $("#ttsExpr");
      if (chips) Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function(c){
        var on = c.dataset.expr === v; c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
      });
      restart();
    }
    /* the icons this panel draws, kept here so the read-aloud region owns them */
    var V_ICONS = {
      play:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
      pair:  '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
      cards: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h6v8H3z"/><path d="M9 8h6v8H9z"/><path d="M15 8h6v8h-6z"/></svg>',
      expr:  '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 15c-2 0-3.5-1.5-3.5-3.5S5 8 7 8s3 1.5 3 3.5c0 3-2 6-4 7"/><path d="M17 15c-2 0-3.5-1.5-3.5-3.5S15 8 17 8s3 1.5 3 3.5c0 3-2 6-4 7"/></svg>',
      clock: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"/><path d="M12 7v5l3 2"/></svg>'
    };
    var SEX = { f: "♀", m: "♂", "": "—" };
    var SEXLAB = { f: "{name} is a woman’s voice — change", m: "{name} is a man’s voice — change", "": "{name} is not marked — change" };
    function sexLabel(v){ return _t(SEXLAB[voiceGender(v)], { name: shortName(v) }); }
    var allOpen = false, filterText = "";
    var langNames = null;
    /* "English", "Spanish" — the language written out, where the browser can; else its code */
    function langLabel(code){
      var l = String(code || "").slice(0, 2);
      if (!l) return _t("Other");
      if (langNames === null){
        langNames = false;
        try {
          if (typeof Intl !== "undefined" && Intl.DisplayNames){
            try { langNames = new Intl.DisplayNames([I18N.locale() || uiLocale()], { type: "language" }); }     /* named in the interface's language */
            catch(_){ langNames = new Intl.DisplayNames(["en"], { type: "language" }); }
          }
        } catch(_){ langNames = false; }
      }
      try { if (langNames) return langNames.of(l) || l; } catch(_){}
      return l;
    }
    function tagsHtml(v){
      return '<span class="v-tags" data-no-i18n>' + voiceTags(v).map(function(t){ return '<span class="v-tag">' + esc(t) + '</span>'; }).join("") + '</span>';
    }
    /* the title carries the whole name, for the long Windows labels a narrow card shortens */
    function nameHtml(v){
      var n = shortName(v);
      return '<span class="v-name" title="' + esc(nameOf(v) || n) + '" data-no-i18n>' + esc(n) + '</span>';
    }
    function previewBtn(v){
      var lab = _t("Hear {name}", { name: shortName(v) });
      return '<button type="button" class="v-play" data-play="' + esc(voiceId(v)) + '" title="' + esc(lab) + '" aria-label="' + esc(lab) + '">' + V_ICONS.play + '</button>';
    }
    function sexChip(v){
      var g = voiceGender(v), lab = sexLabel(v);
      return '<button type="button" class="chip v-sex" data-sex="' + esc(voiceId(v)) + '" title="' + esc(lab) + '" aria-label="' + esc(lab) + '">' + SEX[g] + '</button>';
    }
    /* the label repeats the name: a dozen buttons all called "Narrator" tell a screen reader nothing */
    function assignBtns(v, nId, dId){
      var id = voiceId(v), n = shortName(v);
      return '<button type="button" class="chip v-assign" data-role="narr" data-id="' + esc(id) + '" aria-pressed="' + (id === nId) + '" aria-label="' + esc(_t("{name} reads the narration", { name: n })) + '">' + _t("Narrator") + '</button>' +
             '<button type="button" class="chip v-assign" data-role="dlg" data-id="' + esc(id) + '" aria-pressed="' + (id === dId) + '" aria-label="' + esc(_t("{name} reads the quoted speech", { name: n })) + '">' + _t("Dialogue") + '</button>';
    }
    function pairRow(label, v){
      if (!v) return '<div class="v-row"><span class="v-role">' + label + '</span><span class="v-who"><span class="v-name">' + _t("No voice yet") + '</span></span></div>';
      return '<div class="v-row"><span class="v-role">' + label + '</span>' +
             '<span class="v-who">' + nameHtml(v) + tagsHtml(v) + '</span>' + previewBtn(v) + '</div>';
    }
    function pairRows(narr, d){ return pairRow(_t("Narrator"), narr) + pairRow(_t("Dialogue"), d); }
    /* up to six cards: the three best women and the three best men for this language, side by
       side, topped up with whatever else scores well where a device names fewer */
    function cardVoices(lang){
      var all = sortedVoices(lang).filter(function(v){ return !isHidden(v); });
      var here = all.filter(function(v){ return langOf(v) === lang; });
      if (here.length < 2) here = all;
      var w = here.filter(function(v){ return voiceGender(v) === "f"; }).slice(0, 3);
      var m = here.filter(function(v){ return voiceGender(v) === "m"; }).slice(0, 3);
      var out = [], i;
      for (i = 0; i < 3; i++){ if (w[i]) out.push(w[i]); if (m[i]) out.push(m[i]); }
      here.forEach(function(v){ if (out.length < 6 && out.indexOf(v) < 0) out.push(v); });
      return out.slice(0, 6);
    }
    function cardsHtml(lang, nId, dId){
      var list = cardVoices(lang);
      if (!list.length) return '<p class="hint">' + _t("This browser offers no voices yet.") + '</p>';
      return '<div class="v-cards">' + list.map(function(v){
        return '<div class="v-card">' +
          '<div class="v-card-top">' + nameHtml(v) + sexChip(v) + previewBtn(v) + '</div>' +
          tagsHtml(v) +
          '<div class="v-acts">' + assignBtns(v, nId, dId) + '</div></div>';
      }).join("") + '</div>';
    }
    /* the whole list, one tap away: by language, then women, men and the rest */
    function listHtml(lang, nId, dId){
      var order = [], byLang = {}, hidden = [];
      sortedVoices(lang).forEach(function(v){
        if (isHidden(v)){ hidden.push(v); return; }
        var l = langOf(v) || "??";
        if (!byLang[l]){ byLang[l] = { f: [], m: [], "": [] }; order.push(l); }
        byLang[l][voiceGender(v)].push(v);
      });
      var shown = 0;
      var html = order.map(function(l){
        var g = byLang[l];
        return '<div class="v-group"><div class="label" data-no-i18n>' + esc(langLabel(l)) + '</div>' +
          [["f", _t("Women")], ["m", _t("Men")], ["", _t("Other")]].map(function(sec){
            if (!g[sec[0]].length) return "";
            return '<div class="v-sub"><div class="v-sub-l">' + sec[1] + '</div>' + g[sec[0]].map(function(v){
              shown++;
              var find = (nameOf(v) + " " + shortName(v) + " " + (v.lang || "") + " " + langLabel(l)).toLowerCase();
              return '<div class="v-item" data-find="' + esc(find) + '">' + previewBtn(v) +
                '<span class="v-who">' + nameHtml(v) + tagsHtml(v) + '</span>' +
                '<span class="v-acts">' + assignBtns(v, nId, dId) + sexChip(v) +
                '<button type="button" class="chip v-hide" data-hide="' + esc(voiceId(v)) + '" aria-label="' + esc(_t("Hide {name}", { name: shortName(v) })) + '">' + _t("Hide") + '</button></span></div>';
            }).join("") + '</div>';
          }).join("") + '</div>';
      }).join("");
      if (hidden.length) html += '<div class="v-group v-hidden"><div class="label">' + _t("Hidden ({n})", { n: hidden.length }) + '</div><div class="chips">' + hidden.map(function(v){
        return '<button type="button" class="chip" data-show="' + esc(voiceId(v)) + '" aria-label="' + esc(_t("Show {name} again", { name: shortName(v) })) + '" data-no-i18n>' + esc(shortName(v)) + '</button>';
      }).join("") + '</div></div>';
      return { html: html || '<p class="hint">' + _t("No voices to list.") + '</p>', count: shown };
    }
    function renderPanel(body, foot){
      var lang = docLang(), narr = currentVoice(), d = dialogueVoice(narr).voice;
      var nId = narr ? voiceId(narr) : "", dId = d ? voiceId(d) : "";
      var list = listHtml(lang, nId, dId);
      /* "Voices from" comes first; the device voices' own parts (the pair, the cards, the list, expression and pitch,
         which the other engines do not use) show only while the device voice is the one chosen (syncEngineUI) */
      body.innerHTML = '<div class="tts-panel">' +
        '<section class="group">' +
          '<div class="label">' + V_ICONS.pair + '<span>' + _t("Reading to you") + '</span></div>' +
          engineChipRow() +
          '<div class="subgroup" id="devicePair" data-engine-only="device">' +
            '<div class="card v-pair"><div id="ttsPair">' + pairRows(narr, d) + '</div>' +
              '<div class="v-pair-acts"><button type="button" class="chip" id="ttsSwap">' + _t("Swap the two") + '</button>' +
              '<button type="button" class="chip" id="ttsAuto">' + _t("Choose for me") + '</button></div></div>' +
            '<p class="hint" id="ttsDlgHint">' + esc(hintText()) + '</p>' +
            '<p class="hint" id="ttsNoGender"' + (anyGenderKnown() ? ' hidden' : '') + '>' + _t("Your device doesn’t say which voices are women’s and which are men’s — mark them below and Lamplight will remember.") + '</p>' +
          '</div>' +
          engineRows() +
        '</section>' +
        '<section class="group" data-engine-only="device">' +
          '<div class="label">' + V_ICONS.cards + '<span>' + _t("Good for this text") + '</span></div>' +
          cardsHtml(lang, nId, dId) +
        '</section>' +
        '<section class="group" data-engine-only="device">' +
          '<details class="v-all" id="ttsAll"' + (allOpen ? ' open' : '') + '><summary>' + _t("All voices ({n})", { n: list.count }) + '</summary>' +
            '<input type="search" id="ttsFilter" class="v-filter" placeholder="' + _t("Filter by name or language") + '" aria-label="' + _t("Filter voices") + '" value="' + esc(filterText) + '">' +
            '<p class="hint" id="ttsFilterNone" hidden>' + _t("No voice matches that.") + '</p>' +
            '<div class="v-list" id="ttsList">' + list.html + '</div></details>' +
        '</section>' +
        '<section class="group" data-engine-only="device">' +
          '<div class="label">' + V_ICONS.expr + '<span>' + _t("Expression") + '</span></div>' +
          '<div class="rowline"><label id="ttsExprL">' + _t("Expression") + '</label><div class="chips seg" role="radiogroup" aria-labelledby="ttsExprL" id="ttsExpr">' + exprChips() + '</div></div>' +
          '<div class="hint">' + _t("Natural follows the punctuation and the said-tags around speech; dramatic pushes harder.") + '</div>' +
          '<div class="rowline"><label for="ttsPitch">' + _t("Pitch") + '</label><input type="range" id="ttsPitch" min="0.7" max="1.3" step="0.05" value="' + pitchPref + '"><span class="val" id="ttsPitchV">' + pitchLabel() + '</span></div>' +
        '</section>' +
        '<section class="group">' +
          '<div class="label">' + V_ICONS.clock + '<span>' + _t("Sleep timer") + '</span></div>' +
          '<div class="rowline"><label id="ttsSleepL">' + _t("Stop after") + '</label><div class="chips tts-sleep-chips" role="group" aria-labelledby="ttsSleepL" id="ttsSleepChips">' + sleepChips() + '</div></div>' +
          '<div class="hint">' + _t("Minutes from now; reading stops at the end of the sentence. End of chapter stops before the next heading, or at the end of a PDF page.") + '</div>' +
        '</section>' +
        '</div>';
      foot.innerHTML = '<button class="chip" id="ttsSample">' + _t("Hear the pair") + '</button>';
      var chips = body.querySelector("#ttsExpr"), sleep = body.querySelector("#ttsSleepChips");
      var pitchEl = body.querySelector("#ttsPitch"), pitchV = body.querySelector("#ttsPitchV");
      sleep.addEventListener("click", function(e){
        var ch = e.target.closest(".chip"); if (!ch) return;
        setSleep(ch.dataset.sleep === "chapter" ? "chapter" : +ch.dataset.sleep);
      });
      chips.addEventListener("click", function(e){ var ch = e.target.closest(".chip"); if (ch) setExpr(ch.dataset.expr); });
      chips.addEventListener("keydown", function(e){
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        var all = Array.prototype.slice.call(chips.querySelectorAll(".chip")), i = all.indexOf(e.target);
        if (i < 0) return;
        e.preventDefault();
        var n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
        n.focus(); setExpr(n.dataset.expr);
      });
      pitchEl.addEventListener("input", function(){
        pitchPref = +pitchEl.value; pitchV.textContent = pitchLabel(); Store.set("ll_tts_pitch", String(pitchPref));
        restart();
      });
      foot.querySelector("#ttsSample").addEventListener("click", sample);
      if (filterText) applyFilter();
      syncEngineUI(true);
    }
    /* the panel is redrawn whole only when the voice list itself changes; a choice made inside it
       repaints the parts that moved, so the button pressed keeps the focus */
    function syncPanel(){
      if (!Side.is("voices")) return;
      var narr = currentVoice(), d = dialogueVoice(narr).voice, box = Side.body;
      var nId = narr ? voiceId(narr) : "", dId = d ? voiceId(d) : "";
      Array.prototype.forEach.call(box.querySelectorAll(".v-assign"), function(b){
        var on = b.dataset.id === (b.dataset.role === "narr" ? nId : dId);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      Array.prototype.forEach.call(box.querySelectorAll(".v-sex"), function(b){
        var v = findVoice(b.dataset.sex); if (!v) return;
        var g = voiceGender(v), lab = sexLabel(v);
        b.textContent = SEX[g]; b.title = lab; b.setAttribute("aria-label", lab);
      });
      var pair = box.querySelector("#ttsPair"); if (pair) pair.innerHTML = pairRows(narr, d);
      var note = box.querySelector("#ttsNoGender"); if (note) note.hidden = anyGenderKnown();
      syncHint();
    }
    function applyFilter(){
      var box = Side.body.querySelector("#ttsList"); if (!box) return;
      var q = filterText.trim().toLowerCase(), any = 0;
      Array.prototype.forEach.call(box.querySelectorAll(".v-item"), function(it){
        var on = !q || it.dataset.find.indexOf(q) >= 0;
        it.hidden = !on; if (on) any++;
      });
      Array.prototype.forEach.call(box.querySelectorAll(".v-sub"), function(s){
        s.hidden = !s.querySelector(".v-item:not([hidden])");
      });
      Array.prototype.forEach.call(box.querySelectorAll(".v-group"), function(g){
        if (!g.classList.contains("v-hidden")) g.hidden = !g.querySelector(".v-item:not([hidden])");
      });
      var none = Side.body.querySelector("#ttsFilterNone"); if (none) none.hidden = !!any;
    }
    /* one listener for the whole panel: it is redrawn often, the drawer's body is not */
    Side.body.addEventListener("click", function(e){
      if (!Side.is("voices")) return;
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.play !== undefined){ preview(findVoice(b.dataset.play)); return; }
      if (b.classList.contains("v-assign")){
        if (b.dataset.role === "narr") setVoice(b.dataset.id); else setDialogue(b.dataset.id === voiceId(currentVoice()) ? "same" : b.dataset.id);
        return;
      }
      if (b.dataset.sex !== undefined){
        var v = findVoice(b.dataset.sex); if (!v) return;
        var g = voiceGender(v);
        setGender(v, g === "f" ? "m" : g === "m" ? "x" : "f");
        syncPanel(); syncBar(); restart();
        return;
      }
      if (b.dataset.hide !== undefined || b.dataset.show !== undefined){
        var id = b.dataset.hide !== undefined ? b.dataset.hide : b.dataset.show;
        var vv = findVoice(id); if (!vv) return;
        setHidden(vv, b.dataset.hide !== undefined);
        allOpen = true;
        syncBar();
        Side.refresh("voices", renderPanel);
        var s = Side.body.querySelector("#ttsAll summary"); if (s) s.focus({ preventScroll: true });
        return;
      }
      if (b.id === "ttsSwap"){ swapPair(); return; }
      if (b.id === "ttsAuto"){ setVoice(""); setDialogue(""); return; }
      if (b.dataset.engine !== undefined){ setEngine(b.dataset.engine); return; }
      if (b.dataset.quality !== undefined){ setEngine(b.dataset.quality === "best" ? "kokoro" : "piper"); return; }
      if (b.dataset.cast !== undefined){ setCast(b.dataset.cast === "on"); return; }
      if (b.id === "ttsCastBtn"){ withAudiobook(function(a){ a.openCast(); }); return; }
      if (b.id === "elevenKeyLink"){ withAudiobook(function(a){ a.askForKey(); }); return; }
      if (b.id === "kokoroDl"){ withAudiobook(function(a){ a.downloadNatural(); }); return; }
      if (b.id === "kokoroRm"){ withAudiobook(function(a){ a.removeNatural(); }); return; }
      if (b.id === "kokoroPrep"){ withAudiobook(function(a){ a.prepareBook(); }); return; }
      if (b.id === "audioClear"){ withAudiobook(function(a){ a.clearAudio(); }); return; }
    });
    Side.body.addEventListener("input", function(e){
      if (!Side.is("voices") || e.target.id !== "ttsFilter") return;
      filterText = e.target.value; applyFilter();
    });
    Side.body.addEventListener("toggle", function(e){
      if (Side.is("voices") && e.target.id === "ttsAll") allOpen = e.target.open;
    }, true);
    function openPanel(){ Side.open("voices", _t("Read-aloud voices"), renderPanel, stopPreview); }

    playBtn.addEventListener("click", function(){ if (playing) pause(); else play(); });
    $("#ttsStop").addEventListener("click", stop);
    $("#ttsPrev").addEventListener("click", function(){ step(-1); });
    $("#ttsNext").addEventListener("click", function(){ step(1); });
    rateEl.addEventListener("input", function(){ setRate(+rateEl.value); });
    speedBtn.addEventListener("click", function(e){ e.stopPropagation(); speedMenu(); });
    $("#ttsPresets").addEventListener("click", function(e){ var c = e.target.closest(".chip[data-rate]"); if (c) setRate(+c.dataset.rate); });
    /* a tap outside closes it and goes no further (it would look the word under it up) */
    document.addEventListener("click", function(e){
      if (speedPop.hidden || speedPop.contains(e.target) || speedBtn.contains(e.target)) return;
      speedMenu(false); e.preventDefault(); e.stopPropagation();
    }, true);
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape" && !speedPop.hidden){ e.preventDefault(); e.stopImmediatePropagation(); speedMenu(false); }
    }, true);
    voiceSel.addEventListener("change", function(){
      if (runEngine && runEngine.voiceChanged){ runEngine.voiceChanged(voiceSel.value); syncBar(); restart(); }
      else setVoice(voiceSel.value);
    });
    voicesBtn.addEventListener("click", openPanel);
    sleepBtn.addEventListener("click", openPanel);
    /* a long press on the bar's speaker opens the voices without starting (a tap starts and stops) */
    longPress($("#speakBtn"), openPanel);
    window.addEventListener("resize", measure);
    window.addEventListener("pagehide", function(){
      if (supported) try { speechSynthesis.cancel(); } catch(_){}
      if (runEngine && runEngine !== engines.device) runEngine.cancel();
      if (silence) try { silence.pause(); } catch(_){}
    });

    Menu.add({ order: 40, quick: 1, group: "reading", icon: ICONS.speaker, label: function(){ return active ? _t("Stop reading aloud") : _t("Read aloud"); }, key: "R", run: function(){ if (active) stop(); else startFrom(); },
               show: function(){ return state.mode === "doc" || state.mode === "pdf"; }, enabled: function(){ return supported || engineName !== "device"; } });
    /* the characters of the open document (audiobook.js works them out, on this device) */
    Menu.add({ order: 41, group: "reading", icon: ICONS.people, label: function(){ return _t("Who’s who"); }, run: function(){ withAudiobook(function(a){ a.openWho(); }); },
               show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    /* test hook: the pure pieces, and what the panel would choose */
    window.llSpeak = {
      voiceGender: voiceGender, express: express, dialogueVoice: dialogueVoice, bestVoice: bestVoice, sortedVoices: sortedVoices,
      voiceScore: voiceScore, shortName: shortName, voiceTags: voiceTags, voiceId: voiceId, cardVoices: function(){ return cardVoices(docLang()); },
      setGender: function(id, g){ var v = findVoice(id); if (v){ setGender(v, g); syncPanel(); syncBar(); } },
      setHidden: function(id, on){ var v = findVoice(id); if (v) setHidden(v, on); },
      currentVoice: currentVoice, setVoice: setVoice, setDialogue: setDialogue, preview: preview,
      plan: function(text, dashes){ var out = []; unitsFromText(String(text || ""), 0, out, null, dashes); return out; }, dashStyle: dashStyle,
      settings: function(){ return { voice: voiceName, dialogue: dialogueName, expr: expr, pitch: pitchPref, rate: rate }; },
      lang: docLang, setDocLang: setDocLang, detect: detectFrom, ramp: RAMP.slice(),
      openPanel: openPanel, sample: sample, sampleText: SAMPLE, previewText: PREVIEW,
      sleep: function(){ return { mode: sleepMode, at: sleepAt }; }, setSleep: setSleep,
      sections: function(){ return sections.slice(); }, silentWav: silentWav,
      findVoice: findVoice, castPlan: function(){ return devPlan; }
    };
    return { start: startFrom, stop: stop, pause: pause, play: play, prev: function(){ step(-1); }, next: function(){ step(1); },
             isActive: function(){ return active; }, isPlaying: function(){ return playing; },
             units: function(){ return units; }, index: function(){ return idx; }, buildDocUnits: buildDocUnits, openVoices: openPanel,
             setDocLang: setDocLang, supported: supported, docLang: docLang,
             registerEngine: registerEngine, setEngine: setEngine, engine: function(){ return engineName; }, activeEngine: function(){ return runEngine; },
             cast: function(){ return castOn; }, setCast: setCast, rate: function(){ return rate; }, context: function(){ return ctx; }, audioElement: audioElement,
             syncBar: syncBar };
  })();

  /* ============================================================
     Reading pace — tells reading from everything else, times only the
     reading, and keeps a words-per-minute (pages-per-minute for PDFs)
     with a confidence, globally and per book
     ============================================================ */
  /* The detector samples where the reader is (the top and bottom word of the visible window, or
     the PDF page), coalesces the position changes of one gesture, and classifies each settled
     movement against the last rested window: a step is credited with the words that passed the top
     and the time since the last step; a fast step beyond half a window is a skim; a dwell longer
     than the words on screen could take is a pause; a landing beyond the window is a jump. Credited
     steps form runs; runs that last long enough become the samples of a weighted median, blended
     with a fading prior, globally and per book. Overlays, read-aloud, auto-scroll and a hidden tab
     stop the clock or end the run. Everything here runs on Date.now() and plain timers. */
  var Pace = (function(){
    var KEY = "ll_pace", DAY = 86400000;
    /* every constant in one place; tests may change them through llPace._debug.setParams */
    var Params = {
      TICK_MS: 250, HEARTBEAT_MS: 1000, SETTLE_MS: 800, STILL_WORDS: 6, JUMP_TOL_MIN: 12, JUMP_TOL_FRAC: 0.12,
      SKIM_WPM: 1200, SKIM_MIN_FRACTION: 0.6, SKIM_STREAK_CUT: 2, MOVES_SKIM: 3, MIN_PAGE_MS: 4000,
      MERGE_MS: 6000, MERGE_BAND: 1.5, MERGE_FLOOR_WPM: 400, MERGE_PART: 0.75,
      MIN_WPM: 60, MIN_DWELL_MS: 30000, HARD_PAUSE_MS: 270000, HARD_PAUSE_INPUT_MS: 420000, INPUT_GUARD_MS: 1500,
      SLOW_CAP_MS: 600000, HELD_N: 3, HELD_BAND: 2, HELD_MAX_MS: 600000, FLOOR_WPM: 25, DWELL_BAND: 2.5, SLOW_BAND: 1.5,
      NAV_WINDOW_MS: 1500, BLUR_GRACE_MS: 30000, BLOCK_MAX_MS: 1200000, UNMEASURABLE_MS: 5000,
      RESUME_MS: 120000, RESUME_TOL: 1,
      MIN_RUN_MS: 40000, MIN_RUN_WORDS: 120, MIN_RUN_STEPS: 2, MIN_RUN_MS_PDF: 30000, MIN_RUN_PAGES: 1,
      PRIOR_WPM: 230, PRIOR_PPM: 0.5, PRIOR_W: 400, PRIOR_W_BOOK: 400, PRIOR_P: 2, PRIOR_P_BOOK: 2,
      RUN_WEIGHT_CAP: 3000, RUN_WEIGHT_CAP_P: 20, HALF_LIFE_DAYS: 45,
      KEEP_RUNS: 60, KEEP_PER_BOOK: 8, MAX_AGE_DAYS: 180, MAX_ENTRIES: 200,
      CONF_M0: 20, CONF_SPREAD0: 0.6,
      INDEX_SLICE_CHARS: 200000, SPARSE_WORDS: 40, SAVE_DEBOUNCE_MS: 2000, LIVE_RECOMPUTE_WORDS: 0
    };

    /* ---- small helpers ---- */
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    function docKeyNow(){ return (Library.currentId() || "") + ":" + state.mode; }
    function num(x){ return typeof x === "number" && isFinite(x) && x > 0 ? x : 0; }
    function clamp(x, lo, hi){ return Math.min(hi, Math.max(lo, x)); }
    var els = {};
    function el(sel){ var e = els[sel]; if (!e || !document.contains(e)){ e = $(sel); if (e) els[sel] = e; } return e || null; }
    function has(sel, cls){ var e = el(sel); return !!e && e.classList.contains(cls); }
    function mins(ms){ return Math.floor(ms / 60000); }
    function dur(ms){ var m = mins(ms), h = Math.floor(m / 60); return h ? (m % 60 ? _t("{h} h {m} min", { h: h, m: m % 60 }) : _t("{h} h", { h: h })) : _t("{n} min", { n: m }); }
    function jumpTol(V){ return Math.max(Params.JUMP_TOL_MIN, Math.round(Params.JUMP_TOL_FRAC * V)); }
    function round3(x){ return x === Infinity ? 1e9 : Math.round(x * 1000) / 1000; }

    /* ---- the word index: the start offset of every word of #doc, built once per document, in
       slices of characters so a whole novel never blocks a frame. idx(off) is the number of word
       starts at or before an offset, so positions become word numbers by binary search ---- */
    var index = { key: null, ready: false, words: 0, slices: 0, ms: 0, starts: [] }, indexGen = 0, indexBuilding = null;
    function indexKey(){ return docKeyNow() + ":" + Anchor.textLength(); }
    function indexReady(){ return state.mode === "doc" && index.ready && index.key === indexKey(); }
    function ensureIndex(){
      if (state.mode !== "doc") return false;
      var key = indexKey();
      if (index.ready && index.key === key) return true;
      if (indexBuilding !== key) buildIndex(key);
      return false;
    }
    function buildIndex(key){
      var text = $("#doc").textContent, re = /\S+/g, starts = [], pos = 0, t0 = Date.now(), slices = 0, gen = ++indexGen;
      indexBuilding = key;
      function step(){
        if (gen !== indexGen) return;            /* another document replaced this one meanwhile */
        var end = Math.min(text.length, pos + Params.INDEX_SLICE_CHARS), m;
        re.lastIndex = pos;
        while ((m = re.exec(text)) && m.index < end){ starts.push(m.index); pos = re.lastIndex; }
        slices++;
        if (!m){ done(); return; }               /* the regex ran out: done */
        pos = Math.max(pos, end);                /* a word straddling the boundary was pushed and is skipped by the next slice */
        setTimeout(step, 0);
      }
      function done(){
        index.key = key; index.ready = true; index.words = starts.length; index.slices = slices; index.ms = Date.now() - t0; index.starts = starts;
        indexBuilding = null;
      }
      step();
    }
    function idx(off){
      var s = index.starts, lo = 0, hi = s.length;
      while (lo < hi){ var mid = (lo + hi) >> 1; if (s[mid] <= off) lo = mid + 1; else hi = mid; }
      return lo;
    }
    function docWords(){ return indexReady() ? index.words : 0; }

    /* ---- PDF words per page, asked for once a page has been in the rested window ---- */
    var pageWords = {}, pageAsked = {}, pdfWordsDoc = null;
    function syncPdfWords(){
      if (pdfWordsDoc !== state.pdfDoc){ pdfWordsDoc = state.pdfDoc; pageWords = {}; pageAsked = {}; }
    }
    function askPdfWords(a, b){
      if (!state.pdfDoc) return;
      syncPdfWords();
      var doc = state.pdfDoc, total = doc.numPages;
      for (var i = Math.max(1, a); i <= Math.min(total, b); i++){
        if (pageAsked[i]) continue;
        pageAsked[i] = true;
        (function(n){
          PdfText.get(n).then(function(text){ if (pdfWordsDoc === doc) pageWords[n] = (String(text || "").match(/\S+/g) || []).length; });
        })(i);
      }
    }
    function requestPdfWords(){ if (R) askPdfWords(R.top, R.bottom); }
    function isSparse(i){ return pageWords[i] !== undefined && pageWords[i] < Params.SPARSE_WORDS; }
    /* the known words of pages a..b, or null when any of them has not answered yet */
    function knownWordsIn(a, b){
      var sum = 0;
      for (var i = a; i <= b; i++){ if (pageWords[i] === undefined) return null; sum += pageWords[i]; }
      return sum;
    }

    /* ---- the visible window: word numbers for text, page numbers for PDFs ---- */
    var measurements = 0, probeFallbacks = 0, lastMeasureMs = 0, lastV = 0, lastVKey = null;
    function caretAt(x, y){
      var r = null;
      if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
      else if (document.caretPositionFromPoint){ var pp = document.caretPositionFromPoint(x, y); if (pp){ r = document.createRange(); r.setStart(pp.offsetNode, pp.offset); } }
      if (!r) return null;
      var n = r.startContainer;
      if (n.nodeType !== 3 || !n.parentNode || !n.parentNode.closest || !n.parentNode.closest("#doc")) return null;
      return Anchor.offsetOf(n, r.startOffset);
    }
    function dockHeight(){ return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dockH")) || 0; }
    /* the last character on screen: topCharOffset's probing, upward from the foot of the view */
    function bottomCharOffset(){
      if (!document.caretRangeFromPoint && !document.caretPositionFromPoint) return null;
      var view = $("#doc").getBoundingClientRect(), autoBar = el("#autoBar");
      var autoH = autoBar && autoBar.classList.contains("on") ? autoBar.offsetHeight : 0;
      var y1 = Math.min(window.innerHeight, view.bottom) - dockHeight() - autoH - 6;
      var xs = [view.left + 10, view.left + view.width / 2, view.left + view.width - 10];
      for (var dy = 0; dy <= 60; dy += 12){
        for (var k = 0; k < xs.length; k++){
          var off = caretAt(xs[k], y1 - dy);
          if (off !== null) return off;
        }
      }
      return null;
    }
    /* Pages flow: the first character of page n, read off the column layout like pageTopOffset;
       -1 past the last page */
    function pageStartOffset(n){
      if (state.mode !== "doc" || state.flow !== "pages" || !state.stride) return null;
      var nodes = Anchor.textNodes();
      if (!nodes.length) return null;
      var left = $("#doc").getBoundingClientRect().left, want = n * (state.perPage || 1), r = document.createRange();
      function col(x){ return Math.floor((x - left + 0.5) / state.stride); }
      function endCol(i){ r.selectNodeContents(nodes[i]); var b = r.getBoundingClientRect(); return (b.width || b.height) ? col(b.right - 1) : -1; }
      var ni = firstAtLeast(0, nodes.length - 1, endCol, want);
      if (ni < 0) return -1;
      var node = nodes[ni];
      var ci = firstAtLeast(0, node.length - 1, function(i){
        r.setStart(node, i); r.setEnd(node, i + 1);
        var b = r.getBoundingClientRect();
        return (b.width || b.height) ? col((b.left + b.right) / 2) : -1;
      }, want);
      return Anchor.offsetOf(node, ci < 0 ? 0 : ci);
    }
    /* Pages flow: the page starts of the current layout, kept until the layout changes. Probing a
       column boundary in a long book costs a binary search over every text node, and a turn asks
       for two of them (this page's first word and the next page's): the one the turn moves onto
       was measured as the last window's end, so each turn costs one search instead of two */
    var pageOffs = { key: null, map: null };
    function pageStart(n){
      var key = layoutKeyNow() + "|" + (state.stride || 0);
      if (pageOffs.key !== key){ pageOffs.key = key; pageOffs.map = {}; }
      if (pageOffs.map[n] === undefined){
        var v = pageStartOffset(n);
        if (v === null) return null;
        pageOffs.map[n] = v;
      }
      return pageOffs.map[n];
    }
    /* when the foot of the view holds no text (an image, a heading gap): the last window, else a
       guess from the line height and the column width (Auto's formula) */
    function guessVisibleWords(){
      var head = Library.headerHeight(), px = Math.max(100, window.innerHeight - head - dockHeight());
      var colW = Math.min(state.width, $("#docView").clientWidth || state.width);
      var wordsPerLine = Math.max(4, colW / (state.size * 0.5) / 6);
      return Math.max(1, Math.round(px / (state.size * state.lh)) * Math.round(wordsPerLine));
    }
    function measure(){
      var t0 = Date.now(), N = null;
      measurements++;
      if (state.mode === "doc"){
        if (!indexReady()) return null;
        var topOff, bottomOff = null, top, bottom;
        if (state.flow === "pages"){
          topOff = pageStart(state.page);
          if (topOff === null) return null;
          bottomOff = pageStart(state.page + 1);
          if (bottomOff === null) return null;
          if (bottomOff < 0) bottomOff = Anchor.textLength();
          top = idx(topOff); bottom = idx(bottomOff - 1);
          N = { top: top, bottom: Math.max(top, bottom), page: state.page };
        } else {
          topOff = Library.topCharOffset();
          if (topOff === null) return null;
          top = idx(topOff);
          bottomOff = bottomCharOffset();
          if (bottomOff !== null) bottom = idx(bottomOff);
          else {
            probeFallbacks++;
            bottom = top + (lastV && lastVKey === layoutKeyNow() ? lastV : guessVisibleWords()) - 1;
          }
          N = { top: top, bottom: Math.max(top, bottom), page: null };
          if (bottomOff !== null){ lastV = N.bottom - N.top + 1; lastVKey = layoutKeyNow(); }
        }
      } else if (state.mode === "pdf" && state.pdfDoc){
        var total = state.pdfDoc.numPages;
        if (state.flow === "pages"){
          var p = Math.max(1, Math.min(total, state.pdfPageNum || 1));
          N = { top: p, bottom: Math.min(total, p + (state.perPage || 1) - 1), page: p };
        } else {
          var cur = Library.currentPdfPage(), limit = window.innerHeight - dockHeight() - 6, last = cur;
          var pages = $("#pdf").querySelectorAll(".pdf-page");
          for (var i = cur; i < pages.length; i++){          /* pages[i] is page i + 1 */
            if (pages[i].getBoundingClientRect().top < limit) last = +pages[i].dataset.page || (i + 1); else break;
          }
          N = { top: cur, bottom: Math.max(cur, last), page: cur };
        }
      }
      if (N) N.V = Math.max(1, N.bottom - N.top + 1);
      lastMeasureMs = Date.now() - t0;
      return N;
    }

    /* ---- sampling: the cheap position key on every poke, a settle after the last change ---- */
    var posKey = null, layoutKey = null, flowKey = null, moves = 0, firstMove = 0, lastChange = 0, pending = false, burstNav = false, relaid = false;
    var settleTimer = null, failSince = 0, unmeasurable = false, burstReveal = false, movedAt = 0;
    function posKeyNow(){
      if (state.mode === "doc") return state.flow === "pages" ? "p" + state.page : "y" + Math.round(window.scrollY);
      return state.flow === "pages" ? "n" + state.pdfPageNum : "y" + Math.round(window.scrollY);
    }
    /* what decides where the words fall: a change here renumbers the text under the reader (a new
       size, zen, a flow switch, a narrower window). The height of the window is part of it only in
       Pages flow — in Scroll flow a phone's toolbar sliding away moves no word at all */
    function flowKeyNow(){
      var b = document.body.classList;
      return window.innerWidth + "|" + (state.flow === "pages" ? window.innerHeight : 0) + "|" + (state.perPage || 1) + "|" + (state.totalPages || 1) + "|" +
        (state.mode === "doc" ? Anchor.textLength() : 0) + "|" + state.flow + "|" + state.size + "|" + state.lh + "|" + state.width + "|" + (state.margin || 0) + "|" + state.font + "|" +
        (b.contains("zen") ? 1 : 0) + (b.contains("immersive") ? 1 : 0) + (has("#tts", "on") ? 1 : 0) + (has("#autoBar", "on") ? 1 : 0) + (has("#sheet", "open") ? 1 : 0);
    }
    function layoutKeyNow(){ return window.innerHeight + "|" + flowKeyNow(); }
    function overlayOpen(){ return has("#side", "open") || has("#dictCard", "open") || has("#moreMenu", "open"); }
    function armSettle(){ clearTimeout(settleTimer); settleTimer = setTimeout(settle, Params.SETTLE_MS); }
    function poke(){
      if (!docOpen()) return;
      var now = Date.now(), pk = posKeyNow(), fk = flowKeyNow(), lk = window.innerHeight + "|" + fk;
      if (posKey === null){ posKey = pk; layoutKey = lk; flowKey = fk; return; }
      if (lk !== layoutKey){ if (fk !== flowKey) relaid = true; lastChange = now; pending = true; armSettle(); }
      if (pk !== posKey){
        posKey = pk;
        if (!moves){ firstMove = now; burstNav = now < navUntil || overlayOpen(); burstReveal = now < navUntil || has("#side", "open"); }
        /* one gesture, not one scroll event: the browser animates a key scroll over a dozen frames
           from a single press, so a change counts as a move only when an input arrived since the
           last one — or when nothing the reader just did can explain it (a script, a restore) */
        if (!moves || lastInput > movedAt || now - lastInput >= Params.INPUT_GUARD_MS) moves++;
        movedAt = now; lastChange = now; pending = true;
        armSettle();
      }
      layoutKey = lk; flowKey = fk;
    }

    /* ---- input: proof that the reader is there, and what cancels a tentative focus loss ---- */
    var lastInput = 0, inputs = [], lastInputKept = 0, lastPointerMove = 0;
    function noteInput(e){
      var now = Date.now();
      if (e.type === "pointermove"){ if (now - lastPointerMove < 250) return; lastPointerMove = now; }
      lastInput = now;
      if (now - lastInputKept >= 1000){ inputs.push(now); if (inputs.length > 64) inputs.shift(); lastInputKept = now; }
      if (tentOpen) cancelTentative(now);
    }
    /* an input inside (P.t, until − guard): the burst's own wheel or key is not evidence of presence during the dwell */
    function inputDuring(until){
      if (!P) return false;
      var lim = until - Params.INPUT_GUARD_MS, t0 = P.t;
      if (lastInput > t0 && lastInput < lim) return true;
      for (var i = inputs.length - 1; i >= 0; i--){ if (inputs[i] <= t0) break; if (inputs[i] < lim) return true; }
      return false;
    }

    /* ---- blockers: intervals of time that are not reading ---- */
    var blocks = [], softOpen = null, tentOpen = null, hard = false, blockerList = [], sideWasOpen = false, navUntil = 0;
    var blurAt = 0, hbFrac = null, hbPage = null, hbVoice = null, spokenTo = null;
    function softActive(){ return !!softOpen || !!tentOpen; }
    function softBlockers(){
      var list = [];
      if (has("#dictCard", "open")) list.push("dictCard");
      if (has("#side", "open")) list.push("side");
      var sheet = el("#sheet");
      if (sheet && sheet.classList.contains("open") && sheet.offsetHeight > 0) list.push("sheet");
      if (has("#moreMenu", "open")) list.push("menu");
      if (has("#pop", "open")) list.push("pop");
      if (document.visibilityState !== "visible") list.push("hidden");
      if (window.llTranslate && window.llTranslate.isOn && window.llTranslate.isOn()) list.push("translated");
      return list;
    }
    function hardBlockers(){
      var list = [];
      if (Speak.isActive()) list.push("speak");
      if (Auto.isOn() && !Auto.isPaused()) list.push("auto");
      return list;
    }
    /* blocked time inside (t0, t1]: the union of the intervals, clipped */
    function blockedIn(t0, t1){
      if (t1 <= t0) return 0;
      var list = [];
      blocks.forEach(function(x){ var a = Math.max(x.a, t0), b = Math.min(x.b === null ? t1 : x.b, t1); if (b > a) list.push([a, b]); });
      list.sort(function(p, q){ return p[0] - q[0]; });
      var total = 0, cur = null;
      list.forEach(function(iv){
        if (!cur || iv[0] > cur[1]){ if (cur) total += cur[1] - cur[0]; cur = iv; }
        else if (iv[1] > cur[1]) cur[1] = iv[1];
      });
      if (cur) total += cur[1] - cur[0];
      return total;
    }
    /* blocked intervals are dropped once they are behind the credit origin, but not at once:
       a run that reopens after an excursion looks back as far as the resume rule allows */
    function pruneBlocks(t){ blocks = blocks.filter(function(x){ return x.b === null || x.b > t - Params.RESUME_MS; }); }
    function cancelTentative(now){
      var i = blocks.indexOf(tentOpen);
      if (i >= 0) blocks.splice(i, 1);
      tentOpen = null;
      record("unblock", { t: now, reason: "input" });
      if (run && pending) armSettle();
    }
    function onFocus(now){
      blurAt = 0;
      if (!tentOpen) return;
      tentOpen.b = now; tentOpen = null;
      record("unblock", { t: now, reason: "focus" });
      if (run && pending) armSettle();
    }
    function updateBlockers(now, reason){
      /* a window that lost focus and saw no input for the grace: a tentative block, from when the grace ran out */
      if (blurAt && !tentOpen){
        var quiet = Math.max(blurAt, lastInput);
        if (now - quiet >= Params.BLUR_GRACE_MS){ tentOpen = { a: quiet + Params.BLUR_GRACE_MS, b: null }; blocks.push(tentOpen); record("block", { t: tentOpen.a, reason: "unfocused" }); }
      }
      var soft = softBlockers(), hardList = hardBlockers(), sideOpen = has("#side", "open");
      if (sideWasOpen && !sideOpen) navUntil = now + Params.NAV_WINDOW_MS;
      sideWasOpen = sideOpen;
      if (hardList.length && !hard){
        hard = true;
        if (run){ justClosed = closeRun("block", now); }
        hbFrac = clamp(readFrac(), 0, 1); hbPage = state.mode === "pdf" ? Library.currentPdfPage() : null;
        hbVoice = null; spokenTo = null;
        record("block", { t: now, reason: hardList.join("+") });
      } else if (!hardList.length && hard){
        hard = false; hbFrac = null; hbPage = null; hbVoice = null;
        moves = 0; firstMove = 0; pending = false;
        record("unblock", { t: now, reason: reason || "released" });
      }
      if (soft.length && !softOpen){
        softOpen = { a: now, b: null }; blocks.push(softOpen);
        /* a panel opened while a gesture was still settling: whatever it reveals belongs to the
           panel, not to the scroll that came before it */
        if (moves > 0){ burstNav = true; if (sideOpen) burstReveal = true; }
        record("block", { t: now, reason: soft.join("+") });
      } else if (!soft.length && softOpen){
        softOpen.b = now; softOpen = null;
        record("unblock", { t: now, reason: reason || "closed" });
        if (run && pending) armSettle();       /* the position changed under the overlay: settle now */
      }
      blockerList = (hard ? hardList : []).concat(soft, tentOpen ? ["unfocused"] : [], unmeasurable ? ["unmeasurable"] : [], state.opening ? ["opening"] : []);
    }
    /* where the voice has got to, as a word number: read-aloud units are character offsets into
       #doc, so the listener's progress is the unit's end, not the view's (the view may not move
       at all while a screenful is read out) */
    function voiceWord(){
      if (state.mode !== "doc" || !indexReady()) return null;
      var us = Speak.units(), i = Speak.index();
      if (!us || !us.length) return null;
      var u = us[Math.max(0, Math.min(us.length - 1, i))];
      return u && typeof u.start === "number" ? idx(u.start) : null;
    }
    /* while read-aloud or auto-scroll moves the page the pace learns nothing, but Stats still
       gets the words that went by: the voice's own advance while it speaks, a fraction of the
       document per heartbeat while auto-scroll runs */
    function hardCredit(now){
      if (state.mode === "doc"){
        if (Speak.isActive()){
          var vw = voiceWord();
          if (vw !== null){
            if (hbVoice === null) hbVoice = vw;
            var dvw = vw - hbVoice;
            hbVoice = Math.max(hbVoice, vw);
            spokenTo = spokenTo === null ? vw : Math.max(spokenTo, vw);
            hbFrac = clamp(readFrac(), 0, 1);
            if (Speak.isPlaying() && dvw > 0 && dvw < 400){ Stats.noteListened(dvw); sess.listened += dvw; }
            return;
          }
        }
        var frac = clamp(readFrac(), 0, 1), total = docWords() || Progress.docWords();
        var dw = hbFrac === null ? 0 : (frac - hbFrac) * total;
        hbFrac = frac;
        if (dw > 0 && dw < 400){
          if (Speak.isActive()){ if (Speak.isPlaying()){ Stats.noteListened(dw); sess.listened += dw; } }
          else Stats.noteWords(dw);
        }
      } else if (state.pdfDoc){
        var pg = Library.currentPdfPage(), dp = hbPage === null ? 0 : pg - hbPage;
        hbPage = pg;
        if (dp > 0 && dp < 3){
          if (Speak.isActive()){ if (Speak.isPlaying()){ var kw = knownWordsIn(pg - dp, pg - 1); if (kw){ Stats.noteListened(kw); sess.listened += kw; } } }
          else Stats.notePages(dp);
        }
      }
    }

    /* ---- the references, the live run and the transitions ---- */
    var P = null, R = null, run = null, lastClosed = null, justClosed = null, kind = "w", docKey = null, seenKey = null, bookId = null;
    var skimStreak = 0, lastKind = null, pausedFlag = false, fragments = 0, phase = "off", since = Date.now();
    var undo = null, lastBack = null, pendSkim = null, pendPages = null, docFrontier = 0;
    var sess = { words: 0, ms: 0, pages: 0, pms: 0, skimmed: 0, listened: 0 };
    var transitions = [];
    function record(k, o){
      o = o || {};
      var e = { t: o.t !== undefined ? o.t : Date.now(), kind: k };
      ["adv", "credit", "dt", "blocked", "V", "implied", "moves", "reason", "skimmed", "top"].forEach(function(f){ if (o[f] !== undefined) e[f] = f === "implied" ? round3(o[f]) : o[f]; });
      transitions.push(e);
      if (transitions.length > 50) transitions.shift();
    }
    function newRun(t0){
      var top = P ? P.top : 0;
      return { b: bookId, k: kind, t0: t0, w: 0, ms: 0, n: 0, p: 0, wordsKnown: true, held: [], slow: false, slowWpm: 0, buffered: 0,
               lastTop: null, V: R ? R.V : 1, frontier: top, low: top, qualified: false, mark: 0, fragCounted: false };
    }
    function qualifies(r){
      if (!r) return false;
      return r.k === "w" ? (r.ms >= Params.MIN_RUN_MS && r.w >= Params.MIN_RUN_WORDS && r.n >= Params.MIN_RUN_STEPS)
                         : (r.p >= Params.MIN_RUN_PAGES && r.ms >= Params.MIN_RUN_MS_PDF);
    }
    function setP(N){ P = { top: N.top, t: N.t }; R = N; pruneBlocks(N.t); }
    function dtOf(N){ return Math.max(0, N.t - P.t - blockedIn(P.t, N.t)); }
    function wAvail(){ return Math.max(1, R.bottom - P.top + 1); }
    function runRate(r){ return r && r.w > 0 && r.ms > 0 ? r.w / r.ms * 60000 : 0; }
    /* how long the words on screen could reasonably take: the floor for a caption, the cap for a
       break; input during the dwell and a run admitted as slow reading raise the cap. A run with a
       pace of its own is judged against that too — an odd page at half the run's speed is still
       reading (a small window with large type takes minutes), a dwell at a fifth of it is a break */
    function maxDwell(until){
      var cap = inputDuring(until) ? Params.HARD_PAUSE_INPUT_MS : Params.HARD_PAUSE_MS, W, rate;
      if (kind === "p"){
        for (var i = R.top; i <= R.bottom; i++) if (isSparse(i)) return cap;
        W = knownWordsIn(R.top, R.bottom);
        if (W === null) return cap;
      } else W = wAvail();
      var slowest = Params.MIN_WPM;
      if (run){
        rate = runRate(run);
        if (rate > 0) slowest = Math.min(slowest, rate / Params.DWELL_BAND);
        if (run.slowWpm > 0){ slowest = Math.min(slowest, run.slowWpm / Params.SLOW_BAND); cap = Math.max(cap, Params.SLOW_CAP_MS); }
      }
      return clamp(W / Math.max(1, slowest) * 60000, Params.MIN_DWELL_MS, cap);
    }
    /* the words a run has credited are one stretch, (low, frontier]: what is fresh in (from, to]
       is what falls outside it. A run that begins where the reader landed — a jump, an anchor, a
       slip corrected page by page — has an empty stretch, so everything it then reads is credited,
       and re-reading inside the stretch is still never credited twice */
    function fresh(r, from, to){
      if (to <= from) return 0;
      var a = Math.max(from, r.low), b = Math.min(to, r.frontier);
      return (to - from) - Math.max(0, b - a);
    }
    function advance(r, from, to){
      if (to <= from) return;
      /* a run that has credited nothing carries an empty stretch wherever it was anchored, and a
         credit that begins past the stretch (after a skim) starts a stretch of its own */
      if (r.low === r.frontier || from > r.frontier){ r.low = from; r.frontier = to; return; }
      r.low = Math.min(r.low, from); r.frontier = Math.max(r.frontier, to);
    }
    function statsNote(c){ if (c > 0){ if (kind === "w") Stats.noteWords(c); else Stats.notePages(c); } }
    function statsUnnote(c){ if (c > 0) Stats.unnote(kind === "w" ? "words" : "pages", c); }
    function creditStats(c){ if (run.qualified) statsNote(c); else run.buffered += c; }
    /* words scrolled past are held for a moment before they count as skimmed: a reader who peeks
       ahead and comes back skimmed nothing, and will be credited for reading them next */
    function noteSkimmed(n, origin, top, t){
      var prev = pendSkim, joins;
      pendSkim = null;
      if (!(n > 0)) return;
      Stats.noteSkimmed(n); sess.skimmed += n;
      /* a scroll-through in several flicks is one skim: taken back whole when it turns out to
         have been a peek, counted whole once the reader has read past it */
      joins = !!prev && prev.docKey === docKey && t - prev.t <= Params.RESUME_MS &&
              Math.abs(origin - prev.top) <= (kind === "w" ? Params.STILL_WORDS : 0);
      pendSkim = { n: joins ? prev.n + n : n, origin: joins ? prev.origin : origin, top: top, t: t, docKey: docKey };
    }
    function dropSkim(){
      if (!pendSkim) return;
      Stats.unnote("skimmed", pendSkim.n); sess.skimmed = Math.max(0, sess.skimmed - pendSkim.n);
      pendSkim = null;
    }
    /* a PDF flip-through's pages, once their text has arrived: counted as skimmed if the reader
       is still past them */
    function resolvePages(now){
      var p = pendPages, kw;
      if (p.doc !== state.pdfDoc || now - p.t > Params.RESUME_MS){ pendPages = null; return; }
      kw = knownWordsIn(p.a, p.b);
      if (kw === null) return;
      pendPages = null;
      if (kw > 0 && R && R.top >= p.top) noteSkimmed(kw, p.origin, p.top, p.t);
    }
    /* the reader moved on past the skipped words (they are skimmed), came back to where they were
       (nothing was skimmed), or the moment passed */
    function ageSkim(N){
      if (!pendSkim) return;
      var t = N ? N.t : Date.now();
      if (pendSkim.docKey !== docKey || t - pendSkim.t > Params.RESUME_MS){ pendSkim = null; return; }
      if (N && N.top <= pendSkim.origin + (kind === "w" ? Params.STILL_WORDS : 0)) dropSkim();
    }
    /* a qualifying run enters the estimates; they are refreshed on each credited step once it has
       (a recompute is a sort of a few dozen runs, at most once per gesture; LIVE_RECOMPUTE_WORDS
       above 0 would make it every so many words instead) */
    function afterCredit(){
      if (!run.qualified && qualifies(run)){
        run.qualified = true;
        if (run.buffered > 0) statsNote(run.buffered);
        run.buffered = 0; run.mark = run.w;
        if (lastClosed && lastClosed.run !== run) lastClosed.qualifiedAfter = true;
        dirty = true;
      } else if (run.qualified && (kind === "p" || run.w - run.mark >= Params.LIVE_RECOMPUTE_WORDS)){ run.mark = run.w; dirty = true; }
      scheduleSave();
    }
    /* pending holds dropped as pauses: the reader did end up past those words, so Stats has them */
    function dropHolds(r){
      if (!r.held.length) return;
      var front = r.frontier;
      r.held.forEach(function(x){ var c = Math.max(0, x.top - Math.max(x.prevTop, front)); front = Math.max(front, x.top); statsNote(c); });
      r.held = [];
    }
    function storeRun(r, t){
      var e = { b: r.b, t: t, w: Math.round(r.w), ms: Math.round(r.ms), p: r.p, n: r.n, k: r.k };
      store.runs.push(e);
      addAgg(store.books, e);
      if (lastClosed && lastClosed.run !== r) lastClosed.qualifiedAfter = true;
      retain(store, t);
      dirty = true;
      return e;
    }
    function unstoreRun(e){
      var i = store.runs.lastIndexOf(e);
      if (i < 0) return;
      store.runs.splice(i, 1);
      var b = store.books[e.b];
      if (b){ b.w = Math.max(0, b.w - e.w); b.ms = Math.max(0, b.ms - e.ms); b.p = Math.max(0, b.p - e.p); b.n = Math.max(0, b.n - 1); }
      dirty = true;
    }
    /* a run ends: kept as a sample when it lasted, otherwise a fragment; remembered for the resume rule */
    function closeRun(by, t){
      if (!run) return null;
      var r = run;
      dropHolds(r);
      var q = qualifies(r), entry = null;
      if (q) entry = storeRun(r, t);
      else if (r.n > 0 && !r.fragCounted){ fragments++; r.fragCounted = true; }
      var cand = { run: r, entry: entry, tClose: t, endTop: R ? R.top : r.lastTop, V: R ? R.V : (r.V || 1), by: by, docKey: docKey,
                   pt: P ? P.t : t, softBlock: !hard, qualifiedAfter: false };
      /* what is remembered is the run the reader might come back to: a fragment made during an
         excursion (a nudge at the far end) must not push it out */
      var live = lastClosed && lastClosed.docKey === docKey && !lastClosed.qualifiedAfter &&
                 (lastClosed.by === "jump" || lastClosed.by === "block") && t - lastClosed.tClose <= Params.RESUME_MS;
      if (q || !live) lastClosed = cand;
      run = null; pausedFlag = false; undo = null;
      dirty = true; scheduleSave();
      return r;
    }
    /* check and return: a jump (or a hard block) closed the run less than two minutes ago and the
       reader is back within a window of where it ended, with nothing read meanwhile */
    function tryResume(N, closed){
      var lc = lastClosed;
      if (!lc || lc.docKey !== docKey || (lc.by !== "jump" && lc.by !== "block") || lc.qualifiedAfter) return false;
      if (N.t - lc.tClose > Params.RESUME_MS) return false;
      if (Math.abs(N.top - lc.endTop) > (kind === "p" ? 1 : Params.RESUME_TOL * lc.V)) return false;
      if (lc.entry) unstoreRun(lc.entry);
      run = lc.run; run.held = []; run.V = N.V;
      /* the excursion is a hole, but the reading done before it is reading: the run keeps the
         credit origin it had when it closed, and the time away joins the blocked intervals */
      if (lc.pt && lc.pt <= lc.tClose && N.t > lc.tClose){ P = { top: N.top, t: lc.pt }; blocks.push({ a: lc.tClose, b: N.t }); }
      dropSkim(); undo = null;
      if (closed && closed !== run && !closed.fragCounted){ fragments++; closed.fragCounted = true; }
      lastClosed = null; dirty = true; scheduleSave();
      return true;
    }
    /* the last credited or skimmed transition, kept so that the one after it can be judged with
       it (a gesture in two parts) or take it back (a peek that came straight home) */
    function remember(o){ undo = o; }
    function undoLast(wide){
      var u = undo, last = transitions[transitions.length - 1];
      undo = null;
      if (!u || u.run !== run) return false;
      if (last && last.kind === u.kind && last.t === u.t) transitions.pop();   /* it never stood */
      run.w = u.w; run.ms = u.ms; run.n = u.n; run.p = u.p; run.low = u.low; run.frontier = u.frontier;
      run.lastTop = u.lastTop; run.V = u.V; run.wordsKnown = u.wordsKnown;
      if (kind === "w"){ sess.words -= u.c; sess.ms -= u.dt; } else { sess.pages -= u.c; sess.pms -= u.dt; }
      if (u.stats > 0){ if (run.buffered >= u.stats) run.buffered -= u.stats; else statsUnnote(u.stats); }
      dropSkim();
      docFrontier = u.docFrontier;
      P = { top: u.P0.top, t: u.P0.t };
      /* the rested window again — widened to the largest the reader has seen around it when the
         move being merged had already uncovered part of the screen */
      R = wide > u.R0.V ? { top: u.R0.top, bottom: u.R0.top + wide - 1, V: wide, page: u.R0.page } : u.R0;
      skimStreak = u.skimStreak; lastKind = u.lastKind;
      return true;
    }
    function snapFor(N, adv, dt, k, implied){
      return { kind: k, t: N.t, adv: adv, dt: dt, implied: implied, c: 0, stats: 0, run: run, P0: { top: P.top, t: P.t }, R0: R,
               w: run.w, ms: run.ms, n: run.n, p: run.p, low: run.low, frontier: run.frontier, lastTop: run.lastTop,
               V: run.V, wordsKnown: run.wordsKnown, docFrontier: docFrontier, skimStreak: skimStreak, lastKind: lastKind };
    }
    function credit(N, adv, dt, implied){
      var from = P.top, c = fresh(run, from, N.top), u = snapFor(N, adv, dt, "credit", implied);
      if (kind === "w"){ run.w += c; sess.words += c; sess.ms += dt; }
      else {
        run.p += c;
        var kw = knownWordsIn(N.top - c, N.top - 1);
        if (kw === null) run.wordsKnown = false; else run.w += kw;
        sess.pages += c; sess.pms += dt;
      }
      run.ms += dt; run.n += 1; advance(run, from, N.top); run.lastTop = N.top; run.V = N.V;
      docFrontier = Math.max(docFrontier, N.top);
      if (pendSkim && N.top > pendSkim.top) pendSkim = null;      /* read past it: skimmed it is */
      record("credit", { t: N.t, adv: adv, credit: c, dt: dt, blocked: blockedIn(P.t, N.t), V: R.V, implied: implied, moves: moves });
      setP(N); skimStreak = 0; pausedFlag = false; lastKind = "credit"; lastBack = null;
      u.c = c; u.stats = c; remember(u);
      creditStats(c); afterCredit();
    }
    function skim(N, adv, dt, implied){
      var from = P.top, c = fresh(run, from, N.top), u = snapFor(N, adv, dt, "skim", implied);
      var skipped = kind === "w" ? c : (knownWordsIn(N.top - c, N.top - 1) || 0);
      record("skim", { t: N.t, adv: adv, dt: dt, blocked: blockedIn(P.t, N.t), V: R.V, implied: implied, moves: moves, skimmed: skipped });
      var origin = P.top;
      setP(N); skimStreak++; pausedFlag = false; lastKind = "skim"; lastBack = null;
      remember(u);
      noteSkimmed(skipped, origin, N.top, N.t);
      if (skimStreak >= Params.SKIM_STREAK_CUT){
        closeRun("skim", N.t);
        run = newRun(N.t); skimStreak = 0;
      }
    }
    /* a move the reader did not make by reading — a search hit, a contents line, a note revealed
       while the panel was up: neither the words it passed nor the dwell before it are reading */
    function navStep(N, adv, dt){
      record("nav", { t: N.t, adv: adv, dt: dt, blocked: blockedIn(P.t, N.t), V: R.V, moves: moves, reason: "reveal" });
      setP(N); skimStreak = 0; pausedFlag = false; lastKind = "nav"; undo = null;
    }
    function pause(N, adv, dt, forward){
      var implied = dt > 0 ? adv / dt * 60000 : 0;
      if (forward && dt <= Params.HELD_MAX_MS && implied >= Params.FLOOR_WPM){
        run.held.push({ top: N.top, prevTop: P.top, adv: adv, dt: dt, implied: implied });
        record("held", { t: N.t, adv: adv, dt: dt, blocked: blockedIn(P.t, N.t), V: R.V, implied: implied, moves: moves });
        setP(N); skimStreak = 0; pausedFlag = true; lastKind = "held"; undo = null;
        maybeAdmit(N);
        return;
      }
      if (forward) statsNote(fresh(run, P.top, N.top));
      record("pause", { t: N.t, adv: adv, dt: dt, blocked: blockedIn(P.t, N.t), V: R.V, implied: implied, moves: moves });
      closeRun("pause", N.t);
      setP(N); run = newRun(N.t); skimStreak = 0; pausedFlag = false; lastKind = "pause";
    }
    /* three held dwells within a 2× band are slow reading, not three breaks: all of them are
       credited — unless the run has a pace of its own that they are nowhere near, in which case
       three interruptions in a row are still three interruptions */
    function maybeAdmit(N){
      var h = run.held;
      if (h.length < Params.HELD_N) return;
      var mx = -Infinity, mn = Infinity, rate = runRate(run);
      h.slice(-Params.HELD_N).forEach(function(x){ mx = Math.max(mx, x.implied); mn = Math.min(mn, x.implied); });
      if (mx / mn > Params.HELD_BAND || (rate > 0 && mn < rate / Params.HELD_BAND)){
        var old = h.shift();
        statsNote(fresh(run, old.prevTop, old.top));
        return;
      }
      var total = 0;
      h.forEach(function(x){
        var c = fresh(run, x.prevTop, x.top);
        if (kind === "w") run.w += c;
        else { run.p += c; var kw = knownWordsIn(x.top - c, x.top - 1); if (kw === null) run.wordsKnown = false; else run.w += kw; }
        run.ms += x.dt; run.n += 1; advance(run, x.prevTop, x.top); run.lastTop = x.top;
        docFrontier = Math.max(docFrontier, x.top);
        if (kind === "w"){ sess.words += c; sess.ms += x.dt; } else { sess.pages += c; sess.pms += x.dt; }
        total += c;
      });
      run.held = []; run.slow = true; run.slowWpm = mn; pausedFlag = false; lastKind = "credit";
      record("admit", { t: N.t, credit: total, V: R.V, moves: moves });
      creditStats(total); afterCredit();
    }
    /* holds pending when a plausible step arrives: they were breaks after all. The run closes at
       its credited state and a new one starts at the last held position */
    function reopenAtHeld(){
      var t = P.t;
      closeRun("pause", t);
      run = newRun(t);
    }
    /* a fast move a moment after a credited one is the rest of the same gesture: take that credit
       back and judge the two together from where the reader was before it (two half-screen flicks
       are one screen and reading; a flick out of a half-read window is a skim, not a 1 000-wpm read) */
    function mergeBack(N){
      var u = undo, tol, rate, lim, wide, partial;
      if (!u || u.kind !== "credit" || u.run !== run || N.t - u.t > Params.MERGE_MS) return false;
      wide = Math.max(u.R0.V, R.V, N.V);                /* the screen, as wide as it was seen around here */
      tol = kind === "w" ? jumpTol(wide) : 1;
      rate = u.ms > 0 && u.w > 0 ? u.w / u.ms * 60000 : 0;
      lim = kind === "w" ? (rate > 0 ? Math.max(Params.MERGE_BAND * rate, Params.MERGE_FLOOR_WPM) : Params.SKIM_WPM / 2) : Infinity;
      /* two motions that together uncover one screen are one gesture: the first uncovered only
         part of it and the pair still lands within a screen of where the reader was reading */
      partial = u.adv < Params.MERGE_PART * u.R0.V && N.top - u.P0.top - u.adv < Params.MERGE_PART * wide &&
                N.top - u.P0.top <= wide + tol;
      /* otherwise only a credit that was itself too fast for this run is taken back, once the
         move after it shows what it was part of (a flick out of a half-read window) */
      if (!partial && !(u.implied > lim)) return false;
      if (!undoLast(partial ? wide : 0)) return false;
      record("merge", { t: N.t, top: N.top, adv: N.top - u.P0.top, V: partial ? wide : u.R0.V });
      classify(N);
      return true;
    }
    /* the transition before this one stepped forward and this one comes straight back to where it
       started: a peek. Its seconds are a hole and whatever it skimmed was not skimmed */
    function peekReturn(N){
      var u = undo;
      if (!u || u.run !== run || (u.kind !== "credit" && u.kind !== "skim")) return false;
      if (u.adv <= 0 || N.t - u.t > Params.RESUME_MS) return false;
      return Math.abs(N.top - u.P0.top) <= (kind === "w" ? Params.STILL_WORDS : 0);
    }
    function step(N){
      var adv = N.top - P.top, dt = dtOf(N), cap = maxDwell(firstMove || N.t);
      if (burstReveal){ navStep(N, adv, dt); return; }
      if (dt > cap){ pause(N, adv, dt, true); return; }
      if (run.held.length) reopenAtHeld();
      /* a nudge back does not restart the window: the seconds before it count towards how fast
         the step after it was, or a screen finished right after a correction looks flicked past */
      var span = dt, implied, fast;
      if (lastBack && lastBack.run === run && N.t - lastBack.t <= Params.MERGE_MS) span += lastBack.dt;
      implied = span > 0 ? adv / span * 60000 : Infinity;
      if (kind === "w") fast = implied > Params.SKIM_WPM;
      else {
        var nonSparse = 0, known = 0;
        for (var i = P.top; i < N.top; i++){ if (isSparse(i)) continue; nonSparse++; if (pageWords[i] !== undefined) known += pageWords[i]; }
        fast = nonSparse > 0 && dt < Math.max(Params.MIN_PAGE_MS * nonSparse, known / Params.SKIM_WPM * 60000);
      }
      if (fast){
        if (kind === "w" && adv < Params.SKIM_MIN_FRACTION * R.V){
          record("defer", { t: N.t, adv: adv, dt: dt, blocked: blockedIn(P.t, N.t), V: R.V, implied: implied, moves: moves });
          R = N;                                   /* the nudge merges into the next transition */
          return;
        }
        if (mergeBack(N)) return;
        skim(N, adv, dt, implied); return;
      }
      credit(N, adv, dt, implied);
    }
    function backSmall(N){
      var adv = N.top - P.top, dt = dtOf(N), cap = maxDwell(firstMove || N.t), peek = peekReturn(N);
      if (burstReveal){ navStep(N, adv, dt); return; }
      if (!peek && dt > cap){ pause(N, adv, dt, false); return; }
      if (run.held.length) reopenAtHeld();
      var was = undo;
      if (peek) dropSkim();
      else { run.ms += dt; if (kind === "w") sess.ms += dt; else sess.pms += dt; }
      run.n += 1;
      lastBack = peek ? null : { t: N.t, dt: dt, run: run };
      record("back", { t: N.t, adv: adv, dt: peek ? 0 : dt, blocked: blockedIn(P.t, N.t), V: R.V, moves: moves, reason: peek ? "peek" : undefined });
      setP(N); skimStreak = 0; pausedFlag = false; lastKind = "back"; undo = null;
      /* a peek judged a skim dropped the dwell before it along with its words: the reader is back
         in that window, so those seconds are its own again and only the peek is a hole */
      if (peek && was.kind === "skim" && was.P0.t < N.t){ P.t = was.P0.t; blocks.push({ a: was.t, b: N.t }); }
      scheduleSave();
    }
    /* beyond the rested window: the run ends; a scroll-through skimmed the text in between, one
       move is navigation. Then the resume rule, or a fresh run where the reader landed */
    function jump(N, forward){
      var nav = !forward || burstNav || moves < Params.MOVES_SKIM, skipped = 0, from = 0;
      if (!nav && N.top <= docFrontier) nav = true;      /* back inside what was already read */
      if (!nav){
        from = Math.max(R.bottom + 1, docFrontier);
        if (kind === "w") skipped = Math.max(0, N.top - from);
        else {
          skipped = knownWordsIn(from, N.top - 1);
          /* the pages of a flip-through were never on screen at rest, so nobody asked for their
             text: ask now, and count them when the answer arrives (§resolvePages) */
          if (skipped === null){ skipped = 0; askPdfWords(from, N.top - 1); pendPages = { a: from, b: N.top - 1, origin: R.top, top: N.top, t: N.t, doc: state.pdfDoc }; }
        }
      }
      record("jump", { t: N.t, adv: N.top - P.top, dt: dtOf(N), blocked: blockedIn(P.t, N.t), V: R.V, moves: moves, reason: nav ? "navigation" : "skimmed", skimmed: skipped });
      var origin = R.top, closed = closeRun("jump", N.t);
      setP(N); skimStreak = 0; pausedFlag = false;
      if (skipped > 0) noteSkimmed(skipped, origin, N.top, N.t);
      if (tryResume(N, closed)){ record("resume", { t: N.t, V: N.V, top: N.top }); lastKind = nav ? "resume" : "skimjump"; }
      else { run = newRun(N.t); lastKind = nav ? "jump" : "skimjump"; }
    }
    function classify(N){
      ageSkim(N);
      var tol = kind === "w" ? jumpTol(R.V) : 1, reach = Math.max(R.V, N.V);
      /* stillness, direction and distance are judged from the credit origin, not from the last
         window: a reader whose every swipe moves four words would otherwise never leave "still",
         and a nudge back after a deferred nudge forward is still forward of where reading began */
      var still = kind === "w" ? Math.abs(N.top - P.top) <= Params.STILL_WORDS : N.top === P.top;
      /* a relayout (zen, a resize, a flow switch, a text size) can put the page's first word later
         than the old top, even changing the page number: the reader did not move, so nothing is
         skimmed; the origin stays and the next real step credits the words from there. A move of
         more than a fraction of the window is the reader scrolling, relayout or not */
      if (still || (relaid && N.top > P.top && N.top <= R.bottom + tol)){
        record("still", { t: N.t, adv: N.top - P.top, blocked: blockedIn(P.t, N.t), V: N.V, moves: moves, reason: still ? undefined : "relayout" });
        R = N; return;
      }
      /* forward: the new top was on screen at rest, or the text between was never seen; backward:
         the old top is on screen now (a page back, re-reading), or it is a jump */
      if (N.top > P.top){
        if (N.top > R.top + reach + tol) jump(N, true); else step(N);
      } else {
        if (P.top - N.top > (kind === "w" ? reach + tol : reach)) jump(N, false); else backSmall(N);
      }
    }
    function settle(){
      clearTimeout(settleTimer); settleTimer = null;
      var now = Date.now();
      if (!docOpen()) return;
      if (!run){ if (!hard && !softActive()) tryAnchor(now, false); refreshPhase(now); return; }
      if (hard){ moves = 0; firstMove = 0; pending = false; relaid = false; return; }
      if (softActive()) return;                    /* evaluated when the overlay goes */
      if (!pending && !unmeasurable) return;
      var N = measure();
      if (!N){
        if (!failSince) failSince = now;
        if (!unmeasurable && now - failSince >= Params.UNMEASURABLE_MS){ unmeasurable = true; moves = 0; firstMove = 0; pending = false; record("block", { t: now, reason: "unmeasurable" }); }
        refreshPhase(now); return;
      }
      if (unmeasurable) record("unblock", { t: now, reason: "measurable" });
      failSince = 0; unmeasurable = false;
      N.t = lastChange || now;
      pending = false;
      classify(N);
      moves = 0; firstMove = 0; burstNav = false; burstReveal = false; relaid = false;
      refreshPhase(now);
    }

    /* ---- anchoring: the first rested window of a document, or after a hard blocker ---- */
    function tryAnchor(now, force){
      if (!docOpen() || state.opening) return false;
      var id = Library.currentId();
      if (!id || Library._debug().pending) return false;
      if (state.mode === "doc"){ if (!ensureIndex()) return false; }
      else if (!state.pdfDoc) return false;
      if (hard || softActive()) return false;
      if (!force && lastChange && now - lastChange < Params.SETTLE_MS) return false;
      var N = measure();
      if (!N) return false;
      N.t = now;
      kind = state.mode === "pdf" ? "p" : "w"; docKey = docKeyNow(); bookId = id;
      var closed = justClosed, lc = lastClosed;
      justClosed = null;
      /* landing again on the window a long soft block interrupted (a hidden tab, a panel left
         open): the minutes spent on this page before it are still this page's reading, and the
         block itself is already excluded, so the run keeps the old credit origin's time */
      var onOldPage = !!lc && lc.docKey === docKey && lc.by === "block" && lc.softBlock && lc.endTop !== null &&
                      Math.abs(N.top - lc.endTop) <= (kind === "w" ? Params.STILL_WORDS : 0);
      setP(N); skimStreak = 0; pausedFlag = false; moves = 0; firstMove = 0; pending = false; relaid = false; burstNav = false; burstReveal = false; unmeasurable = false; failSince = 0;
      ageSkim(null); undo = null;
      if (tryResume(N, closed)){ record("resume", { t: now, V: N.V, top: N.top }); lastKind = "resume"; }
      else {
        run = newRun(now);
        if (onOldPage && lc.pt < now) P = { top: N.top, t: lc.pt };
        record("anchor", { t: now, V: N.V, top: N.top }); lastKind = null;
      }
      /* read-aloud carried the reader past the window's top: those words were listened to, not
         read, so the run starts owing nothing for them */
      if (spokenTo !== null){
        if (run && spokenTo > run.frontier && spokenTo <= N.bottom + (kind === "w" ? jumpTol(N.V) : 0)){
          run.frontier = spokenTo; run.low = 0; P.t = now;
        }
        spokenTo = null;
      }
      refreshPhase(now);
      return true;
    }
    /* the document under the detector is gone or replaced: close what was open, start over */
    function leaveDocument(now){
      if (run) closeRun("doc", now);
      lastClosed = null; justClosed = null;
      P = null; R = null; posKey = null; layoutKey = null; moves = 0; firstMove = 0; pending = false; lastChange = 0; burstNav = false; burstReveal = false; relaid = false;
      skimStreak = 0; lastKind = null; pausedFlag = false; unmeasurable = false; failSince = 0;
      undo = null; lastBack = null; pendSkim = null; pendPages = null; docFrontier = 0; spokenTo = null; hbVoice = null;
      clearTimeout(settleTimer); settleTimer = null;
      blocks = blocks.filter(function(x){ return x.b === null; });
      docKey = null; bookId = null; hbFrac = null; hbPage = null;
      save();
    }
    function goOff(now){ leaveDocument(now); seenKey = null; refreshPhase(now); }
    function onFileOpened(now){ leaveDocument(now); seenKey = null; refreshPhase(now); }

    function computePhase(){
      if (!docOpen()) return "off";
      if (blockerList.length || unmeasurable) return "blocked";
      if (!run) return "anchoring";
      if (pending && moves) return "moving";
      if (pausedFlag || run.held.length) return "paused";
      if (lastKind === "skim" || lastKind === "skimjump") return "skimming";
      return "reading";
    }
    function refreshPhase(now){ var p = computePhase(); if (p !== phase){ phase = p; since = now; } }

    /* ---- the heartbeat: one cheap check a second, no layout work at rest ---- */
    var observed = {};
    function attachObservers(){
      if (!window.MutationObserver) return;
      ["#dictCard", "#side", "#sheet", "#moreMenu", "#pop", "#tts", "#autoBar"].forEach(function(sel){
        if (observed[sel]) return;
        var e = $(sel);
        if (!e) return;
        observed[sel] = new MutationObserver(function(){ edge("class " + sel); });
        observed[sel].observe(e, { attributes: true, attributeFilter: ["class"] });
      });
    }
    function edge(reason){
      var now = Date.now();
      if (!docOpen()){ if (phase !== "off") goOff(now); return; }
      poke();
      updateBlockers(now, reason);
      refreshPhase(now);
    }
    function heartbeat(){
      var now = Date.now();
      if (!docOpen()){ if (phase !== "off") goOff(now); return; }
      attachObservers();
      var dk = docKeyNow();
      if (seenKey !== dk){ if (seenKey !== null) leaveDocument(now); seenKey = dk; }
      poke();
      updateBlockers(now, "heartbeat");
      if (softOpen && run && now - softOpen.a >= Params.BLOCK_MAX_MS){ justClosed = closeRun("block", now); record("block", { t: now, reason: "long" }); }
      ageSkim(null);
      if (pendPages) resolvePages(now);
      if (hard) hardCredit(now);
      if (run && !hard && !softActive()){
        if ((pending || unmeasurable) && now - lastChange >= Params.SETTLE_MS) settle();
        if (run && P && now - P.t - blockedIn(P.t, now) > maxDwell(now)) pausedFlag = true;
      }
      if (!run && !hard && !softActive()) tryAnchor(now, false);
      if (state.mode === "pdf") requestPdfWords();
      refreshPhase(now);
    }

    /* ---- the estimator: a weighted median over recent runs, a fading prior, per book ---- */
    var store = { runs: [], books: {} }, est = null, dirty = true, bookCache = {}, saveTimer = null;
    function decay(t, now){ return Math.pow(0.5, Math.max(0, now - t) / DAY / Params.HALF_LIFE_DAYS); }
    function rateOf(r){ return (r.k === "w" ? r.w : r.p) / r.ms * 60000; }
    function weightOf(r, now){ return (r.k === "w" ? Math.min(r.w, Params.RUN_WEIGHT_CAP) : Math.min(r.p, Params.RUN_WEIGHT_CAP_P)) * (r.live ? 1 : decay(r.t, now)); }
    /* piecewise-linear interpolation of the rates over their cumulative weights, at q */
    function quantile(items, q){
      var W = 0, acc = 0, pts;
      items.forEach(function(x){ W += x.u; });
      if (!W) return null;
      pts = items.map(function(x){ var c = (acc + x.u / 2) / W; acc += x.u; return { c: c, r: x.r }; });
      if (q <= pts[0].c) return pts[0].r;
      if (q >= pts[pts.length - 1].c) return pts[pts.length - 1].r;
      for (var i = 1; i < pts.length; i++){
        if (q <= pts[i].c){ var a = pts[i - 1], b = pts[i]; return b.c === a.c ? b.r : a.r + (b.r - a.r) * (q - a.c) / (b.c - a.c); }
      }
      return pts[pts.length - 1].r;
    }
    function aggregate(runs, now){
      var items = [];
      runs.forEach(function(r){ var rate = rateOf(r), u = weightOf(r, now); if (r.ms > 0 && isFinite(rate) && u > 0) items.push({ r: rate, u: u }); });
      items.sort(function(a, b){ return a.r - b.r; });
      var W = 0; items.forEach(function(x){ W += x.u; });
      var m = quantile(items, 0.5), s = null;
      if (items.length >= 3 && m) s = (quantile(items, 0.75) - quantile(items, 0.25)) / m;
      return { m: m, W: W, n: items.length, s: s };
    }
    function liveEntry(){
      return run && run.qualified && qualifies(run) ? { b: run.b, t: Date.now(), w: run.w, ms: run.ms, p: run.p, n: run.n, k: run.k, live: true } : null;
    }
    function allRuns(){ var list = store.runs.slice(), l = liveEntry(); if (l) list.push(l); return list; }
    function confidenceOf(runs, w, p, now, own){
      var n = runs.length, M = 0, ms = 0, books = 0;
      runs.forEach(function(r){ M += r.ms * (r.live ? 1 : decay(r.t, now)) / 60000; });
      var A = 1 - Math.exp(-M / Params.CONF_M0), agg = w.n >= p.n ? w : p;
      var C = agg.n >= 3 && agg.s !== null ? clamp(1 - agg.s / Params.CONF_SPREAD0, 0.3, 1) : 0.7;
      var cap = n === 0 ? 0 : n === 1 ? 0.35 : n === 2 ? 0.6 : 1;
      var value = Math.min(cap, A * (0.5 + 0.5 * C));
      var label = n === 0 ? "not measured yet" : value < 0.2 ? "a first guess" : value < 0.5 ? "an early estimate" : value < 0.8 ? "measured" : "well measured";
      if (own){ ms = own.ms; books = own.books; }
      else {
        var l = liveEntry();
        Object.keys(store.books).forEach(function(id){ var b = store.books[id]; ms += b.ms; if (b.n >= 1) books++; });
        if (l){ ms += l.ms; if (!store.books[l.b] || store.books[l.b].n < 1) books++; }
      }
      /* label stays English (it is compared, and the tests read it); text is what the stats panel shows */
      var text = n ? _tn(books, "measured over {time} of reading in {n} book", "measured over {time} of reading in {n} books", { time: dur(ms) }) + (label !== "measured" ? " · " + _t(label) : "")
                   : _t("not measured yet, using a typical {n} words per minute", { n: Params.PRIOR_WPM });
      return { value: value, label: label, minutes: mins(ms), books: books, runs: n, text: text };
    }
    function compute(){
      var now = Date.now(), runs = allRuns();
      var w = aggregate(runs.filter(function(r){ return r.k === "w"; }), now), p = aggregate(runs.filter(function(r){ return r.k === "p"; }), now);
      var G = (Params.PRIOR_W * Params.PRIOR_WPM + w.W * (w.m || 0)) / (Params.PRIOR_W + w.W);
      var Gp = (Params.PRIOR_P * Params.PRIOR_PPM + p.W * (p.m || 0)) / (Params.PRIOR_P + p.W);
      est = { G: G, Gp: Gp, runs: runs, conf: confidenceOf(runs, w, p, now, null), at: now };
      bookCache = {}; dirty = false;
      /* the old keys are still written for compatibility; nothing reads them back */
      if (runs.length){ Store.set("ll_wpm", String(Math.round(G))); Store.set("ll_ppm", Gp.toFixed(2)); }
      else { Store.remove("ll_wpm"); Store.remove("ll_ppm"); }
    }
    function ensure(){ if (dirty || !est || Date.now() - est.at > 3600000) compute(); }
    function bookEst(id){
      ensure();
      if (bookCache[id]) return bookCache[id];
      var now = est.at, runs = est.runs.filter(function(r){ return r.b === id; });
      var w = aggregate(runs.filter(function(r){ return r.k === "w"; }), now), p = aggregate(runs.filter(function(r){ return r.k === "p"; }), now);
      var B = w.W ? (Params.PRIOR_W_BOOK * est.G + w.W * w.m) / (Params.PRIOR_W_BOOK + w.W) : est.G;
      var Bp = p.W ? (Params.PRIOR_P_BOOK * est.Gp + p.W * p.m) / (Params.PRIOR_P_BOOK + p.W) : est.Gp;
      var agg = store.books[id], l = liveEntry(), ms = (agg ? agg.ms : 0) + (l && l.b === id ? l.ms : 0);
      bookCache[id] = { B: B, Bp: Bp, runs: runs.length, ms: ms, conf: confidenceOf(runs, w, p, now, { ms: ms, books: runs.length ? 1 : 0 }) };
      return bookCache[id];
    }
    function wpm(){ ensure(); return est.G; }
    function ppm(){ ensure(); return est.Gp; }
    function docWpm(){ var id = Library.currentId(); return id && docOpen() ? bookEst(id).B : wpm(); }
    function docPpm(){ var id = Library.currentId(); return id && docOpen() ? bookEst(id).Bp : ppm(); }
    function confidence(){ ensure(); return est.conf; }
    function docConfidence(){ var id = Library.currentId(); return id && docOpen() ? bookEst(id).conf : confidence(); }

    /* ---- persistence: the retained runs, the all-time totals per book, the live run ---- */
    function validRun(r){
      if (!r || typeof r !== "object" || typeof r.b !== "string" || !r.b || (r.k !== "w" && r.k !== "p")) return null;
      var v = { b: r.b, t: num(r.t), w: num(r.w), ms: num(r.ms), p: num(r.p), n: Math.round(num(r.n)), k: r.k };
      if (!v.ms || (v.k === "w" ? !v.w : !v.p)) return null;
      return v;
    }
    function addAgg(books, e){
      var b = books[e.b] || (books[e.b] = { w: 0, ms: 0, p: 0, n: 0, t: 0 });
      b.w += e.w; b.ms += e.ms; b.p += e.p; b.n += 1; b.t = Math.max(b.t, e.t);
    }
    function retain(s, now){
      var runs = s.runs.filter(function(r){ return now - r.t <= Params.MAX_AGE_DAYS * DAY; }), perBook = {}, n;
      runs.sort(function(a, b){ return a.t - b.t; });
      n = runs.length;
      for (var i = n - 1; i >= 0; i--){
        var r = runs[i], pb = perBook[r.b] = (perBook[r.b] || 0) + 1;
        r.keep = (n - 1 - i) < Params.KEEP_RUNS || pb <= Params.KEEP_PER_BOOK;
      }
      runs = runs.filter(function(r){ var k = r.keep; delete r.keep; return k; });
      while (runs.length > Params.MAX_ENTRIES) runs.shift();
      s.runs = runs;
      Object.keys(s.books).forEach(function(id){
        var b = s.books[id];
        if (!runs.some(function(r){ return r.b === id; }) && now - (b.t || 0) > Params.MAX_AGE_DAYS * DAY) delete s.books[id];
      });
    }
    function load(){
      var o = null, out = { runs: [], books: {} }, now = Date.now();
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      if (o && typeof o === "object"){
        (Array.isArray(o.runs) ? o.runs : []).forEach(function(r){ var v = validRun(r); if (v) out.runs.push(v); });
        Object.keys(o.books && typeof o.books === "object" ? o.books : {}).forEach(function(id){
          var b = o.books[id];
          if (b && typeof b === "object") out.books[id] = { w: num(b.w), ms: num(b.ms), p: num(b.p), n: Math.round(num(b.n)), t: num(b.t) };
        });
        /* a run that was live when the page went away: closed now, kept if it lasted */
        if (o.live && typeof o.live === "object"){
          var l = validRun({ b: o.live.b, k: o.live.k, t: num(o.live.t0) + num(o.live.ms), w: o.live.w, ms: o.live.ms, p: o.live.p, n: o.live.n });
          if (l && qualifies(l)){ out.runs.push(l); addAgg(out.books, l); }
        }
      }
      out.runs.sort(function(a, b){ return a.t - b.t; });
      /* a seeded or older store without totals: rebuilt from what is retained */
      out.runs.forEach(function(r){ if (!out.books[r.b]) out.runs.filter(function(x){ return x.b === r.b; }).forEach(function(x){ addAgg(out.books, x); }); });
      retain(out, now);
      return out;
    }
    function liveSnapshot(){
      return run && run.n > 0 ? { b: run.b, k: run.k, t0: run.t0, w: Math.round(run.w), ms: Math.round(run.ms), p: run.p, n: run.n, wordsKnown: run.wordsKnown } : null;
    }
    function scheduleSave(){ if (!saveTimer) saveTimer = setTimeout(save, Params.SAVE_DEBOUNCE_MS); }
    function save(){
      clearTimeout(saveTimer); saveTimer = null;
      var live = liveSnapshot();
      if (!store.runs.length && !Object.keys(store.books).length && !live){ Store.remove(KEY); return; }
      Store.set(KEY, JSON.stringify({ v: 1, runs: store.runs, books: store.books, live: live }));
    }
    function reset(){
      var now = Date.now();
      run = null; store = { runs: [], books: {} }; lastClosed = null; justClosed = null;
      P = null; R = null; moves = 0; firstMove = 0; pending = false; relaid = false; lastChange = 0; posKey = null; skimStreak = 0; lastKind = null; pausedFlag = false;
      undo = null; lastBack = null; pendSkim = null; pendPages = null; docFrontier = 0; spokenTo = null; hbVoice = null; burstReveal = false;
      sess = { words: 0, ms: 0, pages: 0, pms: 0, skimmed: 0, listened: 0 };
      blocks = blocks.filter(function(x){ return x.b === null; });
      clearTimeout(saveTimer); saveTimer = null;
      Store.remove(KEY); Store.remove("ll_wpm"); Store.remove("ll_ppm");
      dirty = true; bookCache = {};
      refreshPhase(now);
    }

    /* ---- what the rest of the app and the tests read ---- */
    function runsOut(){ var out = store.runs.map(function(r){ return Object.assign({}, r); }), l = liveEntry(); if (l) out.push(l); return out; }
    function stateOut(){
      return {
        phase: phase, since: since, blockers: blockerList.slice(),
        window: R ? { top: R.top, bottom: R.bottom, V: R.V, page: R.page } : null,
        run: run ? { words: run.w, ms: run.ms, n: run.n, pages: run.p, qualifies: qualifies(run), held: run.held.length, slow: run.slow, buffered: run.buffered } : null,
        skimStreak: skimStreak, docKey: docKey, moves: moves, blockedMs: P ? blockedIn(P.t, Date.now()) : 0
      };
    }
    function summary(){
      ensure();
      var id = Library.currentId(), doc = null;
      if (id && docOpen()){ var be = bookEst(id); if (be.runs > 0) doc = { id: id, wpm: be.B, ppm: be.Bp, ms: be.ms, runs: be.runs }; }
      return { wpm: est.G, ppm: est.Gp, docWpm: docWpm(), docPpm: docPpm(), confidence: est.conf, doc: doc, runs: store.runs.length,
               live: run ? { words: run.w, ms: run.ms, n: run.n, pages: run.p, qualifies: qualifies(run) } : null,
               words: sess.words, ms: sess.ms, pages: sess.pages, pms: sess.pms, skimmed: sess.skimmed, listened: sess.listened };
    }
    /* an edge from elsewhere in the app (a mode change, a bar): re-read the blockers now */
    function noteBlock(reason){ edge(reason || "edge"); }

    /* ---- wiring ---- */
    store = load();
    ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach(function(ev){ window.addEventListener(ev, noteInput, { passive: true, capture: true }); });
    document.addEventListener("selectionchange", noteInput, { passive: true });
    document.addEventListener("visibilitychange", function(){ edge("visibility"); if (document.visibilityState === "hidden") save(); });
    window.addEventListener("pagehide", save);
    window.addEventListener("blur", function(e){ if (e.target !== window) return; blurAt = Date.now(); });
    window.addEventListener("focus", function(e){ if (e.target !== window) return; onFocus(Date.now()); edge("focus"); });
    document.addEventListener("ll:fileopened", function(){ onFileOpened(Date.now()); });
    setTimeout(attachObservers, 0);
    setInterval(heartbeat, Params.HEARTBEAT_MS);

    var debug = {
      params: Params,
      setParams: function(o){ Object.keys(o || {}).forEach(function(k){ if (k in Params) Params[k] = o[k]; }); dirty = true; },
      transitions: function(){ return transitions.slice(); },
      poke: poke, settle: settle, heartbeat: heartbeat, measure: measure,
      anchorNow: function(){ var now = Date.now(); if (run){ run = null; } P = null; R = null; lastChange = 0; return tryAnchor(now, true); },
      live: function(){ return run; }, lastClosed: function(){ return lastClosed; }, store: function(){ return store; },
      blockers: function(){ return blockerList.slice(); }, pageWords: function(){ return Object.assign({}, pageWords); },
      pendingSkim: function(){ return pendSkim && Object.assign({}, pendSkim); }, readFrontier: function(){ return docFrontier; },
      origin: function(){ return P && { top: P.top, t: P.t }; },
      index: index
    };
    Object.defineProperty(debug, "fragments", { get: function(){ return fragments; } });
    Object.defineProperty(debug, "lastMeasureMs", { get: function(){ return lastMeasureMs; } });
    Object.defineProperty(debug, "measurements", { get: function(){ return measurements; } });
    Object.defineProperty(debug, "probeFallbacks", { get: function(){ return probeFallbacks; } });
    window.llPace = { state: stateOut, runs: runsOut, wpm: wpm, ppm: ppm, docWpm: docWpm, docPpm: docPpm, confidence: confidence, docConfidence: docConfidence,
                      summary: summary, reset: reset, _debug: debug };
    return { poke: poke, wpm: wpm, ppm: ppm, docWpm: docWpm, docPpm: docPpm, confidence: confidence, docConfidence: docConfidence, summary: summary,
             state: stateOut, runs: runsOut, docWords: docWords, reset: reset, flush: save, noteBlock: noteBlock };
  })();

  /* ============================================================
     Reading progress + time left, from your measured reading speed
     ============================================================ */
  var Progress = (function(){
    var el = $("#progressInfo"), hideTimer = null, trailTimer = null;
    var docWords = 0, docLen = 0, lastTick = 0, docKey = null;
    function countWords(){
      var t = $("#doc").textContent;
      docLen = t.length;
      docWords = (t.match(/\S+/g) || []).length;
    }
    /* the words of the open text: the pace detector's index once it is built, a plain count until then */
    function words(){
      var n = Pace.docWords();
      if (n) return n;
      if (!docWords || docLen !== Anchor.textLength()) countWords();
      return docWords;
    }
    /* the speed comes from the pace detector: this book's measured pace, blended toward the
       global estimate (and the prior) while the book has little of its own */
    function currentWpm(){ return Pace.docWpm(); }
    function currentPpm(){ return Pace.docPpm(); }
    function fmt(min){
      if (!isFinite(min) || min < 0) return "";
      if (min < 1) return _t("under a minute left");
      if (min < 60) return _t("{n} min left", { n: Math.round(min) });
      var h = Math.floor(min / 60), m = Math.round(min % 60);
      return m ? _t("{h} h {m} min left", { h: h, m: m }) : _t("{h} h left", { h: h });
    }
    function show(text){
      /* in Pages flow the page-turn bar carries the readout; the pill is for Scroll flow, and
         for a document (the start screen's scroll has nothing to report) */
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      if (pagedActive()){ el.classList.remove("on"); return; }
      el.textContent = text; el.classList.add("on");
      /* at the foot of the screen, never over the line being read; it fades 1.2 s after the scrolling stops */
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function(){ el.classList.remove("on"); }, 1200);
    }
    /* every scroll and page turn: the pace detector sees the movement first (before the throttle,
       so no gesture's time is lost), then the readout is drawn */
    function tick(){
      Pace.poke("tick");
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      if (Journal) Journal.poke();     /* a scroll or a page turn may have reached the end of the book */
      var now = Date.now();
      if (now - lastTick < 250){
        /* a fling is a burst of scroll events: draw once more when the throttle is up, so the
           readout is never left at the position the burst started from */
        clearTimeout(trailTimer);
        trailTimer = setTimeout(tick, 250 - (now - lastTick));
        return;
      }
      clearTimeout(trailTimer); trailTimer = null;
      lastTick = now;
      var key = (Library.currentId() || "") + ":" + state.mode;
      if (key !== docKey){ docKey = key; docWords = 0; docLen = 0; }
      var frac = Math.max(0, Math.min(1, readFrac()));
      var text;
      if (state.mode === "doc"){
        var n = words();
        var left = (1 - frac) * n / currentWpm();
        text = n > 80 ? _t("{pct}% \u00B7 {left}", { pct: Math.round(frac * 100), left: fmt(left) }) : Math.round(frac * 100) + "%";
      } else {
        var pages = state.pdfDoc ? state.pdfDoc.numPages : 1, page = Library.currentPdfPage();
        var leftP = (pages - page) / currentPpm();
        text = pages > 3 ? _t("p. {page} / {pages} \u00B7 {left}", { page: page, pages: pages, left: fmt(leftP) }) : _t("p. {page} / {pages}", { page: page, pages: pages });
      }
      show(text);
    }
    /* the time left from here, worded for the page-turn bar ("18 min left"), or "" when the
       document is too short to say */
    function left(){
      if (state.mode === "doc"){
        var n = words();
        return n > 80 ? fmt((1 - Math.max(0, Math.min(1, readFrac()))) * n / currentWpm()) : "";
      }
      if (state.mode === "pdf" && state.pdfDoc){
        var pages = state.pdfDoc.numPages;
        return pages > 3 ? fmt((pages - Library.currentPdfPage()) / currentPpm()) : "";
      }
      return "";
    }
    return { tick: tick, wpm: currentWpm, ppm: currentPpm, left: left, sample: function(){ return Pace.summary(); }, docWords: words };
  })();

  /* ============================================================
     Reading stats — minutes, words and pages per day, a daily goal and
     the streak of days it was kept. All of it stays on this device.
     ============================================================ */
  var Stats = (function(){
    var KEY = "ll_stats", GOALS = [5, 10, 15, 20, 30, 45, 60], MAX_DAYS = 400, TICK = 15000, IDLE = 3 * 60000;
    var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var widget = $("#streak");
    var data = load(), dirty = false, saveTimer = null, lastActive = 0, docKey = null, widgetHtml = "";

    /* ---- days are keyed by the local date, built by hand (toISOString would shift them to UTC) ---- */
    function pad(n){ return (n < 10 ? "0" : "") + n; }
    function keyOf(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function dateOf(key){ var p = key.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function addDays(key, n){ var d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); }
    function todayKey(){ return keyOf(new Date()); }

    /* ---- storage: one JSON record, saved at most every 5 s and when the page goes away ---- */
    function fresh(){ return { v: 1, goal: 10, goals: { booksPerYear: 12, pagesPerYear: 0 }, days: {}, books: {}, best: { streak: 0, day: "" }, notified: "" }; }
    function num(x){ return typeof x === "number" && isFinite(x) && x > 0 ? x : 0; }
    function clamp(x, hi){ return Math.max(0, Math.min(hi, Math.round(num(x)))); }
    function load(){
      var o = null, out = fresh();
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      if (!o || typeof o !== "object") return out;
      if (GOALS.indexOf(o.goal) >= 0) out.goal = o.goal;
      /* yearly goals: 0 turns one off, so an explicit record replaces the suggestion whole */
      if (o.goals && typeof o.goals === "object") out.goals = { booksPerYear: clamp(o.goals.booksPerYear, 999), pagesPerYear: clamp(o.goals.pagesPerYear, 99999) };
      Object.keys(o.days && typeof o.days === "object" ? o.days : {}).forEach(function(k){
        var d = o.days[k];
        if (!/^\d{4}-\d\d-\d\d$/.test(k) || !d || typeof d !== "object") return;
        out.days[k] = { ms: num(d.ms), words: num(d.words), pages: num(d.pages), skimmed: num(d.skimmed), listened: num(d.listened),
                        docs: Array.isArray(d.docs) ? d.docs.filter(function(x){ return typeof x === "string"; }) : [] };
        if (num(d.wpm)) out.days[k].wpm = Math.round(num(d.wpm));
      });
      Object.keys(o.books && typeof o.books === "object" ? o.books : {}).forEach(function(k){
        var b = o.books[k];
        if (b && typeof b === "object") out.books[k] = { ms: num(b.ms), words: num(b.words), pages: num(b.pages), skimmed: num(b.skimmed), listened: num(b.listened),
                                                        opened: Math.round(num(b.opened)), finished: !!b.finished, finishedAt: Math.round(num(b.finishedAt)) };
      });
      if (o.best && typeof o.best === "object") out.best = { streak: Math.round(num(o.best.streak)), day: typeof o.best.day === "string" ? o.best.day : "" };
      if (typeof o.notified === "string") out.notified = o.notified;
      return out;
    }
    /* words and pages arrive in fractions; they are rounded on the way out, never in memory */
    function tidy(k, v){ return k === "words" || k === "skimmed" || k === "listened" ? Math.round(v) : k === "pages" ? Math.round(v * 10) / 10 : v; }
    function save(){
      clearTimeout(saveTimer); saveTimer = null;
      if (!dirty) return;
      dirty = false;
      var keys = Object.keys(data.days).sort();
      while (keys.length > MAX_DAYS) delete data.days[keys.shift()];
      Store.set(KEY, JSON.stringify(data, tidy));
    }
    function touch(){ dirty = true; if (!saveTimer) saveTimer = setTimeout(save, 5000); }
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") save(); renderWidget(); });
    window.addEventListener("pagehide", save);

    /* ---- records ---- */
    function day(key){ return data.days[key] || (data.days[key] = { ms: 0, words: 0, pages: 0, skimmed: 0, listened: 0, docs: [] }); }
    function book(id){ return data.books[id] || (data.books[id] = { ms: 0, words: 0, pages: 0, skimmed: 0, listened: 0, opened: 0, finished: false, finishedAt: 0 }); }
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    /* the open document belongs to today; an opening is counted once per open (the id arrives a moment after the file) */
    function noteDoc(){
      if (!docOpen()) return null;
      var id = Library.currentId();
      if (!id) return null;
      var t = day(todayKey()), b = book(id);
      if (t.docs.indexOf(id) < 0){ t.docs.push(id); touch(); }
      if (id !== docKey){ docKey = id; b.opened++; touch(); }
      return b;
    }
    function noteFinished(b){ if (b && !b.finished && readFrac() >= 0.98){ b.finished = true; b.finishedAt = Date.now(); touch(); } }
    /* forward reading, as the pace detector credits it (and auto-scroll's advances) */
    function noteWords(dw){ var b = noteDoc(); if (!b || !(dw > 0)) return; day(todayKey()).words += dw; b.words += dw; lastActive = Date.now(); noteFinished(b); touch(); }
    function notePages(dp){ var b = noteDoc(); if (!b || !(dp > 0)) return; day(todayKey()).pages += dp; b.pages += dp; lastActive = Date.now(); noteFinished(b); touch(); }
    /* words the detector saw pass by too fast to be read, and words read aloud: counted apart,
       and no sign of the reader's own activity */
    function noteSkimmed(dw){ var b = noteDoc(); if (!b || !(dw > 0)) return; day(todayKey()).skimmed += dw; b.skimmed += dw; touch(); }
    function noteListened(dw){ var b = noteDoc(); if (!b || !(dw > 0)) return; day(todayKey()).listened += dw; b.listened += dw; touch(); }
    /* the pace detector takes a note back when the seconds that followed showed what the movement
       really was (a peek that came home, half a gesture judged on its own): the same counters, the
       same day and book, never below zero */
    function unnote(what, n){
      var b = noteDoc(), t = day(todayKey());
      if (!b || !(n > 0) || !t.hasOwnProperty(what)) return;
      t[what] = Math.max(0, t[what] - n); b[what] = Math.max(0, b[what] - n);
      touch();
    }

    /* ---- goal and streak ---- */
    function met(key){ var d = data.days[key]; return !!d && d.ms >= data.goal * 60000; }
    /* consecutive days up to today — or up to yesterday while today is still open: a streak lives until midnight */
    function streak(){
      var k = todayKey(), n = 0;
      if (!met(k)) k = addDays(k, -1);
      while (met(k)){ n++; k = addDays(k, -1); }
      return n;
    }
    /* the longest run in what we still have on record; it never shrinks when old days are pruned */
    function updateBest(){
      var run = 0, prev = null, top = data.best.streak, last = data.best.day;
      Object.keys(data.days).sort().forEach(function(k){
        if (!met(k)){ run = 0; prev = null; return; }
        run = prev && addDays(prev, 1) === k ? run + 1 : 1; prev = k;
        if (run > top){ top = run; last = k; }
      });
      if (top !== data.best.streak || last !== data.best.day){ data.best = { streak: top, day: last }; touch(); }
    }
    function checkGoal(){
      var k = todayKey();
      updateBest();
      if (met(k) && data.notified !== k){ data.notified = k; touch(); var s = streak(); Marks.toast(_tc(s === 1 ? "one" : "", "Daily goal reached — {n}-day streak", { n: s })); }
    }

    /* ---- active time: 15 s slices while a document is open, the page is visible, and the reader did something in the last 3 minutes
       (read-aloud and auto-scroll count as doing something all the while) ---- */
    function active(){ lastActive = Date.now(); }
    ["scroll", "wheel", "keydown", "pointerdown", "touchstart"].forEach(function(ev){ window.addEventListener(ev, active, { passive: true, capture: true }); });
    if (window.MutationObserver) new MutationObserver(active).observe($("#pgInfo"), { childList: true, characterData: true, subtree: true });
    document.addEventListener("ll:fileopened", function(){ docKey = null; active(); renderWidget(); });
    function busy(){ return Speak.isPlaying() || (Auto.isOn() && !Auto.isPaused()) || Rsvp.isPlaying(); }
    /* ---- a day's reading speed, kept as it is earned: only while both the words and the time
       are still growing, and only once the day holds enough reading to mean anything ---- */
    var paceDay = "", paceWords = 0, paceMs = 0;
    function notePace(){
      var k = todayKey(), d = data.days[k];
      if (!d) return;
      if (paceDay !== k){ paceDay = k; paceWords = 0; paceMs = 0; }
      if (d.ms >= 5 * 60000 && d.words > paceWords && d.ms > paceMs){
        d.wpm = Math.round(d.words / (d.ms / 60000));
        touch();
      }
      paceWords = d.words; paceMs = d.ms;
    }
    function tick(){
      var now = Date.now();
      if (docOpen() && document.visibilityState === "visible" && (busy() || now - lastActive <= IDLE)){
        var b = noteDoc();
        day(todayKey()).ms += TICK;
        if (b){ b.ms += TICK; noteFinished(b); }
        touch();
        notePace();
        checkGoal();
        Journal.check();       /* sitting at the end of a book: the time read may now be enough for the "Finished" card */
      }
      renderWidget();
      refreshPanel();
    }
    updateBest();      /* history brought in from another device or an older goal */
    setInterval(tick, TICK);
    function onMode(mode){
      if (mode === "doc" || mode === "pdf"){ active(); if (!noteDoc()) setTimeout(noteDoc, 600); }
      else docKey = null;
      Pace.noteBlock("mode");
      renderWidget();
    }

    /* ---- words ---- */
    function mins(ms){ return Math.floor(ms / 60000); }
    function dur(ms){ var m = mins(ms), h = Math.floor(m / 60); return h ? (m % 60 ? _t("{h} h {m} min", { h: h, m: m % 60 }) : _t("{h} h", { h: h })) : _t("{n} min", { n: m }); }
    function count(x){ return I18N.num(Math.round(x)); }
    /* a count in a sentence: grouped in Dutch (1.234), as it was in English */
    function nn(x){ return I18N.lang() === "nl" ? I18N.num(x) : x; }
    /* "{n} word" / "{n} words": English one and other, n rounded */
    function plural(c, one, many){ return _tn(c, one, many, { n: nn(c) }); }
    function dayLabel(key){ var d = dateOf(key); return I18N.lang() === "nl" ? I18N.date(d, { weekday: "short", day: "numeric", month: "short" }) : WD[d.getDay()] + " " + d.getDate() + " " + MO[d.getMonth()]; }
    function dayTitle(key){ var d = data.days[key]; return _t("{day} — {n} min", { day: dayLabel(key), n: mins(d ? d.ms : 0) }); }
    function weekStart(key){ return addDays(key, -((dateOf(key).getDay() + 6) % 7)); }
    function sum(from, n){ var ms = 0; for (var i = 0; i < n; i++){ var d = data.days[addDays(from, i)]; if (d) ms += d.ms; } return ms; }
    function hasReading(){ return Object.keys(data.days).some(function(k){ var d = data.days[k]; return d.ms > 0 || d.words > 0 || d.pages > 0; }); }
    /* ---- how long a book still has to run ----
       The minutes come from the reader's measured pace (Progress), the "evenings" from how long
       an evening's reading usually is: the average of the days actually read in the last fortnight. */
    function sittingMinutes(n){
      var k = todayKey(), total = 0, days = 0;
      for (var i = 0; i < n; i++){
        var d = data.days[addDays(k, -i)];
        if (d && d.ms > 0){ total += d.ms; days++; }
      }
      return days ? total / days / 60000 : 0;
    }
    /* ---- the speed trend: one average per week over the days that recorded a speed ---- */
    function weekPace(start){
      var sum = 0, n = 0;
      for (var i = 0; i < 7; i++){
        var d = data.days[addDays(start, i)];
        if (d && d.wpm > 0){ sum += d.wpm; n++; }
      }
      return n ? sum / n : null;
    }
    function paceWeeks(n){
      var ws = weekStart(todayKey()), out = [];
      for (var i = n - 1; i >= 0; i--) out.push(weekPace(addDays(ws, -7 * i)));
      return out;
    }
    function mean(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; }
    function live(a){ return a.filter(function(v){ return v !== null; }); }
    /* a polyline of the weeks that have a speed; the label carries the range for a screen reader */
    function spark(weeks){
      var have = live(weeks);
      if (have.length < 3) return "";        /* the same threshold the trend line uses */
      var lo = Math.min.apply(null, have), hi = Math.max.apply(null, have), span = Math.max(1, hi - lo), pts = [];
      weeks.forEach(function(v, i){
        if (v === null) return;
        var x = (i / (weeks.length - 1)) * 100, y = 26 - ((v - lo) / span) * 22;
        pts.push(x.toFixed(1) + "," + y.toFixed(1));
      });
      var label = _t("Reading speed over {n} weeks: {lo} to {hi} words per minute", { n: weeks.length, lo: Math.round(lo), hi: Math.round(hi) });
      return '<svg class="st-spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label="' + label + '">' +
        '<polyline points="' + pts.join(" ") + '" fill="none" stroke="currentColor" stroke-width="1.75" ' +
        'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
    }
    /* one sentence about where the speed is going */
    function paceLine(weeks){
      var have = live(weeks);
      if (have.length < 3) return _t("Not enough reading yet to see a trend");
      var latest = Math.round(have[have.length - 1]);
      var last = mean(live(weeks.slice(-4))), before = mean(live(weeks.slice(-8, -4)));
      if (last === null || before === null || before <= 0) return _t("Steady at about {n} words per minute", { n: latest });
      var pct = Math.round((last - before) / before * 100);
      if (Math.abs(pct) < 5) return _t("Steady at about {n} words per minute", { n: latest });
      return pct > 0 ? _t("Speed is up {n} % on last month", { n: Math.abs(pct) }) : _t("Speed is down {n} % on last month", { n: Math.abs(pct) });
    }

    /* ---- this year ---- */
    /* books finished are the reading journal's entries (a re-read counts again), so the goal, the
       widget and the journal always agree; the journal is loaded a moment after the page */
    function journalCount(year){ try { return Journal.count(year); } catch(_){ return 0; } }
    function finishedThisYear(){ return journalCount(new Date().getFullYear()); }
    /* pages read: a PDF's are counted, a text document's are estimated at 275 words to the page */
    function pagesThisYear(){
      var y = String(new Date().getFullYear()), pages = 0;
      Object.keys(data.days).forEach(function(k){
        if (k.slice(0, 4) !== y) return;
        var d = data.days[k];
        pages += d.pages + d.words / 275;
      });
      return pages;
    }
    /* a library record and its saved position -> "about 2 h 10 min left · ≈ 4 more evenings" */
    function forecast(rec, pos){
      if (!pos) return "";
      var min = null;
      if (pos.mode === "pdf" || pos.pdfPages){
        var pages = pos.pdfPages || 0, page = Math.min(pos.pdfPage || 1, pages), ppm = Progress.ppm();
        if (pages > 3 && ppm > 0) min = (pages - page) / ppm;
      } else {
        var words = (pos.total || 0) / 6, wpm = Progress.wpm();
        if (words > 80 && wpm > 0) min = words * (1 - Math.max(0, Math.min(1, pos.frac || 0))) / wpm;
      }
      if (min === null || !isFinite(min) || min < 1) return "";
      var time = dur(Math.round(min) * 60000), out = _t("about {time} left", { time: time });
      var avg = sittingMinutes(14);
      if (avg > 0){
        var e = Math.max(1, Math.round(min / avg));
        out = _tn(e, "about {time} left · ≈ {n} more evening", "about {time} left · ≈ {n} more evenings", { time: time });
      }
      return out;
    }
    /* a row of lamp dots, one per day: lit when the goal was met, half-lit when there was some reading, today outlined */
    function dots(n, decorative){
      var k = todayKey(), h = '<span class="st-days"' + (decorative ? ' aria-hidden="true"' : '') + '>';
      for (var i = n - 1; i >= 0; i--){
        var key = addDays(k, -i), d = data.days[key];
        var cls = "st-day" + (met(key) ? " lit" : d && (d.ms > 0 || d.words > 0 || d.pages > 0) ? " half" : "") + (i === 0 ? " today" : "");
        h += '<span class="' + cls + '"' + (decorative ? '' : ' role="img" title="' + dayTitle(key) + '" aria-label="' + dayTitle(key) + '"') + '></span>';
      }
      return h + '</span>';
    }

    /* ---- start-screen widget: one calm line, only once there is something to say ---- */
    function renderWidget(){
      if (!widget) return;
      var on = state.mode === "empty" && hasReading(), html = "";
      if (on){
        var s = streak(), t = data.days[todayKey()], parts = [];
        if (s) parts.push(_tc(s === 1 ? "one" : "", "{n}-day streak", { n: s }));
        parts.push(_t("{n} min today", { n: mins(t ? t.ms : 0) }));
        parts.push(_t("goal {n} min", { n: data.goal }));
        if (data.goals.booksPerYear) parts.push(_t("{n} of {goal} books this year", { n: finishedThisYear(), goal: data.goals.booksPerYear }));
        html = '<button type="button" class="st-widget" title="' + _t("Reading stats") + '"><span>' + parts.join(" · ") + '</span>' + dots(7, true) + '</button>';
      }
      widget.classList.toggle("show", on);
      if (html !== widgetHtml){ widgetHtml = html; widget.innerHTML = html; }
    }
    if (widget) widget.addEventListener("click", function(e){ if (e.target.closest(".st-widget")) openPanel(); });

    /* ---- panel ---- */
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function row(k, v){ return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
    /* one yearly goal: what has been done, a bar when a goal is set, and the goal itself */
    var YG = { books: { field: "booksPerYear", step: 1, max: 999, one: "{n} book", many: "{n} books",
                        lower: "Lower the yearly book goal", raise: "Raise the yearly book goal", input: "Books a year — zero for no goal" },
               pages: { field: "pagesPerYear", step: 50, max: 99999, one: "{n} page", many: "{n} pages",
                        lower: "Lower the yearly page goal", raise: "Raise the yearly page goal", input: "Pages a year — zero for no goal" } };
    function yearRow(label, value, key){
      var y = YG[key], goal = data.goals[y.field], pct = goal ? Math.min(100, Math.round(value / goal * 100)) : 0;
      return '<div class="st-year"><div class="st-year-head"><span>' + label + '</span><span class="st-year-v">' +
        (goal ? _t("{n} of {goal}", { n: count(value), goal: count(goal) }) : plural(Math.round(value), y.one, y.many)) + '</span></div>' +
        (goal ? '<div class="st-pbar" role="img" aria-label="' + _t("{label}: {n} of {goal}", { label: label, n: count(value), goal: count(goal) }) + '"><i style="width:' + pct + '%"></i></div>' : '') +
        '<div class="st-year-goal"><button type="button" data-yg="' + key + '" data-d="-1" aria-label="' + _t(y.lower) + '">−</button>' +
        '<input type="number" class="st-yg-in" id="yg-' + key + '" min="0" max="' + y.max + '" step="' + y.step + '" value="' + goal +
        '" aria-label="' + _t(y.input) + '">' +
        '<button type="button" data-yg="' + key + '" data-d="1" aria-label="' + _t(y.raise) + '">+</button>' +
        '<span class="st-year-hint">' + (goal ? _t("a year") : _t("no goal")) + '</span></div></div>';
    }
    function setYearGoal(key, v){
      var y = YG[key];
      if (!y) return;
      v = Math.max(0, Math.min(y.max, Math.round(v) || 0));
      if (data.goals[y.field] === v) return;
      data.goals[y.field] = v; dirty = true;
      save(); renderWidget();
    }
    function renderPanel(body, foot){
      var k = todayKey(), t = data.days[k] || { ms: 0, words: 0, pages: 0, skimmed: 0, listened: 0 }, goalMs = data.goal * 60000, done = t.ms >= goalMs;
      var s = streak(), left = Math.max(0, Math.ceil((goalMs - t.ms) / 60000)), h = "";
      /* today */
      var also = [plural(Math.round(t.words), "{n} word", "{n} words")];
      if (t.pages >= 1) also.push(plural(Math.round(t.pages), "{n} page", "{n} pages"));
      if ((t.skimmed || 0) >= 1) also.push(_t("{n} skimmed", { n: count(t.skimmed) }));
      h += '<section class="st-sec"><div class="label sec">' + _t("Today") + '</div><div class="st-today">' +
        '<div class="st-ring" style="--p:' + Math.min(100, Math.round(t.ms / goalMs * 100)) + '%" aria-hidden="true"></div>' +
        '<div><div class="st-big">' + mins(t.ms) + '<span> ' + _t("of {n} min", { n: data.goal }) + '</span></div>' +
        '<div class="st-sub">' + (done ? _t("Goal reached") : plural(left, "{n} minute to go", "{n} minutes to go")) + ' · ' + also.join(" · ") + '</div></div></div></section>';
      /* streak */
      h += '<section class="st-sec"><div class="label sec">' + _t("Streak") + '</div>' + dots(14) +
        '<div class="st-line">' + (s ? _tc(s === 1 ? "one" : "", "{n}-day streak", { n: s }) : _t("No streak yet")) + (data.best.streak ? ' · ' + plural(data.best.streak, "best {n} day", "best {n} days") : '') + '</div>' +
        (done ? '' : '<div class="st-hint">' + (s ? plural(left, "Read {n} more minute today to keep it.", "Read {n} more minutes today to keep it.")
                                                  : plural(left, "Read {n} more minute today to start one.", "Read {n} more minutes today to start one.")) + '</div>') + '</section>';
      /* the last four weeks, a bar per day */
      var max = data.goal, keys = [];
      for (var i = 27; i >= 0; i--){ var kk = addDays(k, -i); keys.push(kk); if (data.days[kk]) max = Math.max(max, data.days[kk].ms / 60000); }
      var ws = weekStart(k);
      h += '<section class="st-sec"><div class="label sec">' + _t("Last 4 weeks") + '</div><div class="st-chart">' +
        '<div class="st-goal" style="bottom:' + (data.goal / max * 100).toFixed(1) + '%"></div>' +
        keys.map(function(key){
          var m = data.days[key] ? data.days[key].ms / 60000 : 0, pct = m > 0 ? Math.max(3, m / max * 100) : 0;
          return '<div class="st-bar' + (met(key) ? ' met' : '') + '" style="height:' + pct.toFixed(1) + '%" role="img" aria-label="' + dayTitle(key) + '"></div>';
        }).join("") + '</div>' +
        '<div class="st-line">' + _t("This week {a} · last week {b}", { a: dur(sum(ws, 7)), b: dur(sum(addDays(ws, -7), 7)) }) + '</div></section>';
      /* reading speed: twelve weeks of it, and a word about where it is going */
      var weeks = paceWeeks(12), latest = live(weeks);
      h += '<section class="st-sec"><div class="label sec">' + _t("Reading speed") + '</div>' +
        (latest.length ? '<div class="st-speed">' + spark(weeks) +
          '<div class="st-speed-n">' + Math.round(latest[latest.length - 1]) + '<span> ' + _t("wpm") + '</span></div></div>' : '') +
        '<div class="st-line">' + paceLine(weeks) + '</div></section>';
      /* this year, against the goals the reader set */
      var yb = finishedThisYear(), yp = Math.round(pagesThisYear());
      h += '<section class="st-sec"><div class="label sec">' + _t("This year") + '</div>' +
        yearRow(_t("Books finished"), yb, "books") + yearRow(_t("Pages read"), yp, "pages") +
        '<div class="so-acts"><button type="button" class="chip st-journal" data-st="journal">' + ICONS.journal + '<span>' + _t("Reading journal") + '</span></button></div></section>';
      /* the books in the library, most recently opened first, with what is left of each */
      var recent = [];
      try { recent = Library.books().slice(0, 5); } catch(_){}
      if (recent.length){
        h += '<section class="st-sec"><div class="label sec">' + _t("Books") + '</div>';
        recent.forEach(function(r){
          var rb = data.books[r.id], pos = Library.positionFor(r.id), pct = pos ? pos.pct : 0, fc = forecast(r, pos);
          h += '<div class="st-book"><div class="st-book-n" data-no-i18n>' + esc(bookName(r)) + '</div>' +
            '<div class="st-book-m"><span class="st-pbar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
            '<span>' + _t("{pct}% · {time} read", { pct: pct, time: dur(rb ? rb.ms : 0) }) + '</span></div>' +
            (fc ? '<div class="st-book-f">' + esc(fc) + '</div>' : '') + '</div>';
        });
        h += '</section>';
      }
      /* all time, with the measured pace: the estimate over every book, this book's own, and how
         much reading the numbers rest on */
      var all = { ms: 0, words: 0, pages: 0, skimmed: 0, listened: 0 }, dayKeys = Object.keys(data.days).sort(), ids = Object.keys(data.books);
      dayKeys.forEach(function(key){ var d = data.days[key]; all.ms += d.ms; all.words += d.words; all.pages += d.pages; all.skimmed += d.skimmed || 0; all.listened += d.listened || 0; });
      var finished = journalCount(), first = dayKeys.length ? dateOf(dayKeys[0]) : null;
      var pace = Pace.summary(), thisDoc = "";
      if (pace.doc && docOpen()){
        thisDoc = state.mode === "pdf" ? row(_t("This document"), _t("{n} pages per minute over {time}", { n: dec(pace.doc.ppm, 1), time: dur(pace.doc.ms) }))
                                       : row(_t("This document"), _t("{n} words per minute over {time}", { n: Math.round(pace.doc.wpm), time: dur(pace.doc.ms) }));
      }
      h += '<section class="st-sec"><div class="label sec">' + _t("All time") + '</div><dl class="st-grid">' +
        row(_t("Time read"), dur(all.ms)) + row(_t("Words"), count(all.words)) + row(_t("Pages"), count(all.pages)) +
        (all.skimmed >= 1 ? row(_t("Skimmed"), count(all.skimmed)) : "") + (all.listened >= 1 ? row(_t("Listened"), count(all.listened)) : "") +
        row(_t("Documents opened"), count(ids.length)) + row(_t("Books finished"), count(finished)) +
        row(_t("Average speed"), _t("{n} words per minute", { n: Math.round(Pace.wpm()) })) + thisDoc +
        row(_t("First day recorded"), first ? (I18N.lang() === "nl" ? I18N.date(first) : first.getDate() + " " + MO[first.getMonth()] + " " + first.getFullYear()) : "—") + '</dl>' +
        '<div class="st-hint">' + pace.confidence.text + '</div></section>';
      /* goal */
      h += '<section class="st-sec"><div class="label sec">' + _t("Daily goal") + '</div><div class="chips st-goals" role="group" aria-label="' + _t("Daily goal in minutes") + '">' +
        GOALS.map(function(g){ return '<button type="button" class="chip' + (g === data.goal ? ' on' : '') + '" data-goal="' + g + '" aria-pressed="' + (g === data.goal) + '" aria-label="' + plural(g, "{n} minute a day", "{n} minutes a day") + '">' + g + '</button>'; }).join("") +
        '</div><div class="hint">' + _t("Minutes of reading a day. A day counts toward the streak once the goal is met.") + '</div></section>';
      body.innerHTML = h;
      foot.innerHTML = '<button type="button" class="chip" data-st="export">' + _t("Export JSON") + '</button><button type="button" class="chip" data-st="reset">' + _tc("stats", "Reset…") + '</button>';
    }
    /* redraw in place: the scroll position and the focused chip survive the refresh */
    function refreshPanel(){
      if (!Side.is("stats")) return;
      var body = Side.body, top = body.scrollTop, a = document.activeElement, sel = null;
      /* a goal being typed is not pulled out from under the reader by the 15-second tick */
      if (a && a.classList && a.classList.contains("st-yg-in") && body.contains(a)) return;
      if (a && (body.contains(a) || Side.foot.contains(a))){
        sel = a.dataset.goal ? '[data-goal="' + a.dataset.goal + '"]'
            : a.dataset.st ? '[data-st="' + a.dataset.st + '"]'
            : a.dataset.yg ? '[data-yg="' + a.dataset.yg + '"][data-d="' + a.dataset.d + '"]' : null;
      }
      Side.refresh("stats", renderPanel);
      body.scrollTop = top;
      var again = sel && (body.querySelector(sel) || Side.foot.querySelector(sel));
      if (again) again.focus({ preventScroll: true });
    }
    function openPanel(){ Side.open("stats", _t("Reading stats"), renderPanel); }
    function setGoal(g){
      if (GOALS.indexOf(g) < 0 || g === data.goal) return;
      data.goal = g; dirty = true;
      checkGoal(); save(); refreshPanel(); renderWidget();
    }
    function download(name, text, type){
      var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);
    }
    function exportJson(){
      var out = { app: "Lamplight", exported: new Date().toISOString(), goal: data.goal, streak: streak(), best: data.best, days: data.days, books: data.books, pace: { runs: Pace.runs() } };
      download("lamplight-stats.json", JSON.stringify(out, tidy, 2), "application/json");
    }
    /* quiet: the caller has already asked (the Storage panel's "Clear everything") */
    function reset(quiet){
      if (!quiet && !confirm(_t("Clear all reading stats from this device? This can’t be undone."))) return false;
      data = fresh(); docKey = null; dirty = true;
      Pace.reset();
      save(); refreshPanel(); renderWidget();
      if (!quiet) Marks.toast(_t("Reading stats cleared"));
      return true;
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("stats")) return;
      if (e.target.closest('button[data-st="journal"]')){ Journal.openPanel(); return; }
      var b = e.target.closest("button[data-goal]");
      if (b){ setGoal(+b.dataset.goal); return; }
      var y = e.target.closest("button[data-yg]");
      if (y){ setYearGoal(y.dataset.yg, data.goals[YG[y.dataset.yg].field] + (+y.dataset.d) * YG[y.dataset.yg].step); refreshPanel(); }
    });
    Side.body.addEventListener("change", function(e){
      if (!Side.is("stats") || !e.target.classList || !e.target.classList.contains("st-yg-in")) return;
      setYearGoal(e.target.id === "yg-books" ? "books" : "pages", +e.target.value);
      refreshPanel();
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("stats")) return;
      var b = e.target.closest("button[data-st]"); if (!b) return;
      if (b.dataset.st === "export") exportJson(); else reset();
    });
    Menu.add({ order: 61, group: "app", icon: ICONS.chart, label: _tc("menu", "Reading stats"), key: "G", run: openPanel });

    function snapshot(){ var o = JSON.parse(JSON.stringify(data, tidy)); o.streak = streak(); o.today = todayKey(); o.pace = Pace.summary(); return o; }
    /* for tests and other scripts */
    window.llStats = { onMode: onMode, openPanel: openPanel, snapshot: snapshot, streak: streak, setGoal: setGoal, tick: tick, flush: save,
                       forecast: forecast, reset: reset, setYearGoal: setYearGoal };
    /* a book's reading so far (active time, words and pages read forward), for the "Finished" card */
    function bookRead(id){ var b = data.books[id]; return b ? { ms: b.ms, words: b.words, pages: b.pages } : { ms: 0, words: 0, pages: 0 }; }
    /* the first day (of the days kept) the book was open, "YYYY-MM-DD", or "" */
    function firstDay(id){
      var first = "";
      Object.keys(data.days).forEach(function(k){ var d = data.days[k]; if (d && d.docs && d.docs.indexOf(id) >= 0 && (!first || k < first)) first = k; });
      return first;
    }
    return { noteWords: noteWords, notePages: notePages, noteSkimmed: noteSkimmed, noteListened: noteListened, unnote: unnote,
             onMode: onMode, openPanel: openPanel, snapshot: snapshot, forecast: forecast, reset: reset, book: bookRead, firstDay: firstDay,
             refresh: function(){ renderWidget(); refreshPanel(); } };
  })();

  /* ============================================================
     Storage — what Lamplight is keeping on this device, and how to let it go.
     Nothing here leaves the device; the panel only counts and clears.
     ============================================================ */
  var Storage = (function(){
    var measured = null, cache = null, cacheState = "idle";
    /* the downloads kept in caches of their own, which outlive a release (KEEP in sw.js): the natural voices (their
       models, as audiobook.js and the workers keep them, and the engine both run on) and the Dutch ↔ English pack
       (translate.js). Measured with the app's own files; a cache that is not there is not made by asking */
    var MODELS = [
      { key: "piper", name: "Natural voices · Fast", sub: "the Piper voice model, for reading aloud offline", caches: ["piper-voices"], label: "Remove Fast voices" },
      { key: "kokoro", name: "Natural voices · Best", sub: "the Kokoro model and its voices, for reading aloud offline", caches: ["transformers-cache", "kokoro-voices"], label: "Remove Best voices" },
      { key: "runtime", name: "Natural voices’ engine", sub: "shared by Fast and Best; removed with the last of them", prefix: "natural-runtime" },
      { key: "pack", name: "Dutch ↔ English pack", sub: "translation on this device, offline", caches: ["bergamot-models"], label: "Remove the pack" }
    ];
    var models = null;

    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function size(n){
      if (!(n > 0)) return "0 KB";
      if (n < 1024) return n + " B";
      if (n < 1048576) return Math.round(n / 1024) + " KB";
      if (n < 1073741824) return dec(n / 1048576, n < 10485760 ? 1 : 0) + " MB";
      return dec(n / 1073741824, 1) + " GB";
    }
    /* "{n} file" / "{n} files": the count grouped in Dutch (1.234), as it was in English */
    function plural(n, one, many){ return _tn(n, one, many, { n: I18N.lang() === "nl" ? I18N.num(n) : n }); }
    function countOf(store){ return Library.tx(store, "readonly", function(st){ return st.count(); }).catch(function(){ return 0; }); }

    /* ---- the count ---- */
    function measure(){
      var list = Library.books();
      var o = { books: list.length, bookBytes: 0, finished: 0, positions: 0, marks: 0, journal: 0,
                trDocs: 0, trWords: 0, trBytes: 0, audio: 0, audioBytes: 0,
                stats: (Store.get("ll_stats") || "").length, statDays: 0,
                themes: (state.customs || []).length, usage: null, quota: null, persisted: null };
      list.forEach(function(b){
        o.bookBytes += (b.blob && b.blob.size) || b.size || 0;
        var p = Library.positionFor(b.id);
        if (p && p.pct >= 98) o.finished++;
      });
      try { o.statDays = Object.keys(Stats.snapshot().days).length; } catch(_){}
      var jobs = [
        countOf("positions").then(function(n){ o.positions = n; }),
        countOf("marks").then(function(n){ o.marks = n; }),
        countOf("journal").then(function(n){ o.journal = n; }),
        Library.tx("translations", "readonly", function(st){ return st.getAll(); }).then(function(rows){
          (rows || []).forEach(function(r){
            /* a document's blocks are one record; single words and sentences are keyed "s|…" */
            if (String(r.key || "").indexOf("s|") === 0) o.trWords++; else o.trDocs++;
            try { o.trBytes += JSON.stringify(r).length; } catch(_){}
          });
        }).catch(function(){}),
        /* read-aloud clips (natural voices, ElevenLabs): a cursor, so only one record is in memory at a time */
        Library.tx("audio", "readonly", function(st){
          var req = st.openCursor();
          req.onsuccess = function(){
            var c = req.result; if (!c) return;
            var v = c.value || {};
            o.audio++; o.audioBytes += v.size || (v.blob && v.blob.size) || 0;
            c.continue();
          };
        }).catch(function(){})
      ];
      if (navigator.storage && navigator.storage.estimate)
        jobs.push(navigator.storage.estimate().then(function(e){ o.usage = e.usage; o.quota = e.quota; }).catch(function(){}));
      if (navigator.storage && navigator.storage.persisted)
        jobs.push(navigator.storage.persisted().then(function(p){ o.persisted = !!p; }).catch(function(){}));
      return Promise.all(jobs).then(function(){ return o; });
    }
    /* a cached response's size: its Content-Length, else its body's (a blob handle, not a read of the data) */
    function entrySize(c, req){
      return c.match(req).then(function(r){
        if (!r) return 0;
        var n = +r.headers.get("content-length") || 0;
        return n || r.blob().then(function(b){ return b.size; }, function(){ return 0; });
      }).catch(function(){ return 0; });
    }
    function measureModels(){
      if (!(window.caches && caches.keys)) return Promise.resolve();
      return caches.keys().then(function(keys){ return Promise.all(MODELS.map(function(m){
        var names = keys.filter(function(k){ return m.prefix ? k.indexOf(m.prefix) === 0 : m.caches.indexOf(k) >= 0; });
        return Promise.all(names.map(function(k){
          return caches.open(k).then(function(c){
            return c.keys().then(function(reqs){ return Promise.all(reqs.map(function(q){ return entrySize(c, q); })); });
          }).catch(function(){ return []; });
        })).then(function(parts){
          var sizes = [].concat.apply([], parts);
          return { n: sizes.length, bytes: sizes.reduce(function(a, x){ return a + x; }, 0) };
        });
      })); }).then(function(list){
        var out = {};
        MODELS.forEach(function(m, i){ out[m.key] = list[i]; });
        models = out;
      }).catch(function(){}).then(refresh);
    }
    /* the service worker's cache holds the app itself and the dictionary; reading every
       response back is slow, so it is measured on its own and the row says so meanwhile */
    function measureCache(){
      if (cacheState !== "idle") return;
      if (!window.caches){ cacheState = "unknown"; return; }
      cacheState = "busy";
      caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){ return k.indexOf("lamplight-") === 0; }).map(function(k){
          return caches.open(k).then(function(c){ return c.matchAll(); }).then(function(list){
            return Promise.all(list.map(function(res){
              return res.blob().then(function(bl){ return bl.size; }, function(){ return 0; });
            })).then(function(sizes){
              return { n: sizes.length, bytes: sizes.reduce(function(a, x){ return a + x; }, 0) };
            });
          });
        }));
      }).then(function(parts){
        cache = parts.reduce(function(a, p){ return { n: a.n + p.n, bytes: a.bytes + p.bytes }; }, { n: 0, bytes: 0 });
        cacheState = "done";
      }).catch(function(){ cacheState = "unknown"; }).then(refresh);
    }
    /* measured again after something was taken off the device */
    function remeasure(){ measureModels(); reload(); }

    /* ---- the panel ---- */
    function row(name, sub, val, act, label){
      return '<div class="so-row"><div class="so-what"><div class="so-name">' + esc(name) + '</div>' +
        '<div class="so-sub">' + esc(sub) + '</div></div>' +
        '<div class="so-val">' + esc(val || "") + '</div>' +
        (act ? '<button type="button" class="chip so-act" data-so="' + act + '">' + esc(label) + '</button>' : '') +
        '</div>';
    }
    /* a row for each download that is on this device (the engine without a remove of its own: it goes with the last voices) */
    function modelRows(){
      if (!models) return "";
      return MODELS.map(function(m){
        var x = models[m.key];
        if (!x || !x.n) return "";
        return row(_t(m.name), _t(m.sub), size(x.bytes), m.label ? "rm-" + m.key : "", m.label ? _t(m.label) : "");
      }).join("");
    }
    function cacheRow(){
      if (cacheState === "done") return row(_t("App files and dictionary"), plural(cache.n, "{n} file", "{n} files"), size(cache.bytes), "", "");
      if (cacheState === "busy") return row(_t("App files and dictionary"), _t("Measuring…"), "", "", "");
      return row(_t("App files and dictionary"), _t("Not cached yet"), "", "", "");
    }
    function renderPanel(body, foot){
      var o = measured;
      if (!o){ body.innerHTML = '<div class="empty-note">' + _t("Measuring…") + '</div>'; foot.innerHTML = ""; return; }
      var h = "";
      if (o.usage !== null && o.usage !== undefined){
        var pct = o.quota ? Math.min(100, Math.max(0.5, o.usage / o.quota * 100)) : 0;
        var line = o.quota ? _t("{used} used of about {quota} this site may use", { used: size(o.usage), quota: size(o.quota) }) : _t("{used} used", { used: size(o.usage) });
        h += '<section class="so-sec"><div class="label sec">' + _t("All together") + '</div>' +
          '<div class="so-meter" role="img" aria-label="' + esc(line) + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<div class="so-line">' + esc(line) + '</div></section>';
      }
      h += '<section class="so-sec"><div class="label sec">' + _t("What is stored") + '</div>' +
        row(_t("Books"), plural(o.books, "{n} file", "{n} files") + (o.finished ? " · " + _t("{n} finished", { n: o.finished }) : ""), size(o.bookBytes),
            o.finished ? "finished" : "", _t("Remove finished books")) +
        row(_t("Reading positions"), plural(o.positions, "{n} book", "{n} books"), "", "", "") +
        row(_t("Highlights and notes"), plural(o.marks, "{n} mark", "{n} marks"), "", o.marks ? "marks" : "", _t("Delete all highlights and notes")) +
        row(_t("Cached translations"), plural(o.trDocs, "{n} document", "{n} documents") + " · " + plural(o.trWords, "{n} word or sentence", "{n} words and sentences"),
            o.trBytes ? size(o.trBytes) : "", (o.trDocs + o.trWords) ? "translations" : "", _t("Clear cached translations")) +
        row(_t("Read-aloud audio"), plural(o.audio, "{n} clip made by the natural voices or ElevenLabs, kept for replays (up to 400 MB)", "{n} clips made by the natural voices or ElevenLabs, kept for replays (up to 400 MB)"),
            o.audioBytes ? size(o.audioBytes) : "", o.audio ? "audio" : "", _t("Clear read-aloud audio")) +
        row(_t("Reading stats"), plural(o.statDays, "{n} day", "{n} days"), size(o.stats), o.statDays ? "stats" : "", _t("Reset reading stats")) +
        row(_t("Reading journal"), plural(o.journal, "{n} book finished · kept when the library is cleared", "{n} books finished · kept when the library is cleared"), "", o.journal ? "journal" : "", _t("Clear reading journal")) +
        row(_t("Saved themes"), plural(o.themes, "{n} theme", "{n} themes"), "", "", "") +
        modelRows() + cacheRow() + '</section>';
      h += '<section class="so-sec"><div class="label sec">' + _t("Keeping it") + '</div><div class="so-line">' +
        (o.persisted === null ? _t("This browser doesn’t say whether it keeps storage.")
         : o.persisted ? _t("Storage is persistent — the browser won’t clear it on its own.")
         : _t("Storage may be cleared by the browser when space is low.")) + '</div>' +
        (o.persisted === false ? '<div class="so-acts"><button type="button" class="chip" data-so="persist">' + _t("Request persistent storage") + '</button></div>' : '') +
        '</section>';
      body.innerHTML = h;
      foot.innerHTML = '<button type="button" class="chip so-danger" data-so="wipe">' + _t("Clear everything…") + '</button>';
    }
    /* redraw in place: the scroll position and the focused button survive */
    function refresh(){
      if (!Side.is("storage")) return;
      var body = Side.body, top = body.scrollTop, a = document.activeElement;
      var sel = a && a.dataset && a.dataset.so ? '[data-so="' + a.dataset.so + '"]' : null;
      Side.refresh("storage", renderPanel);
      body.scrollTop = top;
      var again = sel && (body.querySelector(sel) || Side.foot.querySelector(sel));
      if (again) again.focus({ preventScroll: true });
    }
    function reload(){ measure().then(function(o){ measured = o; refresh(); }).catch(function(){}); }
    function openPanel(){
      measured = null;
      Side.open("storage", _t("Storage"), renderPanel);
      reload(); measureCache(); measureModels();
    }

    /* ---- letting things go ---- */
    function act(what){
      if (what === "finished"){
        /* a book counts as finished at 98 %: one only jumped to the end counts too, and its notes would go with it */
        var fin = measured ? measured.finished : 0;
        if (fin && !confirm(plural(fin, "Remove {n} finished book from this device, with its reading position, highlights, bookmarks and notes? This can’t be undone. Your reading journal is kept.",
                                        "Remove {n} finished books from this device, with their reading positions, highlights, bookmarks and notes? This can’t be undone. Your reading journal is kept."))) return;
        var n = Library.removeFinished();
        Marks.toast(n ? plural(n, "Removed {n} finished book", "Removed {n} finished books") : _t("Nothing is finished yet"));
        reload();
      } else if (what === "marks"){
        if (!confirm(_t("Delete every highlight, bookmark and note on this device? This can’t be undone."))) return;
        Marks.clearAll().then(function(){ Marks.toast(_t("Highlights and notes deleted")); reload(); });
      } else if (what === "audio"){
        if (!confirm(measured && measured.audioBytes
                     ? _t("Delete the read-aloud audio kept on this device ({size})? The natural voices make it again as you listen; ElevenLabs audio is made (and paid for) again.", { size: size(measured.audioBytes) })
                     : _t("Delete the read-aloud audio kept on this device? The natural voices make it again as you listen; ElevenLabs audio is made (and paid for) again."))) return;
        /* through audiobook.js when it is running, so what it holds in memory about the store goes too */
        if (window.llAudiobook && window.llAudiobook.clearAudio) window.llAudiobook.clearAudio();
        else Library.tx("audio", "readwrite", function(st){ st.clear(); }).then(function(){ Marks.toast(_t("Read-aloud audio cleared")); }, function(){});
        reload();
      } else if (what === "rm-piper" || what === "rm-kokoro"){
        /* audiobook.js asks, stops what uses the model and takes it (and the engine, when the other one is not here) */
        need(["audiobook"]).then(function(){
          var A = window.llAudiobook;
          return A ? (what === "rm-piper" ? A.removePiper() : A.removeKokoro()) : null;
        }).then(remeasure, function(){ Marks.toast(_t("Couldn’t load the voices")); });
      } else if (what === "rm-pack"){
        var pk = models && models.pack;
        if (!confirm(pk && pk.bytes ? _t("Remove the Dutch ↔ English pack from this device ({size})? It can be downloaded again.", { size: size(pk.bytes) })
                                    : _t("Remove the Dutch ↔ English pack from this device? It can be downloaded again."))) return;
        need(["translate"]).then(function(){ return window.llTranslate ? window.llTranslate.pack.remove() : null; })
          .then(remeasure, function(){ Marks.toast(_t("Couldn’t load the translator")); });
      } else if (what === "translations"){
        Library.tx("translations", "readwrite", function(st){ st.clear(); })
          .then(function(){ Marks.toast(_t("Cached translations cleared")); reload(); }, function(){});
      } else if (what === "stats"){
        if (Stats.reset()) reload();
      } else if (what === "journal"){
        Journal.clear().then(function(done){ if (done) reload(); });
      } else if (what === "persist"){
        if (!(navigator.storage && navigator.storage.persist)) return;
        navigator.storage.persist().then(function(ok){
          Store.set("ll_persist", ok ? "granted" : "denied");
          Marks.toast(ok ? _t("Storage is now persistent") : _t("The browser kept storage as it was"));
          reload();
        }, function(){});
      } else if (what === "wipe"){
        if (!confirm(_t("Clear everything Lamplight keeps on this device — books, positions, notes, translations, stats, reading journal, themes and settings (an ElevenLabs key too), the read-aloud audio, the natural voices and the Dutch ↔ English pack?"))) return;
        if (!confirm(_t("This can’t be undone. Clear everything?"))) return;
        Stats.reset(true);
        /* every setting, whichever feature wrote it (an ElevenLabs key among them); only the note that storage was
           made persistent stays, since the browser keeps that */
        var keys = [];
        try { for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if (k && k.indexOf("ll_") === 0 && k !== "ll_persist") keys.push(k); } } catch(_){}
        keys.forEach(function(k){ Store.remove(k); });
        /* the downloads in caches of their own; the app's own files stay, so it still opens offline */
        var gone = window.caches ? caches.keys().then(function(names){
          return Promise.all(names.filter(function(k){
            return k.indexOf("natural-runtime") === 0 || MODELS.some(function(m){ return m.caches && m.caches.indexOf(k) >= 0; });
          }).map(function(k){ return caches.delete(k).catch(function(){}); }));
        }).catch(function(){}) : Promise.resolve();
        Promise.all([Library.wipe(true), Journal.clear(true), gone]).then(function(){ location.reload(); }, function(){ location.reload(); });
      }
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("storage")) return;
      var b = e.target.closest("button[data-so]"); if (b) act(b.dataset.so);
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("storage")) return;
      var b = e.target.closest("button[data-so]"); if (b) act(b.dataset.so);
    });
    Menu.add({ order: 62, porder: 91, group: "app", icon: ICONS.storage, label: _t("Storage"), run: openPanel });
    window.llStorage = { openPanel: openPanel, measure: measure, act: act };
    return { openPanel: openPanel };
  })();

  /* ============================================================
     Reading journal — the books finished, each with its stars, a line of
     its own and the day it was done. Reaching the end of a book after
     reading it for a while brings up a small "Finished" card, once per
     reading; "Mark as finished" in the menu opens the same card anywhere.
     The entries live in IndexedDB ("journal", keyPath id, index book) and
     outlast the library: clearing the library keeps them, since they are
     a record of what was read. Reading stats count finished books here.
     ============================================================ */
  var Journal = (function(){
    /* KEY: per book, where the last card left the reading (the stats at that moment, and the entry
       saved for it); a new reading begins once the reader goes back to the start (AGAIN) */
    var KEY = "ll_finish", MIN_MS = 3 * 60000, MIN_PART = 0.2, END = 0.98, AGAIN = 0.1, KEEP = 400, NOTE_MAX = 200;
    var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var list = [], loaded = false, seen = loadSeen(), sess = null, pokeT = null;
    var card = null, cur = null, opener = null, live = null, expanded = null;

    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function cssEsc(x){ return window.CSS && CSS.escape ? CSS.escape(x) : String(x).replace(/["\\]/g, "\\$&"); }
    function num(x){ return typeof x === "number" && isFinite(x) && x > 0 ? x : 0; }

    /* ---- days: local dates as "YYYY-MM-DD" (toISOString would shift them to UTC) ---- */
    function pad(n){ return (n < 10 ? "0" : "") + n; }
    function isoDay(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function today(){ return isoDay(new Date()); }
    function dateOf(s){ var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function isDay(s){ return typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) && isoDay(dateOf(s)) === s; }
    function dayText(s){ var d = dateOf(s); return I18N.lang() === "nl" ? I18N.date(d) : d.getDate() + " " + MO[d.getMonth()] + " " + d.getFullYear(); }
    /* "took 12 days", when the day it was first opened is known */
    function took(e){
      if (!isDay(e.started) || !isDay(e.finished) || e.started > e.finished) return "";
      var n = Math.round((dateOf(e.finished) - dateOf(e.started)) / 86400000);
      return n < 1 ? _t("read in a day") : _tn(n, "took {n} day", "took {n} days");
    }
    function books(n){ return _tn(n, "{n} book", "{n} books"); }

    /* ---- the readings seen through to the card ---- */
    function loadSeen(){
      var o = null, out = {};
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      if (!o || typeof o !== "object") return out;
      Object.keys(o).forEach(function(id){
        var x = o[id];
        if (!x || typeof x !== "object") return;
        out[id] = { ms: num(x.ms), words: num(x.words), pages: num(x.pages), at: num(x.at), entry: typeof x.entry === "string" ? x.entry : null, away: x.away === true, t: num(x.t) };
        if (isDay(x.from)) out[id].from = x.from;     /* the day this reading began (back at the start, or Read again) */
      });
      return out;
    }
    function saveSeen(){
      var ids = Object.keys(seen);
      if (ids.length > KEEP){
        ids.sort(function(a, b){ return seen[a].t - seen[b].t; });
        ids.slice(0, ids.length - KEEP).forEach(function(id){ delete seen[id]; });
      }
      Store.set(KEY, JSON.stringify(seen));
    }
    /* the day this reading began: a re-read's, noted when the reader went back to the start (or chose Read again); a first
       reading's, the first day the stats saw the book open; else the day it came into the library. A re-read from before
       those days were noted has none. */
    function startedOn(id, s, b){
      if (s && s.away) return s.from || "";
      var d = Stats.firstDay ? Stats.firstDay(id) : "";
      if (isDay(d)) return d;
      return b && b.added ? isoDay(new Date(b.added)) : "";
    }
    /* this reading has had its card: what the stats say now is where the next reading is counted from */
    function markSeen(id, entry){
      var r = Stats.book(id);
      seen[id] = { ms: r.ms || 0, words: r.words || 0, pages: r.pages || 0, at: Math.round(Math.max(0, Math.min(1, readFrac())) * 1000) / 1000,
                   entry: entry || null, away: false, t: Date.now() };
      saveSeen();
    }

    /* ---- the entries ---- */
    function clean(e){
      if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id || !isDay(e.finished)) return null;
      return { id: e.id, book: typeof e.book === "string" ? e.book : "", title: String(e.title || _t("Untitled")), author: typeof e.author === "string" ? e.author : "",
               stars: Math.max(0, Math.min(5, Math.round(+e.stars || 0))), note: typeof e.note === "string" ? e.note : "",
               finished: e.finished, started: isDay(e.started) ? e.started : "", created: num(e.created) };
    }
    /* newest first: by the day finished, then by when the entry was made */
    function sort(){ list.sort(function(a, b){ return a.finished < b.finished ? 1 : a.finished > b.finished ? -1 : (b.created || 0) - (a.created || 0); }); }
    function byId(id){ for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
    function latestFor(book){ for (var i = 0; i < list.length; i++) if (list[i].book === book) return list[i]; return null; }
    function count(year){
      if (year === undefined || year === null) return list.length;
      var y = String(year);
      return list.filter(function(e){ return e.finished.slice(0, 4) === y; }).length;
    }
    function newId(){ return "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function put(e){ return Library.tx("journal", "readwrite", function(st){ st.put(e); }).catch(function(){ Marks.toast(_t("Couldn’t save to the reading journal")); }); }
    function bookRec(id){ return Library.books().filter(function(b){ return b.id === id; })[0] || null; }
    /* an EPUB's library title is "Title — Author"; nothing else carries an author */
    function nameOf(b){
      var t = bookName(b) || ($("#fname").textContent || "").trim() || _t("Untitled"), author = "";
      var i = t.indexOf(" \u2014 ");
      if (b && b.title && b.type === "EPUB" && i > 0){ author = t.slice(i + 3).trim(); t = t.slice(0, i).trim(); }
      return { title: t, author: author };
    }
    /* the library list, the stats and the panel follow the journal */
    function changed(){
      try { Library.render(); } catch(_){}
      try { Stats.refresh(); } catch(_){}
      refreshPanel();
    }
    var ready = Library.tx("journal", "readonly", function(st){ return st.getAll(); }).then(function(rows){
      var mine = list;
      list = (rows || []).map(clean).filter(Boolean);
      mine.forEach(function(e){ if (!byId(e.id)) list.push(e); });
      sort();
    }).catch(function(err){ console.warn("journal unavailable", err); }).then(function(){ loaded = true; changed(); });

    /* ---- stars: a radio group of five (arrow keys move the rating, a click on the chosen star clears it) ---- */
    /* stars to look at: named for a screen reader as "4 of 5 stars" (label: false leaves them to the caller's name) */
    function starsShow(n, cls, onlyOn, label){
      var h = '<span class="' + cls + '" ' + (label === false ? 'aria-hidden="true"' : 'role="img" aria-label="' + starWords(n) + '"') + '>';
      for (var i = 1; i <= (onlyOn ? n : 5); i++) h += '<i' + (i <= n ? ' class="on"' : '') + '>' + ICONS.star + '</i>';
      return h + '</span>';
    }
    function starWords(n){ return n ? _t("{n} of 5 stars", { n: n }) : _t("no stars"); }
    function pickHtml(n, attrs){
      var h = "";
      for (var i = 1; i <= 5; i++){
        var tab = n ? i === n : i === 1;
        h += '<button type="button" role="radio" class="jr-star' + (i <= n ? " on" : "") + '" data-star="' + i + '"' + (attrs || "") +
             ' aria-checked="' + (i === n) + '" aria-label="' + _tn(i, "{n} star", "{n} stars") + '" tabindex="' + (tab ? "0" : "-1") + '">' + ICONS.star + '</button>';
      }
      return h;
    }
    function setPick(group, n, focus){
      if (!group) return;
      Array.prototype.forEach.call(group.querySelectorAll(".jr-star"), function(b){
        var i = +b.dataset.star;
        b.classList.toggle("on", i <= n);
        b.setAttribute("aria-checked", i === n ? "true" : "false");
        b.tabIndex = (n ? i === n : i === 1) ? 0 : -1;
      });
      if (focus){ var f = group.querySelector('.jr-star[tabindex="0"]'); if (f) f.focus({ preventScroll: true }); }
    }
    /* a key on a star: arrows one step, Home / End one and five, a digit that many, 0 / Delete / Backspace none */
    function pickKey(e, n){
      if (e.ctrlKey || e.metaKey || e.altKey) return null;
      var k = e.key;
      if (k === "ArrowRight" || k === "ArrowUp") return Math.min(5, n + 1);
      if (k === "ArrowLeft" || k === "ArrowDown") return Math.max(1, n - 1);
      if (k === "Home") return 1;
      if (k === "End") return 5;
      if (/^[0-5]$/.test(k)) return +k;
      if (k === "Delete" || k === "Backspace") return 0;
      return null;
    }
    /* a click with the pointer on the chosen star takes it back; Enter or Space (detail 0) only chooses */
    function clicked(ev, n, was){ return ev.detail && n === was ? 0 : n; }

    /* ---- the end of a book ---- */
    function atEnd(){
      if (state.mode === "pdf"){
        var n = state.pdfDoc ? state.pdfDoc.numPages : 0;
        if (n < 2) return false;
        if (state.flow === "pages") return state.pdfPageNum + (state.perPage || 1) - 1 >= n;
        return Library.currentPdfPage() >= n || readFrac() >= 0.995;
      }
      if (state.mode !== "doc") return false;
      if (state.flow === "pages") return state.totalPages > 1 && state.page >= state.totalPages - 1;
      return readFrac() >= END;
    }
    function posAtEnd(pos){
      if (!pos) return false;
      if (pos.mode === "pdf") return (pos.pdfPages || 0) > 1 && (pos.pdfPage || 1) >= pos.pdfPages - (pos.flow === "pages" ? 1 : 0);
      return (pos.frac || 0) >= END;
    }
    /* read for a while since the last card (or ever): a few minutes of reading time, or a fifth of the
       book read forward — what Stats and the pace detector have credited to it */
    function enough(id, s){
      var r = Stats.book(id);
      function since(k){ var base = s ? s[k] || 0 : 0, v = r[k] || 0; return v >= base ? v - base : v; }
      if (since("ms") >= MIN_MS) return true;
      if (state.mode === "pdf"){ var n = state.pdfDoc ? state.pdfDoc.numPages : 0; return n > 1 && since("pages") >= n * MIN_PART; }
      var w = Progress.docWords();
      return w > 0 && since("words") >= w * MIN_PART;
    }
    /* Library: a book was opened (pos: where it was restored to; fresh: "Read again", a new reading) */
    function opened(id, pos, fresh){
      close(true);
      sess = { id: id, fromEnd: posAtEnd(pos), jumpT: 0, endKey: null, endT: 0, pushed: false };
      var s = seen[id];
      if (fresh && s && !s.away){ s.away = true; s.from = today(); saveSeen(); }
    }
    /* a scroll or page turn settles; the stats' 15-second tick checks too */
    function poke(){ clearTimeout(pokeT); pokeT = setTimeout(check, 700); }
    /* a jump (a footnote or other link, the contents, a search hit, a note, the End key) is about to move the page:
       landing at the end that way is not reading to it */
    function jumped(){ if (sess) sess.jumpT = Date.now(); }
    /* where on the last pages the reader is: the card waits while it changes */
    function where(){
      if (state.mode === "pdf") return "p" + state.pdfPageNum + ":" + (state.flow === "pages" ? 0 : Math.round(window.scrollY / 40));
      return state.flow === "pages" ? "d" + state.page : "s" + Math.round(window.scrollY / 40);
    }
    /* time to read what is on the screen at the end before the card covers its foot: its words at the reader's pace
       (within 150–500 words a minute), most of it in Scroll flow, where the top of the screen has been read on the way */
    function dwell(){
      var ms;
      if (state.mode === "pdf") ms = 60000 / Math.max(0.5, Math.min(4, Progress.ppm() || 1));
      else {
        var top = Library.topCharOffset(), len = Anchor.textLength();
        var words = typeof top === "number" && len > top ? (len - top) / 6 : 150;
        ms = words / Math.max(150, Math.min(500, Progress.wpm() || 250)) * 60000 * (state.flow === "pages" ? 1 : 0.7);
      }
      return Math.max(3000, Math.min(90000, ms));
    }
    /* anything open over the page (the settings sheet, the theme popover, the menu, the dictionary card, the recap, speed
       reading, a panel) holds the card back until it closes, as does read aloud still reading the last lines */
    function covered(){
      return isOpen() || Side.current() || Menu.isOpen() || $("#pop").classList.contains("open") || $("#sheet").classList.contains("open") ||
        !!document.querySelector("#dictCard.open, #rsvp.on, #recap.on") || Speak.isPlaying();
    }
    function check(){
      clearTimeout(pokeT); pokeT = null;
      var id = Library.currentId();
      if (!id || !sess || sess.id !== id || (state.mode !== "doc" && state.mode !== "pdf")) return;
      if (document.visibilityState !== "visible" || state.opening || Library.restoring()) return;
      var s = seen[id], now = Date.now();
      if (!atEnd()){
        /* reading, not at the end: arriving there later is reaching it; back at the start after a card is a new reading */
        sess.fromEnd = false; sess.endKey = null; sess.pushed = false;
        if (s && !s.away && readFrac() <= AGAIN){ s.away = true; s.from = today(); saveSeen(); }
        return;
      }
      if (sess.jumpT && now - sess.jumpT < 5000) sess.fromEnd = true;     /* jumped there */
      sess.jumpT = 0;
      if (sess.fromEnd || covered()) return;
      if (s && !s.away) return;          /* this reading has had its card */
      if (!enough(id, s)) return;        /* opened at the end, or jumped there */
      /* the card waits until the last screen has had time to be read, or the reader tries to go on past the end */
      var key = where();
      if (sess.endKey !== key){ sess.endKey = key; sess.endT = now; }
      var left = sess.pushed ? 0 : sess.endT + dwell() - now;
      if (left > 0){ pokeT = setTimeout(check, Math.min(left, 15000) + 50); return; }
      openCard(false);
    }
    /* a page turn, a wheel or a swipe on past the end, a moment after arriving there: done reading */
    function pastEnd(){
      if (!sess || !sess.endT || !atEnd() || Date.now() - sess.endT < 1500) return;
      sess.pushed = true; check();
    }
    (function(){
      function bottom(){ var h = document.documentElement; return !pagedActive() && h.scrollHeight - h.clientHeight - h.scrollTop <= 2; }
      var y0 = null;
      window.addEventListener("wheel", function(e){ if (e.deltaY > 0 && sess && bottom()) pastEnd(); }, { passive: true });
      window.addEventListener("touchstart", function(e){ y0 = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
      window.addEventListener("touchmove", function(e){ if (y0 !== null && e.touches.length === 1 && y0 - e.touches[0].clientY > 40 && sess && bottom()){ y0 = null; pastEnd(); } }, { passive: true });
      window.addEventListener("keydown", function(e){ if (/^(ArrowDown|PageDown| |End)$/.test(e.key) && sess && bottom() && !(e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]"))) pastEnd(); });
    })();

    /* ---- the card: at the foot of the page, over the text (never inside #doc) ---- */
    function isOpen(){ return !!(card && card.classList.contains("on")); }
    function build(){
      card = document.createElement("section");
      card.id = "finish"; card.setAttribute("role", "dialog");
      card.setAttribute("aria-labelledby", "finTitle"); card.setAttribute("aria-describedby", "finBook");
      document.body.appendChild(card);
      card.addEventListener("click", function(ev){
        if (!cur) return;
        var star = ev.target.closest(".jr-star");
        if (star){ setStars(clicked(ev, +star.dataset.star, cur.stars)); return; }
        var b = ev.target.closest("button");
        if (!b) return;
        if (b.id === "finSave") save();
        else if (b.id === "finLater" || b.id === "finX") close();
      });
      card.addEventListener("keydown", function(ev){
        if (ev.key === "Escape"){ ev.preventDefault(); ev.stopPropagation(); close(); return; }
        if (ev.key === "Tab" || !cur) return;
        if (ev.target.closest && ev.target.closest(".jr-star")){
          var n = pickKey(ev, cur.stars);
          if (n !== null){ ev.preventDefault(); setStars(n, true); }
        } else if (ev.key === "Enter" && ev.target.id === "finNote"){ ev.preventDefault(); save(); }
        /* the page's own keys (page turns, single-letter shortcuts) stay out of the card */
        ev.stopPropagation();
      });
    }
    function setStars(n, focus){
      if (!cur) return;
      cur.stars = n;
      setPick(card.querySelector(".jr-pick"), n, focus);
    }
    /* asked: from the menu (focus moves in); otherwise the end was reached, and a live region says so */
    function openCard(asked){
      var id = Library.currentId();
      if (!id){ if (asked) Marks.toast(_t("Open a book first")); return; }
      var s = seen[id], edit = s && !s.away && s.entry ? byId(s.entry) : null;
      var n = edit ? { title: edit.title, author: edit.author } : nameOf(bookRec(id));
      if (!card) build();
      /* auto: it came up by itself; the reading is marked seen (once per reading) when the reader answers it, so one that
         is closed by a new file or the library comes back */
      cur = { book: id, edit: edit ? edit.id : null, stars: edit ? edit.stars : 0, auto: !asked };
      card.innerHTML =
        '<div class="recap-head">' + ICONS.finished + '<h2 class="recap-title" id="finTitle">' + _t("Finished") + '</h2>' +
          '<button type="button" class="recap-x" id="finX" title="' + _t("Close") + '" aria-label="' + _t("Close") + '">' + ICONS.close + '</button></div>' +
        '<p class="fin-book" id="finBook" data-no-i18n><span class="fin-t">' + esc(n.title) + '</span>' + (n.author ? '<span class="fin-a"> · ' + esc(n.author) + '</span>' : '') + '</p>' +
        '<div class="jr-pick fin-stars" role="radiogroup" aria-label="' + _t("Your rating") + '">' + pickHtml(cur.stars) + '</div>' +
        '<input type="text" class="jr-in" id="finNote" maxlength="' + NOTE_MAX + '" placeholder="' + _t("A few words…") + '" aria-label="' + _t("A few words about it (optional)") + '" autocomplete="off" value="' + esc(edit ? edit.note : "") + '">' +
        '<div class="rowline fin-when"><label for="finDate">' + _t("Finished on") + '</label><input type="date" class="sel" id="finDate" max="' + today() + '" value="' + (edit ? edit.finished : today()) + '"></div>' +
        '<div class="recap-acts"><button type="button" class="chip" id="finLater">' + (edit ? _t("Cancel") : _t("Not now")) + '</button>' +
          '<button type="button" class="ctl primary" id="finSave">' + _t("Save") + '</button></div>';
      card.classList.add("on");
      /* the translation pill and the toasts sit above the card while it is up (it takes their row at the foot) */
      document.body.classList.add("fin-on"); document.body.style.setProperty("--finishH", card.offsetHeight + "px");
      if (!live){ live = document.createElement("p"); live.className = "recap-live"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live); }
      live.textContent = "";
      if (asked){
        opener = document.activeElement;
        var f = card.querySelector('.jr-star[tabindex="0"]');
        if (f) f.focus({ preventScroll: true });
      } else {
        opener = null;
        setTimeout(function(){ if (isOpen()) live.textContent = _t("Finished {title}. A card at the foot of the page asks for your stars.", { title: n.title }); }, 120);
      }
    }
    function close(quiet){
      if (!isOpen()) return;
      var inside = card.contains(document.activeElement), was = cur;
      card.classList.remove("on"); card.innerHTML = ""; cur = null;
      document.body.classList.remove("fin-on"); document.body.style.removeProperty("--finishH");
      if (live) live.textContent = "";
      if (!quiet && inside){ var to = opener && document.contains(opener) && opener.getClientRects().length ? opener : $("#main"); if (to) to.focus({ preventScroll: true }); }
      opener = null;
      /* Not now (or ✕, Escape) on the card that came up by itself: not again this reading, and where to find it */
      if (!quiet && was && was.auto && !was.saved){ markSeen(was.book, null); Marks.toast(_t("You can add it later: ⋯ › Mark as finished")); }
    }
    function save(){
      if (!cur) return;
      var noteEl = card.querySelector("#finNote"), dateEl = card.querySelector("#finDate"), now = today();
      var day = dateEl && isDay(dateEl.value) && dateEl.value <= now ? dateEl.value : now;
      var note = noteEl ? noteEl.value.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "";
      var e = cur.edit ? byId(cur.edit) : null, fresh = !e;
      if (fresh){
        var b = bookRec(cur.book), n = nameOf(b), s = seen[cur.book];
        e = { id: newId(), book: cur.book, title: n.title, author: n.author, stars: 0, note: "", finished: day,
              started: startedOn(cur.book, s, b), created: Date.now() };
        list.push(e);
        if (s && !s.away){ s.entry = e.id; s.t = Date.now(); saveSeen(); } else markSeen(cur.book, e.id);
      }
      e.stars = cur.stars; e.note = note; e.finished = day;
      sort();
      put(e);
      cur.saved = true;
      close();
      Marks.toast(fresh ? _t("Added to your reading journal") : _t("Journal entry saved"));
      changed();
    }
    /* the card belongs to the book: a new file, the library or a status page closes it */
    document.addEventListener("ll:fileopened", function(){ close(true); sess = null; });
    window.addEventListener("resize", function(){ if (isOpen()) document.body.style.setProperty("--finishH", card.offsetHeight + "px"); });
    if (window.MutationObserver) new MutationObserver(function(){ if (state.mode !== "doc" && state.mode !== "pdf") close(true); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-mode"] });
    /* Escape closes the card when nothing else is open over the page */
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape" || !isOpen() || Side.current() || Menu.isOpen() || $("#pop").classList.contains("open") ||
          $("#sheet").classList.contains("open") || document.querySelector("#dictCard.open, #rsvp.on")) return;
      close();
    });

    /* ---- the panel: newest first, a group per year; a row opens to edit, open the book or delete ---- */
    function rowInner(e){
      var t = took(e);
      return '<span class="jr-t" data-no-i18n>' + esc(e.title) + '</span>' +
        (e.author ? '<span class="jr-a" data-no-i18n>' + esc(e.author) + '</span>' : '') +
        (e.stars ? starsShow(e.stars, "jr-s") : '') +
        (e.note ? '<span class="jr-n" data-no-i18n>' + esc(e.note) + '</span>' : '') +
        '<span class="jr-d">' + _t("Finished {date}", { date: dayText(e.finished) }) + (t ? " · " + t : "") + '</span>';
    }
    function editorHtml(e){
      var id = esc(e.id), d = ' data-id="' + id + '"';
      return '<div class="jr-ed" id="jrEd-' + id + '">' +
        '<div class="rowline"><span class="jr-l" id="jrSL-' + id + '">' + _t("Stars") + '</span><div class="jr-pick" role="radiogroup" aria-labelledby="jrSL-' + id + '">' +
          pickHtml(e.stars, ' data-jr="star"' + d) + '</div></div>' +
        '<div class="rowline"><label for="jrN-' + id + '">' + _t("Note") + '</label><input type="text" class="jr-in" id="jrN-' + id + '" data-jr="note"' + d +
          ' maxlength="' + NOTE_MAX + '" placeholder="' + _t("A few words…") + '" autocomplete="off" value="' + esc(e.note) + '"></div>' +
        '<div class="rowline"><label for="jrD-' + id + '">' + _t("Finished on") + '</label><input type="date" class="sel" id="jrD-' + id + '" data-jr="date"' + d +
          ' max="' + today() + '" value="' + e.finished + '" data-was="' + e.finished + '"></div>' +
        '<div class="jr-acts">' + (bookRec(e.book) ? '<button type="button" class="chip" data-jr="open"' + d + '>' + ICONS.books + '<span>' + _t("Open book") + '</span></button>' : '') +
          '<button type="button" class="chip" data-jr="del"' + d + '>' + _t("Delete") + '</button></div></div>';
    }
    function itemHtml(e){
      var open = expanded === e.id, id = esc(e.id);
      return '<li class="jr-item' + (open ? " open" : "") + '" data-id="' + id + '">' +
        '<button type="button" class="jr-row" data-jr="row" data-id="' + id + '" aria-expanded="' + open + '"' + (open ? ' aria-controls="jrEd-' + id + '"' : '') + '>' +
        rowInner(e) + '</button>' + (open ? editorHtml(e) : '') + '</li>';
    }
    function renderPanel(body, foot){
      if (!list.length){
        body.innerHTML = loaded ? emptyState(ICONS.journal, _t("No finished books yet"), _t("Books you finish appear here with your stars and a note.")) : '<div class="empty-note">' + _t("Loading…") + '</div>';
        foot.innerHTML = "";
        return;
      }
      var groups = [], at = {};
      list.forEach(function(e){
        var y = e.finished.slice(0, 4);
        if (!at[y]){ at[y] = { y: y, list: [] }; groups.push(at[y]); }
        at[y].list.push(e);
      });
      body.innerHTML = groups.map(function(g){
        return '<section class="jr-year" data-year="' + g.y + '" aria-labelledby="jrY-' + g.y + '">' +
          '<h3 class="label sec jr-yh" id="jrY-' + g.y + '">' + g.y + ' · ' + books(g.list.length) + '</h3>' +
          '<ul class="jr-list">' + g.list.map(itemHtml).join("") + '</ul></section>';
      }).join("");
      foot.innerHTML = '<button type="button" class="chip" data-jr="export">' + _t("Export") + '</button><button type="button" class="chip" data-jr="clear">' + _t("Clear journal…") + '</button>';
    }
    function selOf(a){
      if (!a || !a.dataset || !a.dataset.jr) return null;
      return '[data-jr="' + a.dataset.jr + '"]' + (a.dataset.id ? '[data-id="' + cssEsc(a.dataset.id) + '"]' : '') + (a.dataset.star ? '[data-star="' + a.dataset.star + '"]' : '');
    }
    /* redraw in place: the scroll position and the focused control survive (or sel names where focus goes) */
    function refreshPanel(sel){
      if (!Side.is("journal")) return;
      var body = Side.body, top = body.scrollTop, a = document.activeElement;
      var had = a && (body.contains(a) || Side.foot.contains(a));
      if (!sel && had) sel = selOf(a);
      Side.refresh("journal", renderPanel);
      body.scrollTop = top;
      var again = sel && (body.querySelector(sel) || Side.foot.querySelector(sel));
      if (again) again.focus({ preventScroll: true });
      else if (had && !document.contains(a)){ var first = body.querySelector(".jr-row"); (first || $("#sideClose")).focus({ preventScroll: true }); }
    }
    function openPanel(){
      expanded = null;
      Side.open("journal", _t("Reading journal"), renderPanel, function(){ expanded = null; });
    }
    function update(e, fields){
      Object.keys(fields).forEach(function(k){ e[k] = fields[k]; });
      sort(); put(e);
      try { Library.render(); } catch(_){}
      try { Stats.refresh(); } catch(_){}
    }
    function patchRow(e){
      var row = Side.body.querySelector('.jr-row[data-id="' + cssEsc(e.id) + '"]');
      if (row) row.innerHTML = rowInner(e);
    }
    function commitNote(input){
      var e = byId(input.dataset.id);
      if (!e) return;
      var v = input.value.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
      if (v !== e.note){ update(e, { note: v }); patchRow(e); }
    }
    function remove(e){
      /* a mistap would lose the stars and the note for good: asked first, as Clear journal is */
      if (!confirm(_t("Delete “{title}” from your reading journal? This can’t be undone.", { title: e.title }))) return;
      var rows = Array.prototype.slice.call(Side.body.querySelectorAll(".jr-row")), i = -1;
      rows.forEach(function(r, k){ if (r.dataset.id === e.id) i = k; });
      var next = rows[i + 1] || rows[i - 1];
      list = list.filter(function(x){ return x !== e; });
      if (expanded === e.id) expanded = null;
      Object.keys(seen).forEach(function(id){ if (seen[id].entry === e.id){ seen[id].entry = null; saveSeen(); } });
      Library.tx("journal", "readwrite", function(st){ st.delete(e.id); }).catch(function(){});
      Marks.toast(_t("Removed from your reading journal"));
      refreshPanel(next ? '[data-jr="row"][data-id="' + cssEsc(next.dataset.id) + '"]' : null);
      if (!list.length) $("#sideClose").focus({ preventScroll: true });
      try { Library.render(); } catch(_){}
      try { Stats.refresh(); } catch(_){}
    }
    /* quiet: the caller has already asked (the Storage panel's "Clear everything"), and every trace goes */
    function clear(quiet){
      if (!quiet && !confirm(_tn(list.length, "Delete all {n} book from your reading journal? This can’t be undone.", "Delete all {n} books from your reading journal? This can’t be undone."))) return Promise.resolve(false);
      list = []; expanded = null;
      if (quiet){ seen = {}; Store.remove(KEY); }
      else { Object.keys(seen).forEach(function(id){ seen[id].entry = null; }); saveSeen(); }
      var job = Library.tx("journal", "readwrite", function(st){ st.clear(); }).catch(function(){});
      if (!quiet){ Marks.toast(_t("Reading journal cleared")); changed(); }
      return job.then(function(){ return true; });
    }

    /* ---- export: Markdown, a heading per year and a line per book ---- */
    function md(x){ return String(x).replace(/\s+/g, " ").replace(/([\\`*_\[\]<>])/g, "\\$1"); }
    function toMarkdown(){
      var out = ["# " + _t("Reading journal"), "", "_" + _t("Exported from Lamplight on {date}", { date: dayText(today()) }) + "_"], year = null;
      list.forEach(function(e){
        var y = e.finished.slice(0, 4), t = took(e);
        if (y !== year){ year = y; out.push("", "## " + y, ""); }
        out.push("- **" + md(e.title) + "**" + (e.author ? " — " + md(e.author) : "") +
          (e.stars ? " · " + new Array(e.stars + 1).join("★") + new Array(6 - e.stars).join("☆") : "") +
          " · " + _t("finished {date}", { date: dayText(e.finished) }) + (t ? " · " + t : "") + (e.note ? " · " + md(e.note) : ""));
      });
      return out.join("\n") + "\n";
    }
    function exportMd(){
      if (!list.length){ Marks.toast(_t("Nothing in the journal yet")); return; }
      Marks.download("lamplight-journal.md", toMarkdown(), "text/markdown");
    }

    Side.body.addEventListener("click", function(ev){
      if (!Side.is("journal")) return;
      var t = ev.target.closest("[data-jr]");
      if (!t) return;
      var what = t.dataset.jr, e = byId(t.dataset.id);
      if (what === "row"){ expanded = expanded === t.dataset.id ? null : t.dataset.id; refreshPanel(selOf(t)); return; }
      if (!e) return;
      if (what === "star"){ update(e, { stars: clicked(ev, +t.dataset.star, e.stars) }); setPick(t.parentNode, e.stars); patchRow(e); }
      else if (what === "open"){ Side.close(); Library.openId(e.book); }
      else if (what === "del") remove(e);
    });
    Side.body.addEventListener("keydown", function(ev){
      if (!Side.is("journal")) return;
      var t = ev.target, e = t.dataset ? byId(t.dataset.id) : null;
      if (!e) return;
      if (t.dataset.jr === "star"){
        var n = pickKey(ev, e.stars);
        if (n === null) return;
        ev.preventDefault(); ev.stopPropagation();
        update(e, { stars: n }); setPick(t.parentNode, n, true); patchRow(e);
      } else if (t.dataset.jr === "note" && ev.key === "Enter"){ ev.preventDefault(); commitNote(t); }
    });
    Side.body.addEventListener("change", function(ev){
      if (!Side.is("journal")) return;
      var t = ev.target, e = t.dataset ? byId(t.dataset.id) : null;
      if (!e) return;
      if (t.dataset.jr === "note") commitNote(t);
      else if (t.dataset.jr === "date" && isDay(t.value) && t.value <= today() && t.value !== e.finished){ update(e, { finished: t.value }); patchRow(e); }
    });
    /* a new year moves the entry to its group: redrawn once the field is left */
    Side.body.addEventListener("focusout", function(ev){
      if (!Side.is("journal")) return;
      var t = ev.target, e = t.dataset && t.dataset.jr === "date" ? byId(t.dataset.id) : null;
      if (!e) return;
      if (!isDay(t.value) || t.value > today()) t.value = e.finished;
      /* not while a press is on its way to a button (that button must still be there to take the click):
         the next redraw regroups then */
      if (String(t.dataset.was).slice(0, 4) !== e.finished.slice(0, 4) && !pressing) setTimeout(function(){ refreshPanel(); }, 0);
    });
    var pressing = false;
    Side.body.addEventListener("pointerdown", function(){ pressing = true; }, true);
    ["pointerup", "pointercancel"].forEach(function(ev){ window.addEventListener(ev, function(){ pressing = false; }, true); });
    Side.foot.addEventListener("click", function(ev){
      if (!Side.is("journal")) return;
      var b = ev.target.closest("button[data-jr]");
      if (!b) return;
      if (b.dataset.jr === "export") exportMd();
      else if (b.dataset.jr === "clear") clear();
    });
    $("#libJournal").addEventListener("click", openPanel);

    Menu.add({ order: 55, group: "reading", icon: ICONS.finished, label: _t("Mark as finished"), run: function(){ openCard(true); },
               show: function(){ return (state.mode === "doc" || state.mode === "pdf") && !!Library.currentId(); } });
    Menu.add({ order: 61.5, group: "app", icon: ICONS.journal, label: _t("Reading journal"), key: "J", run: openPanel });

    /* for tests and other scripts */
    window.llJournal = { entries: function(){ return list.map(function(e){ return Object.assign({}, e); }); }, ready: ready, openPanel: openPanel,
                         openCard: function(){ openCard(true); }, closeCard: close, isOpen: isOpen, check: check, count: count,
                         toMarkdown: toMarkdown, seen: function(){ return JSON.parse(JSON.stringify(seen)); }, clear: clear };
    return { opened: opened, poke: poke, check: check, jumped: jumped, pastEnd: pastEnd, count: count, latestFor: latestFor, badge: function(id){
               var e = latestFor(id);
               if (!e) return "";
               var words = e.stars ? _t("Finished, {stars}", { stars: starWords(e.stars) }) : _t("Finished");
               return '<span class="lib-fin" role="img" title="' + words + '" aria-label="' + words + '">' + ICONS.check + (e.stars ? starsShow(e.stars, "lib-stars", true, false) : '') + '</span>';
             },
             openPanel: openPanel, openCard: openCard, clear: clear, ready: ready };
  })();

  /* ============================================================
     Reading ruler — a clear band on the current line, the rest dimmed
     ============================================================ */
  var Ruler = (function(){
    var el = $("#ruler"), top = el.querySelector(".rt"), bottom = el.querySelector(".rb"), line = el.querySelector(".rl"), grip = el.querySelector(".grip");
    var on = false, y = null, coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    function bandHeight(){ return Math.round(state.size * state.lh * 2.2); }
    function place(){
      if (!on) return;
      var h = bandHeight();
      if (y === null) y = Math.round(Library.headerHeight() + (window.innerHeight - Library.headerHeight()) * 0.38);
      var y0 = Math.max(0, y - h / 2), y1 = Math.min(window.innerHeight, y0 + h);
      top.style.height = y0 + "px"; bottom.style.height = (window.innerHeight - y1) + "px";
      line.style.top = y0 + "px"; line.style.height = (y1 - y0) + "px";
      grip.style.top = y + "px";
    }
    function set(v){ on = v; el.classList.toggle("on", on); if (on) place(); }
    function toggle(){ set(!on); if (on) Marks.toast(coarse ? _t("Drag the handle to move the ruler") : _t("The ruler follows your mouse")); }
    document.addEventListener("mousemove", function(e){ if (on && !coarse){ y = e.clientY; place(); } });
    var dragging = false;
    grip.addEventListener("touchstart", function(){ dragging = true; }, { passive: true });
    grip.addEventListener("touchmove", function(e){ if (dragging && e.touches.length){ y = e.touches[0].clientY; place(); } }, { passive: true });
    grip.addEventListener("touchend", function(){ dragging = false; });
    grip.addEventListener("mousedown", function(e){ dragging = true; e.preventDefault(); });
    document.addEventListener("mouseup", function(){ dragging = false; });
    window.addEventListener("resize", place);
    Menu.add({ order: 50, group: "reading", icon: ICONS.ruler, label: function(){ return on ? _t("Hide reading ruler") : _t("Reading ruler"); }, key: "L", run: toggle, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { toggle: toggle, set: set, isOn: function(){ return on; }, place: place };
  })();

  /* ============================================================
     Zen mode — only the text (or the PDF pages) and the thin progress line.
     body.zen hides the bar, the sheet, the pager and the readouts (app.css);
     availHeight() gives the pages the whole viewport. Not kept across reloads.
     ============================================================ */
  var Zen = (function(){
    var on = false, owned = false, toasted = false, hinted = false;
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    /* fullscreen when the browser offers it (iOS Safari has none); a refusal is fine */
    function goFull(){
      var el = document.documentElement;
      if (!el.requestFullscreen || document.fullscreenElement) return;
      try {
        var p = el.requestFullscreen({ navigationUI: "hide" });
        if (p && p.then) p.then(function(){ owned = true; if (!on) leaveFull(); }, function(){});
        else owned = true;
      } catch(_){}
    }
    function leaveFull(){
      var was = owned; owned = false;
      if (!was || !document.fullscreenElement || !document.exitFullscreen) return;
      try { var p = document.exitFullscreen(); if (p && p.catch) p.catch(function(){}); } catch(_){}
    }
    /* the header's height changes under the text in Scroll flow: note the place first, land on it after */
    function relayout(off){
      relayoutPaged();
      if (off !== null && off !== undefined && state.flow !== "pages") revealOffset(off);
    }
    function enter(){
      if (on || !docOpen()) return;
      var off = state.mode === "doc" && state.flow !== "pages" ? Library.topCharOffset() : null;
      on = true;
      setSheet(false); Side.close(); Menu.close();
      document.body.classList.remove("immersive");
      document.body.classList.add("zen");
      goFull();
      relayout(off);
      if (!toasted){ toasted = true; Marks.toast(_t("Zen mode — press z or Esc to leave")); }
    }
    function exit(){
      if (!on) return;
      var off = state.mode === "doc" && state.flow !== "pages" ? Library.topCharOffset() : null;
      on = false;
      document.body.classList.remove("zen", "hidebar");
      setSheet(false);            /* the sheet is hidden in zen; it must not spring out on the way back */
      leaveFull();
      if (docOpen()) relayout(off);
    }
    function toggle(){ if (on) exit(); else enter(); }
    /* the browser's own way out of fullscreen leaves zen too */
    document.addEventListener("fullscreenchange", function(){ if (on && !document.fullscreenElement) exit(); });
    /* Escape leaves zen only when nothing else is open; a capture listener sees the sheet, the
       panel, the card and the menu before their own Escape handlers close them */
    function somethingOpen(){
      var sheet = $("#sheet");
      return (sheet.classList.contains("open") && sheet.offsetHeight > 0) || $("#side").classList.contains("open") ||
        $("#moreMenu").classList.contains("open") || !!document.querySelector("#dictCard.open, #markPop.on");
    }
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape" || !on || somethingOpen()) return;
      exit();
    }, true);
    /* in Pages flow the middle tap toggles the bars (tapNav, registered later on the same
       elements, so this runs first): in zen it only reminds how to leave, once */
    function middleTap(e){
      /* e-ink mode's middle turns the page like the rest of the right two-thirds */
      if (!on || !pagedActive() || state.eink === true || e.target.closest("a")) return;
      var sel = window.getSelection();
      if (sel && sel.toString()) return;
      var r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      if (x < 0.35 || x > 0.65) return;
      e.stopImmediatePropagation();
      if (!hinted){ hinted = true; Marks.toast(_t("Press z or Esc to leave zen mode")); }
    }
    $("#docView").addEventListener("click", middleTap);
    $("#pdf").addEventListener("click", middleTap);
    Menu.add({ order: 52, group: "reading", icon: ICONS.zen, label: function(){ return on ? _t("Leave zen mode") : _t("Zen mode"); }, key: "Z", run: toggle, show: docOpen });
    /* for tests and other scripts */
    window.llZen = { enter: enter, exit: exit, toggle: toggle, isOn: function(){ return on; } };
    return { enter: enter, exit: exit, toggle: toggle, isOn: function(){ return on; } };
  })();

  /* ============================================================
     Print — a text document prints through the browser with the print stylesheet
     (app.css, @media print). A PDF opens in a new tab and prints from there: the
     scroll view only keeps the nearby pages drawn, so printing it would lose the rest.
     ============================================================ */
  var Print = (function(){
    var head = $("#printHead");
    function canPrint(){ return state.mode === "doc" || state.mode === "pdf"; }
    /* the open file: the File the reader opened (its tab), else the library's copy */
    function currentFile(){
      var id = Library.currentId();
      if (!id) return null;
      var tab = Tabs.list().filter(function(t){ return t.id === id; })[0];
      if (tab && tab.file) return tab.file;
      var book = Library.books().filter(function(b){ return b.id === id; })[0];
      return book && book.blob ? book.blob : null;
    }
    function title(){
      var name = $("#fname").textContent;
      if (name) return name;
      var id = Library.currentId(), book = id ? Library.books().filter(function(b){ return b.id === id; })[0] : null;
      return book ? bookName(book) : "";
    }
    function printPdf(){
      var file = currentFile();
      if (!file){ Marks.toast(_t("The PDF isn’t ready to print yet — try again in a moment")); return; }
      var blob = file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
      var url = URL.createObjectURL(blob), win = null;
      try { win = window.open(url, "_blank"); } catch(_){}
      Marks.toast(win ? _t("Opened the PDF in a new tab — print it from there") : _t("The browser blocked the new tab — allow pop-ups to print this PDF"));
      /* the tab has the file well before then; a minute covers a slow one */
      setTimeout(function(){ try { URL.revokeObjectURL(url); } catch(_){} }, 60000);
    }
    function print(){
      if (!canPrint()) return;
      Menu.close();
      if (state.mode === "pdf"){ printPdf(); return; }
      window.print();
    }
    /* the title line at the top of the printout. Pages flow lays the text out in columns
       scrolled sideways; body.printing marks a print taken from there, so the page can be
       put back afterwards (the print layout leaves the strip at its start). */
    function before(){
      head.textContent = title();
      if (state.mode === "doc" && state.flow === "pages") document.body.classList.add("printing");
    }
    function after(){
      head.textContent = "";
      if (!document.body.classList.contains("printing")) return;
      document.body.classList.remove("printing");
      /* Chrome is back on the screen layout by now; a browser still on the print one gets the
         pages measured once it switches back */
      var mq = window.matchMedia ? window.matchMedia("print") : null;
      if (!mq || !mq.matches){ relayoutPaged(); return; }
      var once = function(){
        if (mq.matches) return;
        if (mq.removeEventListener) mq.removeEventListener("change", once); else mq.removeListener(once);
        relayoutPaged();
      };
      if (mq.addEventListener) mq.addEventListener("change", once); else mq.addListener(once);
    }
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    /* Ctrl/⌘+P with a PDF open would print the reader itself, with only the drawn pages on it */
    document.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "p" || e.key === "P") && state.mode === "pdf"){ e.preventDefault(); printPdf(); }
    });
    Menu.add({ order: 70, pgroup: "app", porder: 90, group: "tools", icon: ICONS.print, label: _t("Print…"), run: print, show: canPrint });
    /* for tests and other scripts */
    window.llPrint = { print: print, canPrint: canPrint };
    return { print: print, canPrint: canPrint };
  })();

  /* ============================================================
     Auto-scroll (scroll flow) / timed page turns (pages flow)
     ============================================================ */
  var Auto = (function(){
    var bar = $("#autoBar"), speedEl = $("#autoSpeed"), playBtn = $("#autoPlay");
    var on = false, paused = false, mult = parseFloat(Store.get("ll_autoscroll") || "1") || 1, raf = null, lastT = 0, acc = 0, pageTimer = null;
    function pxPerSec(){
      /* base speed from the measured reading rate: words per second × height per word */
      var lineH = state.size * state.lh;
      var colW = Math.min(state.width, $("#docView").clientWidth || state.width);
      var wordsPerLine = Math.max(4, colW / (state.size * 0.5) / 6);   /* ~6 characters per word incl. the space */
      return (Progress.wpm() / 60) / wordsPerLine * lineH * mult;
    }
    function label(){ speedEl.textContent = dec(mult, 1) + "\u00D7"; }
    function step(t){
      if (!on || paused) return;
      if (lastT){ acc += pxPerSec() * (t - lastT) / 1000; }
      lastT = t;
      if (acc >= 1){
        var d = Math.floor(acc); acc -= d;
        var h = document.documentElement, before = h.scrollTop;
        window.scrollBy(0, d);
        if (h.scrollTop === before && before + h.clientHeight >= h.scrollHeight - 2){ stop(); Marks.toast(_t("End of document")); return; }
      }
      raf = requestAnimationFrame(step);
    }
    function schedulePage(){
      clearTimeout(pageTimer);
      if (!on || paused || state.flow !== "pages") return;
      var words = Math.max(40, Progress.docWords() / Math.max(1, state.totalPages));
      var secs = state.mode === "pdf" ? 60 / Math.max(0.2, Progress.ppm()) : words / (Progress.wpm() / 60);
      pageTimer = setTimeout(function(){
        if (!on || paused) return;
        var atEnd = state.mode === "doc" ? state.page >= state.totalPages - 1 : state.pdfPageNum >= (state.pdfDoc ? state.pdfDoc.numPages : 1);
        if (atEnd){ stop(); Marks.toast(_t("End of document")); return; }
        turn(1); schedulePage();
      }, secs * 1000 / mult);
    }
    function run(){
      cancelAnimationFrame(raf); lastT = 0; acc = 0;
      if (state.flow === "pages") schedulePage(); else raf = requestAnimationFrame(step);
    }
    function start(){
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      on = true; paused = false; bar.classList.add("on"); document.body.classList.add("auto-on"); label(); playIcon(playBtn, true); playBtn.setAttribute("aria-label", _t("Pause"));
      run();
    }
    function stop(){ on = false; paused = false; cancelAnimationFrame(raf); clearTimeout(pageTimer); bar.classList.remove("on"); document.body.classList.remove("auto-on"); }
    function pause(){ paused = true; cancelAnimationFrame(raf); clearTimeout(pageTimer); playIcon(playBtn, false); playBtn.setAttribute("aria-label", _t("Resume")); }
    function resume(){ paused = false; playIcon(playBtn, true); playBtn.setAttribute("aria-label", _t("Pause")); run(); }
    playBtn.addEventListener("click", function(){ if (paused) resume(); else pause(); });
    $("#autoStop").addEventListener("click", stop);
    $("#autoSlower").addEventListener("click", function(){ mult = Math.max(0.3, +(mult - 0.1).toFixed(1)); label(); Store.set("ll_autoscroll", String(mult)); if (on && !paused) run(); });
    $("#autoFaster").addEventListener("click", function(){ mult = Math.min(4, +(mult + 0.1).toFixed(1)); label(); Store.set("ll_autoscroll", String(mult)); if (on && !paused) run(); });
    /* a wheel or touch pauses so the reader can take over */
    window.addEventListener("wheel", function(){ if (on && !paused) pause(); }, { passive: true });
    document.addEventListener("touchstart", function(e){ if (on && !paused && !e.target.closest("#autoBar")) pause(); }, { passive: true });
    document.addEventListener("visibilitychange", function(){ if (on && document.visibilityState === "hidden") pause(); });
    Menu.add({ order: 51, group: "reading", icon: ICONS.auto, label: function(){ return on ? _t("Stop auto-scroll") : _t("Auto-scroll"); }, key: "A", run: function(){ if (on) stop(); else start(); }, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { start: start, stop: stop, pause: pause, resume: resume, isOn: function(){ return on; }, isPaused: function(){ return paused; }, pxPerSec: pxPerSec, mult: function(){ return mult; } };
  })();

  /* ============================================================
     Focus reading — the first letters of every word in bold, so the
     eye lands on each word sooner (light / medium / strong: about a
     third, half or two thirds of the letters). The letters are wrapped
     in <b class="ll-focus"> inside the text's own blocks, lazily, for
     the blocks near the screen (an IntersectionObserver), by splitting
     the text nodes in place: the concatenated text of #doc stays
     exactly what it was, so every character offset (positions,
     highlights, notes, search, read aloud) is untouched; the painted
     ranges (the sentence read aloud, search hits), which a moved node
     loses, are drawn again from those offsets. Code and preformatted text
     are left alone; only #doc is touched (never the dictionary card).
     Turning it off puts the text nodes back together.
     ============================================================ */
  var Focus = (function(){
    var LEVELS = { light: 0.3, medium: 0.45, strong: 0.6 };
    /* the units observed and bolded one at a time: blocks, and a plain-text file's paragraphs (chunk spans) */
    var UNITS = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, figcaption, caption, div, section, article, aside, span.ll-fchunk";
    /* never bolded inside these */
    var NOPE = "pre, code, kbd, samp, tt, var, textarea, script, style, svg, math, b.ll-focus, .ll-hit, .ll-tr";
    var L = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u1E00-\\u1EFF";
    var WORD = new RegExp("[" + L + "]+(?:['\\u2019][" + L + "]+)*", "g"), ANY = new RegExp("[" + L + "]");
    var applied = "";              /* the strength on the page now ("" = none) */
    var io = null, ioFlow = null, units = [], at = null, done = new WeakMap();
    var queue = [], pumping = false, relayT = null;
    var anchors = window.CSS && CSS.supports && CSS.supports("overflow-anchor", "auto");
    function wanted(){ return state.focus && state.mode === "doc" ? (LEVELS[state.focusLevel] ? state.focusLevel : "medium") : ""; }
    function isFocus(n){ return !!(n && n.nodeType === 1 && n.tagName === "B" && n.classList.contains("ll-focus")); }

    /* ---- bolding one unit: its own text nodes (nested units are theirs), each word split in place ---- */
    function textsOf(el, out){
      for (var c = el.firstChild; c; c = c.nextSibling){
        if (c.nodeType === 3){ if (ANY.test(c.data)) out.push(c); }
        else if (c.nodeType === 1 && !c.matches(NOPE) && !c.matches(UNITS)) textsOf(c, out);
      }
      return out;
    }
    /* does the text just before n (inside unit u) end on a letter? Then n starts with the rest of a word: the tail
       after a bold start, or a word cut by a highlight. A line break or an image ends a word. */
    function letterBefore(n, u){
      var p = n;
      for (;;){
        while (p && !p.previousSibling && p.parentNode && p.parentNode !== u) p = p.parentNode;
        if (!p || !p.previousSibling) return false;
        p = p.previousSibling;
        var q = p;
        while (q.nodeType === 1 && q.lastChild) q = q.lastChild;
        if (q.nodeType === 3){ if (q.length) return ANY.test(q.data.charAt(q.length - 1)); }
        else if (/^(BR|IMG|HR|WBR)$/.test(q.tagName)) return false;
      }
    }
    function boldNode(n, frac, u){
      var t = n.data, list = [], m;
      WORD.lastIndex = 0;
      while ((m = WORD.exec(t))) list.push(m.index, m[0].split(/['’]/)[0].length);
      if (list.length && list[0] === 0 && letterBefore(n, u)) list.splice(0, 2);
      /* from the last word back: n keeps the text before each word, so the offsets still hold (moving the bold start
         into its <b> collapses any live range in it: the callers paint read aloud and search again) */
      for (var i = list.length - 2; i >= 0; i -= 2){
        var a = list[i], len = list[i + 1], k = Math.min(len, Math.max(1, Math.round(len * frac)));
        if (a + k < n.length) n.splitText(a + k);
        var mid = a > 0 ? n.splitText(a) : n, b = document.createElement("b");
        b.className = "ll-focus";
        mid.parentNode.replaceChild(b, mid);
        b.appendChild(mid);
      }
    }
    function bold(u){
      if (!applied || done.get(u) === applied || !u.isConnected) return false;
      var frac = LEVELS[applied];
      textsOf(u, []).forEach(function(n){ boldNode(n, frac, u); });
      done.set(u, applied);
      if (io) io.unobserve(u);
      return true;
    }

    /* ---- a plain-text file is one text node: its paragraphs become chunk spans (the same breaks the translator
       uses, after the newline that ends a paragraph) so each can be observed and bolded on its own ---- */
    function chunkPlain(div){
      if (div.querySelector("span.ll-fchunk")) return;
      var raw = div.textContent, cuts = [], re = /\r?\n[ \t\r]*\n/g, m, last = 0;
      while ((m = re.exec(raw))){
        var c = m.index + m[0].indexOf("\n") + 1;
        /* a long stretch without blank lines is cut at line ends too, so no chunk is a whole book */
        while (c - last > 4000){ var nl = raw.lastIndexOf("\n", last + 3000); if (nl <= last) break; cuts.push(nl + 1); last = nl + 1; }
        cuts.push(c); last = c;
      }
      while (raw.length - last > 4000){ var nl2 = raw.lastIndexOf("\n", last + 3000); if (nl2 <= last) break; cuts.push(nl2 + 1); last = nl2 + 1; }
      var kids = Array.prototype.slice.call(div.childNodes), pos = 0, ci = 0, span = null;
      function fresh(){ span = document.createElement("span"); span.className = "ll-fchunk"; div.appendChild(span); }
      fresh();
      kids.forEach(function(k){
        if (k.nodeType !== 3){ span.appendChild(k); pos += (k.textContent || "").length; while (ci < cuts.length && cuts[ci] <= pos) ci++; return; }
        var start = pos, end = pos + k.length, at = [];
        while (ci < cuts.length && cuts[ci] <= start) ci++;
        while (ci < cuts.length && cuts[ci] < end){ at.push(cuts[ci] - start); ci++; }
        /* the pieces are slices of the text, each a new node, and the node itself keeps the first: splitText from the
           front would copy the rest of the book at every cut (minutes for a novel) */
        if (at.length){
          var t = k.data;
          k.deleteData(at[0], t.length - at[0]);
          span.appendChild(k);
          for (var j = 0; j < at.length; j++){ fresh(); span.appendChild(document.createTextNode(t.slice(at[j], j + 1 < at.length ? at[j + 1] : t.length))); }
        } else span.appendChild(k);
        pos = end;
        if (ci < cuts.length && cuts[ci] === end){ fresh(); ci++; }
      });
      if (!span.firstChild) div.removeChild(span);
    }

    /* ---- the queue: what came near the screen, and the units around it, a slice at a time ---- */
    function onSeen(entries){
      var any = false, ahead = state.flow === "pages" ? 160 : 40;
      entries.forEach(function(en){
        if (!en.isIntersecting) return;
        var i = at.get(en.target);
        if (i === undefined) return;
        /* a little behind and well ahead, so a page turn seldom waits for the next batch; in Pages flow much further
           ahead: every batch that changes the text makes the browser lay the whole column strip out again (100–200 ms
           for a long book), so fewer, larger batches are cheaper */
        for (var j = Math.max(0, i - 4); j < Math.min(units.length, i + ahead); j++) if (done.get(units[j]) !== applied){ queue.push(units[j]); any = true; }
      });
      if (any) pump();
    }
    function pump(){
      if (pumping) return;
      pumping = true;
      setTimeout(function(){
        pumping = false;
        if (!applied || !queue.length){ queue = []; return; }
        /* a slice of 12 ms at a time in Scroll flow; in Pages flow up to 60 ms, since each slice costs a relayout of the
           whole column strip after it */
        var t0 = Date.now(), changed = false, paged = state.flow === "pages", budget = paged ? 60 : 12;
        /* Scroll flow in a browser without scroll anchoring: text above the screen that grows must not push the
           page, so the block at the top of the screen is held where it is */
        var ref = !paged && !anchors ? topUnit() : null, top0 = ref ? ref.getBoundingClientRect().top : 0;
        /* a word's bold start is moved into its <b>, and a moved node loses the live ranges in it: the sentence read
           aloud and the search hits are painted again from their character offsets */
        keepSpeak(function(){ while (queue.length && Date.now() - t0 < budget) if (bold(queue.shift())) changed = true; });
        if (changed){
          if (window.Search && Search.repair) Search.repair();
          if (ref){ var d = ref.getBoundingClientRect().top - top0; if (Math.abs(d) > 0.5) window.scrollBy(0, d); }
          if (paged) relayout();
        }
        if (queue.length) pump();
      }, 0);
    }
    function topUnit(){
      var r = $("#doc").getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, Library.headerHeight() + 12);
      return el && el.closest && $("#doc").contains(el) ? el.closest(UNITS) : null;
    }
    /* Pages flow: bold letters are wider, so the columns are laid out again (landing on the same text) */
    function relayout(){
      clearTimeout(relayT);
      relayT = setTimeout(function(){ if (state.mode === "doc" && state.flow === "pages") relayoutDocPages(); }, 160);
    }

    /* unwrapping (and chunking a plain-text file) moves text nodes, which collapses live ranges: the sentence read
       aloud keeps its highlight by its character offsets (search paints its own again) */
    function keepSpeak(fn){
      var hl = window.CSS && CSS.highlights, saved = [];
      function at(n, o){ return n && n.nodeType === 3 ? Anchor.offsetOf(n, o) : null; }
      if (hl) ["ll-speak", "ll-speak-dialogue"].forEach(function(name){
        var h = hl.get(name);
        if (h) h.forEach(function(r){ var a = at(r.startContainer, r.startOffset), b = at(r.endContainer, r.endOffset); if (a !== null && b !== null) saved.push([name, a, b]); });
      });
      fn();
      Anchor.invalidate();
      saved.forEach(function(x){ var r = Anchor.rangeBetween(x[1], x[2]); if (r) hl.set(x[0], new Highlight(r)); });
    }
    /* ---- on, off, a new strength, a new document or flow ---- */
    function attach(){
      if (io){ io.disconnect(); io = null; }
      queue = [];
      if (!applied || state.mode !== "doc" || !window.IntersectionObserver) return;
      var doc = $("#doc");
      var fresh = Array.prototype.filter.call(doc.querySelectorAll("div.plain"), function(d){ return !d.querySelector("span.ll-fchunk"); });
      if (fresh.length){
        keepSpeak(function(){ fresh.forEach(chunkPlain); });
        if (window.Search && Search.refresh) Search.refresh();     /* search paints its own hits again (moved nodes lose them) */
      }
      units = Array.prototype.filter.call(doc.querySelectorAll(UNITS), function(u){ return !u.closest(NOPE); });
      at = new WeakMap();
      units.forEach(function(u, i){ at.set(u, i); });
      var paged = state.flow === "pages";
      ioFlow = state.flow;
      /* Pages flow: the pages either side of the one shown (the view clips the columns); Scroll flow: a screen ahead */
      io = new IntersectionObserver(onSeen, paged ? { root: $("#docView"), rootMargin: "0px 200% 0px 200%" } : { root: null, rootMargin: "25% 0px 150% 0px" });
      units.forEach(function(u){ if (done.get(u) !== applied) io.observe(u); });
    }
    function undo(){ keepSpeak(unwrapAll); }
    function unwrapAll(){
      if (io){ io.disconnect(); io = null; }
      queue = []; done = new WeakMap();
      var doc = $("#doc"), parents = [], seen = new WeakMap();
      Array.prototype.forEach.call(doc.querySelectorAll("b.ll-focus"), function(b){
        var p = b.parentNode;
        if (p && !seen.get(p)){ seen.set(p, true); parents.push(p); }
      });
      parents.forEach(flatten);
      /* a plain-text file's div: its chunks go the same way, once their bold starts are gone */
      Array.prototype.forEach.call(doc.querySelectorAll("div.plain"), function(d){ if (d.querySelector("span.ll-fchunk")) flatten(d); });
      Anchor.invalidate();
      if (window.Search && Search.refresh) Search.refresh();
    }
    /* a parent's bold starts (and a plain-text div's chunks) taken apart in one go: its children listed with those
       wrappers' contents in their place, each run of text made its first node (one append), the parent emptied at once
       and filled again. One node at a time cost a walk over a big parent's children, and an update of every live range
       on the page (500 search hits), at every step: seconds for a novel; normalize() on top copied the growing text. */
    function flatten(p){
      var out = [], run = null, rest = [], c, k;
      function end(){ if (run && rest.length) run.appendData(rest.join("")); run = null; rest = []; }
      function add(n){
        if (n.nodeType === 3){ if (run) rest.push(n.data); else { run = n; out.push(n); } }
        else { end(); out.push(n); }
      }
      for (c = p.firstChild; c; c = c.nextSibling){
        if (isFocus(c) || (c.nodeType === 1 && c.tagName === "SPAN" && c.classList.contains("ll-fchunk"))){ for (k = c.firstChild; k; k = k.nextSibling) add(k); }
        else add(c);
      }
      end();
      p.textContent = "";
      var f = document.createDocumentFragment();
      out.forEach(function(n){ if (n.nodeType !== 3 || n.length) f.appendChild(n); });
      p.appendChild(f);
    }
    /* called by applyType (and so by every text setting); cheap when nothing changed */
    function sync(){
      var w = wanted();
      if (w === applied){ if (w && ioFlow !== state.flow) attach(); return; }
      var had = !!applied;
      if (applied) undo();
      applied = w;
      if (w) attach();
      else if (had && state.mode === "doc" && state.flow === "pages") relayout();
    }
    /* a new document (or blocks added to it, such as translations): its units are gathered again; what is bold
       stays bold (done is kept per element) */
    new MutationObserver(function(){ if (applied && wanted() === applied) attach(); else sync(); }).observe($("#doc"), { childList: true });

    /* ---- the dictionary: a tapped word that is split in two (bold start, plain rest) is made one text node
       again for the lookup; again(el) bolds its unit anew once the tapped word's mark is gone ---- */
    function unsplit(n, off){
      if (!applied || !n || n.nodeType !== 3) return null;
      var b = isFocus(n.parentNode) ? n.parentNode : isFocus(n.nextSibling) && off >= n.length - 1 ? n.nextSibling :
              isFocus(n.previousSibling) && off <= 1 ? n.previousSibling : null;
      if (!b) return null;
      var t = b.firstChild, prev = b.previousSibling && b.previousSibling.nodeType === 3 ? b.previousSibling : null, p = b.parentNode;
      if (!t || !p) return null;
      var base = prev ? prev.length : 0, pos = n === t ? base + off : n === prev ? off : base + t.length + off;
      p.insertBefore(t, b); p.removeChild(b);
      p.normalize();
      Anchor.invalidate();
      var merged = prev || t, u = merged.parentNode && merged.parentNode.closest ? merged.parentNode.closest(UNITS) : null;
      if (u) done.delete(u);
      return { node: merged, offset: Math.min(pos, merged.length) };
    }
    function again(el){
      if (!applied || !el || !el.closest) return;
      var u = el.closest(UNITS);
      if (!u || !$("#doc").contains(u)) return;
      done.delete(u);
      var did = false;
      keepSpeak(function(){ did = bold(u); });
      if (did){ if (window.Search && Search.repair) Search.repair(); if (state.flow === "pages") relayout(); }
    }
    window.llFocus = { sync: sync, level: function(){ return applied; }, count: function(){ return $("#doc").querySelectorAll("b.ll-focus").length; }, unsplit: unsplit };
    return { sync: sync, unsplit: unsplit, again: again, on: function(){ return !!applied; } };
  })();

  /* ---------- the text of #doc as blocks and sentences (the recap and speed reading) ----------
     textBlocks(from, to): every innermost p / heading / li / … with the character offset of its first
     character, the way read aloud and translation see the text (a plain-text file's paragraphs, split at
     blank lines, are blocks of their own); only those that reach into [from, to) when given.
     sentenceSpans(text): [{ a, b }] the sentences of a block, offsets inside it. */
  var BLOCK_SEL = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, pre, figcaption, div.plain";
  function textBlocks(from, to){
    var doc = $("#doc"), out = [], ranged = typeof from === "number";
    var els = Array.prototype.filter.call(doc.querySelectorAll(BLOCK_SEL), function(b){ return !b.querySelector(BLOCK_SEL); });
    if (!els.length) els = [doc];
    els.forEach(function(el){
      var first = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      if (!first) return;
      var base = Anchor.offsetOf(first, 0);
      if (base === null) return;
      var text = el.textContent, heading = /^H[1-6]$/.test(el.tagName);
      if (ranged && (base + text.length <= from || base >= to)) return;
      function push(a, b){
        if (ranged && (base + b <= from || base + a >= to)) return;
        if (/\S/.test(text.slice(a, b))) out.push({ start: base + a, text: text.slice(a, b), heading: heading });
      }
      if (el.classList.contains("plain") || el.tagName === "PRE"){
        var re = /\r?\n[ \t\r]*\n/g, m, pos = 0;
        while ((m = re.exec(text))){ push(pos, m.index); pos = m.index + m[0].length; }
        push(pos, text.length);
      } else push(0, text.length);
    });
    return out;
  }
  /* English, and the common Dutch ones (dhr. Jansen, mevr., mr., blz., o.a., d.w.z.): not a sentence's end */
  var ABBREV = /(?:^|[\s(“"„])(?:Mr|Mrs|Ms|Mx|Dr|St|Sr|Jr|Prof|Rev|Gen|Col|Capt|Lt|Sgt|Mt|Messrs|Mme|Mlle|vs|etc|viz|cf|ca|approx|No|Nos|Vol|pp?|ch|fig|e\.g|i\.e|[A-Z]|[Dd]hr|[Mm]evr|mr|dr|[Dd]rs|[Ii]r|[Ii]ng|prof|[Bb]lz|[Bb]ijv|[Ee]nz|[Nn]r|[Oo]\.a|[Dd]\.w\.z|[Mm]\.a\.w|[Ii]\.p\.v|[Tt]\.o\.v|[Zz]\.g\.a\.n|resp|jl)\.$/;
  function sentenceSpans(text){
    var out = [], start = 0, re = /[.!?…]+["'”’»)\]]*(?=\s|$)/g, m;
    function push(a, b){
      var s = text.slice(a, b), lead = s.length - s.replace(/^\s+/, "").length, trail = s.length - s.replace(/\s+$/, "").length;
      if (b - trail > a + lead) out.push({ a: a + lead, b: b - trail });
    }
    while ((m = re.exec(text))){
      var end = m.index + m[0].length;
      if (m[0] === "." && ABBREV.test(text.slice(Math.max(start, m.index - 12), m.index + 1))) continue;
      /* “Wait!” she said — a lower-case word after the stop carries the sentence on */
      var next = /\S/.exec(text.slice(end, end + 40));
      if (next && /[a-z]/.test(next[0])) continue;
      push(start, end); start = end;
    }
    push(start, text.length);
    return out;
  }

  /* ============================================================
     Previously… — a short recap of the last reading session. Every book
     keeps its sessions (where reading started and stopped, and when:
     Library's position saves feed them). A book opened again, or a tab
     come back to, after two hours or more shows a card over the top of
     the text: the time away, three to five key sentences of what was
     read last time (extractive: content words that recur in the span,
     the characters in them, where they sit; spread across a long span),
     and the characters who appeared (audiobook.js's attribute(), when it
     loads). The menu's "Previously…" shows it at any time. Text
     documents, and PDFs from their pages' text.
     ============================================================ */
  var Recap = (function(){
    var KEY = "ll_recap", GAP = 2 * 3600000, MIN_WORDS = 150, KEEP = 8, BOOKS = 60, MAX_PDF_PAGES = 30;
    var data = load(), cur = null, sitting = -1, checked = null, saveT = null;
    var card = null, cardSess = null, speakGen = 0, opener = null, live = null;

    /* ---- sessions: { a, b, e, t0, t1 } per book — character offsets (a PDF: page numbers) and times: a and b where the top
       of the screen started and got to (how far the reader moved), e the end of the furthest screen (what was read) ---- */
    function load(){
      var o = null, out = { v: 1, books: {} };
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      if (!o || typeof o !== "object" || !o.books || typeof o.books !== "object") return out;
      Object.keys(o.books).forEach(function(id){
        var b = o.books[id];
        if (!b || !Array.isArray(b.s) || (b.m !== "doc" && b.m !== "pdf")) return;
        var s = b.s.filter(function(x){ return x && isFinite(x.a) && isFinite(x.b) && isFinite(x.t0) && isFinite(x.t1); })
          .map(function(x){ var o = { a: +x.a, b: +x.b, t0: +x.t0, t1: +x.t1 }; if (isFinite(x.e) && +x.e > o.b) o.e = +x.e; return o; });
        if (s.length) out.books[id] = { m: b.m, s: s.slice(-KEEP) };
      });
      return out;
    }
    function save(){
      clearTimeout(saveT); saveT = null;
      var ids = Object.keys(data.books);
      if (ids.length > BOOKS){
        ids.sort(function(x, y){ var a = data.books[x].s, b = data.books[y].s; return a[a.length - 1].t1 - b[b.length - 1].t1; });
        ids.slice(0, ids.length - BOOKS).forEach(function(id){ delete data.books[id]; });
      }
      Store.set(KEY, JSON.stringify(data));
    }
    function later(){ if (!saveT) saveT = setTimeout(save, 2000); }
    function list(id, mode){
      var b = data.books[id];
      if (!b || b.m !== mode) b = data.books[id] = { m: mode, s: [] };
      return b.s;
    }
    /* roughly how many words a session spans (the real count is taken from the text when a recap is made) */
    function guess(x, mode){ return mode === "pdf" ? (x.b - x.a + 1) * 250 : (x.b - x.a) / 6; }
    /* the latest session up to index i with enough reading in it, staying inside one sitting (a jump makes a
       new session; a short one after it falls back on the one before) */
    function pick(s, i, mode){
      for (; i >= 0; i--){
        if (guess(s[i], mode) >= MIN_WORDS) return i;
        if (i > 0 && s[i].t0 - s[i - 1].t1 >= GAP) return -1;
      }
      return -1;
    }

    /* Library saves a position (a scroll or page turn settled, the tab hidden, the page left) */
    function note(pos){
      if (!pos || !pos.id || checked !== pos.id) return;
      var at = pos.mode === "pdf" ? pos.pdfPage : pos.off, now = pos.updated || Date.now();
      if (typeof at !== "number" || !isFinite(at)) return;
      /* what was on screen below its top line was read too: the latest screen is where the reader stopped */
      var end = pos.mode !== "pdf" && typeof pos.offEnd === "number" && isFinite(pos.offEnd) && pos.offEnd > at ? pos.offEnd : at;
      var s = list(pos.id, pos.mode), x = cur && cur.id === pos.id ? cur.x : null;
      /* a jump (contents, search, a long way back) starts a new session */
      if (x && (pos.mode === "pdf" ? at < x.a - 2 || at > x.b + 25 : at < x.a - 3000 || at > x.b + 40000)) x = null;
      if (!x){
        x = { a: at, b: at, e: end, t0: now, t1: now };
        s.push(x);
        while (s.length > KEEP){ s.shift(); if (sitting > 0) sitting--; }
        cur = { id: pos.id, x: x };
      } else { x.b = Math.max(x.b, at); x.e = Math.max(x.e || x.b, end); x.t1 = now; }
      later();
    }
    /* a book is open and its text (or its PDF) is in: two hours or more since it was last read shows the card */
    function check(){
      var id = Library.currentId();
      if (!id || checked === id) return;
      if (!(state.mode === "doc" && !state.opening) && !(state.mode === "pdf" && state.pdfDoc)) return;
      checked = id;
      var s = list(id, state.mode), last = s[s.length - 1], now = Date.now();
      if (last && now - last.t1 < GAP){ cur = { id: id, x: last }; sitting = s.length - 1; return; }
      cur = null; sitting = s.length;
      if (last){ var i = pick(s, s.length - 1, state.mode); if (i >= 0) show(s[i], false); }
    }
    document.addEventListener("visibilitychange", function(){
      if (document.visibilityState === "hidden"){ if (saveT) save(); return; }
      var id = Library.currentId();
      if (!cur || !id || cur.id !== id || checked !== id || Date.now() - cur.x.t1 < GAP) return;
      var s = list(id, state.mode), i = pick(s, s.indexOf(cur.x), state.mode);
      cur = null; sitting = s.length;
      if (i >= 0) show(s[i], false);
    });
    window.addEventListener("pagehide", function(){ if (saveT) save(); });
    document.addEventListener("ll:fileopened", function(){ close(true); checked = null; cur = null; sitting = -1; if (saveT) save(); });
    function forget(id){ if (data.books[id]){ delete data.books[id]; save(); } }

    /* ---- the menu: the last sitting's recap (before this one), else this one's so far ---- */
    function onDemand(){
      var id = Library.currentId();
      if (!id){ Marks.toast(_t("Open a book first")); return; }
      check();
      var s = list(id, state.mode), i = -1;
      if (sitting > 0) i = pick(s, Math.min(sitting, s.length) - 1, state.mode);
      if (i < 0) i = pick(s, s.length - 1, state.mode);
      if (i < 0){ Marks.toast(_t("Nothing to recap yet — read a little further first")); return; }
      show(s[i], true);
    }

    /* ---- what was read: its blocks (with offsets), its words, and read-aloud units for attribute() ---- */
    var STOP = {};
    ("a about above after again against ago all almost along also although always am among an and another any anyone anything are around as at away back be " +
     "became because become been before began behind being below beside besides best better between both but by came can cannot could did do does doing done " +
     "down during each either else enough even ever every everything far few first for from further gave get gets getting give go goes going gone good got " +
     "had has have having he her here hers herself him himself his how however i if in indeed inside into is it its itself just keep kept knew know known " +
     "last least left less let like little long look looked looking made make many may maybe me might mine more most much must my myself near nearly neither " +
     "never next no nobody none nor not nothing now of off often oh on once one only onto or other others ought our ours ourselves out over own perhaps put " +
     "quite rather really right said same saw say saying says see seem seemed seen shall she should since so some something sometimes soon still such sure " +
     "take taken than that the their theirs them themselves then there these they thing things think this those though thought three through thus till " +
     "to together too took toward towards turn turned two under until up upon us very want wanted was way we well went were what whatever when where whether " +
     "which while who whom whose why will with within without would yes yet you your yours yourself yourselves asked answered replied told tell cried " +
     "mr mrs miss sir lady").split(" ").forEach(function(w){ STOP[w] = 1; });
    var STOP_EN = STOP;
    /* a Dutch book's function words too (old spellings included): the English list and these, for text that is Dutch */
    var STOP_NL = Object.assign({}, STOP);
    ("aan achter al alle alles als alsof altijd ander andere anders ben bij bijna binnen daar daarom daarna dan dat de den der des deze die dien dit " +
     "doch doen door dus een eene eens eer eigen en ene enige er ge geen geweest gij haar had heb hebben heeft hem hen het hier hij hoe hun hunne iemand " +
     "iets ik in is ja je jij jou jullie kan kon konden kunnen later maar me meer men met mij mijn moest moet mogen na naar niet niets nog nooit nu of " +
     "om omdat ondat onder ons onze ook op over reeds sinds te tegen toch toe toen tot u uit uw van veel voor vooral waar waarom wanneer want waren was " +
     "wat we weer wel werd werden wezen wie wij wil wilde worden wordt zal zeer zei zeide zeg zegt zelf zich zij zijn zijne zo zoals zoo zonder zou " +
     "zouden zullen zien zag riep vroeg antwoordde sprak mevrouw meneer mijnheer juffrouw heer nee neen nou even wat eerst").split(" ").forEach(function(w){ STOP_NL[w] = 1; });
    /* Dutch when its commonest words outnumber English ones in the span */
    function dutch(cands){
      var nl = 0, en = 0, NL = { de: 1, het: 1, een: 1, en: 1, van: 1, niet: 1, dat: 1, zijn: 1, met: 1, zich: 1, haar: 1, hij: 1 },
          EN = { the: 1, and: 1, of: 1, to: 1, was: 1, that: 1, with: 1, his: 1, her: 1, not: 1, he: 1, she: 1 };
      for (var i = 0; i < cands.length && nl + en < 4000; i++) cands[i].toks.forEach(function(w){ if (NL[w]) nl++; else if (EN[w]) en++; });
      return nl > en;
    }
    function stem(w){
      w = w.replace(/’/g, "'").replace(/'s$/, "");
      if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
      if (w.length > 4 && /[^s]s$/.test(w)) return w.slice(0, -1);
      return w;
    }
    function words(t){ return (t.match(/\S+/g) || []).length; }
    /* a long span is read in windows spread across it (enough to choose from, cheap however long) */
    function windows(a, b){
      if (b - a <= 60000) return [[a, b]];
      var n = 6, w = 8000, out = [];
      for (var i = 0; i < n; i++){ var end = Math.round(a + (b - a) * (i + 1) / n); out.push([end - w, end]); }
      return out;
    }
    function gatherDoc(x){
      var lo = Math.max(0, Math.min(x.a, x.b)), hi = Math.max(x.a, x.b, x.e || 0), wins = windows(lo, hi), blocks = [], count = 0;
      wins.forEach(function(w){
        textBlocks(w[0], w[1]).forEach(function(bk){
          var end = bk.start + bk.text.length, s0 = Math.max(bk.start, w[0]), s1 = Math.min(end, w[1]);
          var t = bk.text.slice(s0 - bk.start, s1 - bk.start), m;
          /* a block cut by the span's edge loses its broken first or last sentence */
          if (s0 > bk.start){
            m = /[.!?…]["'”’»)\]]*\s+/.exec(t);
            if (!m) return;
            s0 += m.index + m[0].length; t = t.slice(m.index + m[0].length);
          }
          if (s1 < end){
            var re = /[.!?…]["'”’»)\]]*(?=\s)/g, cut = -1;
            while ((m = re.exec(t))) cut = m.index + m[0].length;
            if (cut < 0) return;
            t = t.slice(0, cut);
          }
          if (!t.trim()) return;
          blocks.push({ start: s0, text: t, heading: bk.heading });
          count += words(t);
        });
      });
      if (wins.length > 1) count = Math.round((hi - lo) / 6);
      return Promise.resolve({ blocks: blocks, words: count, lo: lo, hi: hi });
    }
    function gatherPdf(x){
      var lo = Math.max(1, Math.min(x.a, x.b)), hi = Math.max(x.a, x.b), pages = [], i;
      if (state.pdfDoc) hi = Math.min(hi, state.pdfDoc.numPages);
      if (hi - lo + 1 <= MAX_PDF_PAGES) for (i = lo; i <= hi; i++) pages.push(i);
      else for (i = 0; i < MAX_PDF_PAGES; i++) pages.push(Math.round(lo + (hi - lo) * i / (MAX_PDF_PAGES - 1)));
      return Promise.all(pages.map(function(n){ return PdfText.get(n); })).then(function(texts){
        var blocks = [], pos = 0, count = 0;
        texts.forEach(function(t, k){
          t = String(t || "").replace(/-\n(?=[a-z])/g, "").replace(/\s*\n\s*/g, " ").trim();
          if (!t) return;
          blocks.push({ start: pos, text: t, heading: false, page: pages[k] });
          pos += t.length + 1; count += words(t);
        });
        return { blocks: blocks, words: count, lo: 0, hi: pos };
      });
    }
    /* read-aloud units for the span (Speak's own splitting), for attribute() */
    function unitsOf(blocks){
      var S = window.llSpeak, out = [];
      if (!S || !S.plan) return out;
      /* dialogue written with dashes is decided over the span, as Speak decides it over the document */
      var dashes = S.dashStyle ? S.dashStyle(blocks.map(function(bk){ return bk.text; })) : undefined;
      blocks.forEach(function(bk){
        if (bk.heading) return;
        S.plan(bk.text, dashes).forEach(function(u){
          u.start += bk.start; u.end += bk.start; u.para = (u.para || 0) + bk.start;
          if (bk.page) u.page = bk.page;
          out.push(u);
        });
      });
      return out;
    }
    /* the characters who speak in the span, most present first (audiobook.js, loaded on demand) */
    function castOf(blocks){
      var units = unitsOf(blocks);
      if (!units.some(function(u){ return u.dialogue; })) return Promise.resolve([]);
      return need(["audiobook"]).then(function(){
        var A = window.llAudiobook;
        if (!A || !A.attribute) return [];
        return (A.attribute(units).cast || []).filter(function(c){ return !c.anon && !c.synthetic && c.name; })
          .sort(function(p, q){ return (q.lines + (q.mentions || 0)) - (p.lines + (p.mentions || 0)); }).slice(0, 6);
      }).catch(function(){ return []; });
    }

    /* ---- the key sentences: scored by the content words that recur in the span, the characters they name and
       where they sit (later is fresher; a paragraph's first sentence often says what it is about); one from each
       part of the span, so a long one is covered end to end; kept in reading order ---- */
    function summarize(g, cast){
      var cands = [], freq = {}, df = {}, total = 0;
      g.blocks.forEach(function(bk){
        if (bk.heading) return;
        sentenceSpans(bk.text).forEach(function(sp, k){
          /* a line of dialogue after a dash ("— Kom binnen!") is shown and read without the dash */
          var raw = bk.text.slice(sp.a, sp.b), text = raw.replace(/\s+/g, " ").trim().replace(/^[—–]\s*/, "");
          var toks = (text.toLowerCase().match(/[a-zà-ɏ][a-zà-ɏ'’-]*/g) || []).map(stem);
          cands.push({ start: bk.start + sp.a, text: text, first: k === 0, n: words(text), toks: toks });
        });
      });
      if (!cands.length) return [];
      var STOP = dutch(cands) ? STOP_NL : STOP_EN;
      cands.forEach(function(s){
        var seen = {};
        s.toks.forEach(function(w){ if (w.length < 3 || STOP[w]) return; freq[w] = (freq[w] || 0) + 1; if (!seen[w]){ seen[w] = 1; df[w] = (df[w] || 0) + 1; } });
        total++;
      });
      /* names: the characters found, and capitalised words that recur away from a sentence's start */
      var names = {}, caps = {};
      cast.forEach(function(c){ String(c.name).split(/\s+/).concat(c.aka || []).forEach(function(w){ w = String(w).replace(/[^\wÀ-ɏ'-]/g, ""); if (w.length > 1 && !STOP[w.toLowerCase()]) names[w] = c.key; }); });
      cands.forEach(function(s){
        var m, re = /[\s“"‘„‚«(]([A-Z][a-zà-ɏ]{2,})\b/g;
        while ((m = re.exec(" " + s.text.slice(1)))) caps[m[1]] = (caps[m[1]] || 0) + 1;
      });
      Object.keys(caps).forEach(function(w){ if (caps[w] >= 3 && !STOP[w.toLowerCase()] && !names[w]) names[w] = w; });
      var nameRe = Object.keys(names).length ? new RegExp("\\b(" + Object.keys(names).map(function(w){ return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")\\b", "g") : null;
      var span = Math.max(1, g.hi - g.lo), common = total >= 12 ? total * 0.35 : Infinity, seenText = {};
      cands.forEach(function(s){
        var score = 0, uniq = {}, m;
        s.toks.forEach(function(w){ if (w.length >= 3 && !STOP[w] && !uniq[w] && freq[w] >= 2 && df[w] <= common){ uniq[w] = 1; score += Math.log(1 + freq[w]); } });
        score /= Math.sqrt(Math.max(6, s.n));
        var who = {};
        if (nameRe){ nameRe.lastIndex = 0; while ((m = nameRe.exec(s.text))) who[names[m[1]]] = 1; }
        score += 0.35 * Math.min(2, Object.keys(who).length);
        score += 0.25 * Math.max(0, Math.min(1, (s.start - g.lo) / span)) + (s.first ? 0.12 : 0);
        if (s.n < 7) score *= 0.5; else if (s.n > 45) score *= 0.7;
        /* a fragment: not a sentence's start (a capital, after an opening quote of any kind; Dutch 's and 't) or end */
        if (!/^(?:[“"‘'„‚«»(]?[A-Z0-9À-ɏ]|['’‘][st]\s)/.test(s.text) || !/[.!?…]["'”’»)\]]*$/.test(s.text)) score *= 0.4;
        if (/^(chapter|part|book|section|hoofdstuk)\b/i.test(s.text) || s.text.length > 320 || s.text.length < 25) score = -1;
        var key = s.text.toLowerCase();
        if (seenText[key]) score = -1;
        seenText[key] = 1;
        s.score = score;
      });
      var ok = cands.filter(function(s){ return s.score > 0; });
      var n = Math.min(ok.length, g.words < 700 ? 3 : g.words < 2500 ? 4 : 5), picked = [];
      for (var k = 0; k < n; k++){
        var a = g.lo + span * k / n, b = g.lo + span * (k + 1) / n, best = null;
        ok.forEach(function(s){ if (s.start >= a && s.start < b && picked.indexOf(s) < 0 && (!best || s.score > best.score)) best = s; });
        if (best) picked.push(best);
      }
      ok.slice().sort(function(p, q){ return q.score - p.score; }).forEach(function(s){ if (picked.length < n && picked.indexOf(s) < 0) picked.push(s); });
      return picked.sort(function(p, q){ return p.start - q.start; }).map(function(s){ return { start: s.start, text: s.text }; });
    }
    /* the recap of a session, or null when too little was read */
    function build(x, mode){
      return (mode === "pdf" ? gatherPdf(x) : gatherDoc(x)).then(function(g){
        if (g.words < MIN_WORDS) return null;
        return castOf(g.blocks).then(function(cast){ return { sentences: summarize(g, cast), cast: cast, words: g.words }; });
      });
    }

    /* ---- the card: over the top of the text (never inside #doc, whose text must stay as it is) ---- */
    function ago(t){
      var now = Date.now(), d = now - t, m = Math.round(d / 60000), h = Math.round(d / 3600000);
      if (m < 2) return _t("a moment ago");
      if (m < 60) return _t("{n} minutes ago", { n: m });
      var a = new Date(t), b = new Date(now), days = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
      if (days === 0 || h < 12) return h === 1 ? _t("an hour ago") : _t("{n} hours ago", { n: h });
      if (days === 1) return _t("yesterday");
      if (days < 31) return _t("{n} days ago", { n: days });
      /* the month in the interface's language, as the words around it are */
      return _t("on {date}", { date: I18N.date(a, a.getFullYear() === b.getFullYear() ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" }) });
    }
    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    var gen = 0;
    function show(x, asked){
      var mode = state.mode, id = Library.currentId(), my = ++gen;
      build(x, mode).then(function(r){
        if (my !== gen || Library.currentId() !== id || state.mode !== mode) return;
        if (!r || !r.sentences.length){ if (asked) Marks.toast(_t("Nothing to recap yet — read a little further first")); return; }
        render(x, r, asked);
      }).catch(function(err){ console.warn("recap", err); if (asked) Marks.toast(_t("Couldn’t make a recap")); });
    }
    function render(x, r, asked){
      stopSpeech();
      if (!card){
        card = document.createElement("section");
        card.id = "recap"; card.setAttribute("aria-labelledby", "recapTitle");
        /* fixed at the top of the screen, and before the book in reading order too, so a screen reader's next swipe after
           the bar reaches it ("at the top of the page") rather than after the whole text */
        var main = $("#main");
        if (main && main.parentNode === document.body) document.body.insertBefore(card, main); else document.body.appendChild(card);
        card.addEventListener("click", function(e){
          var b = e.target.closest("button");
          if (!b) return;
          if (b.id === "recapRead") toggleSpeech();
          else if (b.id === "recapGo" || b.id === "recapX") close();
        });
        card.addEventListener("keydown", function(e){ if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(); } });
      }
      cardSess = { x: x, r: r };
      var names = r.cast.map(function(c){ return c.name; });
      card.innerHTML =
        '<div class="recap-head">' + ICONS.recap + '<h2 class="recap-title" id="recapTitle">' + _t("Previously…") + '</h2>' +
          '<span class="recap-ago">' + esc(ago(x.t1)) + '</span>' +
          '<button type="button" class="recap-x" id="recapX" title="' + _t("Close") + '" aria-label="' + _t("Close the recap") + '">' + ICONS.close + '</button></div>' +
        '<ol class="recap-list" lang="' + bookLang() + '" data-no-i18n>' + r.sentences.map(function(s){ return '<li>' + esc(s.text) + '</li>'; }).join("") + '</ol>' +
        (names.length ? '<p class="recap-who"><span class="label">' + _t("Characters") + '</span> <span lang="' + bookLang() + '" data-no-i18n>' + names.map(esc).join(" · ") + '</span></p>' : '') +
        '<div class="recap-acts">' +
          (Speak.supported ? '<button type="button" class="chip" id="recapRead" aria-pressed="false">' + ICONS.speaker + '<span>' + _t("Read it aloud") + '</span></button>' : '') +
          '<button type="button" class="ctl primary" id="recapGo">' + _t("Continue") + '</button></div>';
      card.classList.add("on");
      /* said once by a screen reader: the live region exists before its words arrive */
      if (!live){ live = document.createElement("p"); live.className = "recap-live"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live); }
      live.textContent = "";
      setTimeout(function(){ if (card.classList.contains("on")) live.textContent = _t("Previously: a recap of your last reading, {when}, is at the top of the page.", { when: ago(x.t1) }); }, 120);
      if (asked){ opener = document.activeElement; var go = card.querySelector("#recapGo"); if (go) go.focus({ preventScroll: true }); }
    }
    function close(quiet){
      if (!card || !card.classList.contains("on")) return;
      stopSpeech();
      var inside = card.contains(document.activeElement);
      card.classList.remove("on"); card.innerHTML = ""; cardSess = null;
      if (live) live.textContent = "";
      if (!quiet && inside){ var to = opener && document.contains(opener) && opener.getClientRects().length ? opener : $("#main"); if (to) to.focus({ preventScroll: true }); }
      opener = null;
    }
    /* Escape closes the card when nothing else is open over the page */
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape" || !card || !card.classList.contains("on") || Side.current() || Menu.isOpen() || $("#pop").classList.contains("open") ||
          $("#sheet").classList.contains("open") || document.querySelector("#dictCard.open, #rsvp.on")) return;
      close();
    });
    /* the library, or a PDF turned into a page of status: the card belongs to the book */
    if (window.MutationObserver) new MutationObserver(function(){ if (state.mode !== "doc" && state.mode !== "pdf") close(true); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-mode"] });

    /* ---- read it aloud: the device voice read aloud uses (its narrator, speed and pitch); the natural and
       ElevenLabs engines make a whole book's plan, so a recap is not theirs to read ---- */
    function speechBtn(on){
      var b = card && card.querySelector("#recapRead");
      if (!b) return;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.querySelector("span").textContent = on ? _t("Stop") : _t("Read it aloud");
    }
    function stopSpeech(){
      if (!speakGen) return;
      speakGen = 0;
      try { speechSynthesis.cancel(); } catch(_){}
      speechBtn(false);
    }
    /* the words around the sentences, in the book's language (they are said in its voice); none for other languages */
    var FRAME = { en: ["Previously.", "Characters: "], nl: ["Vorige keer.", "Personages: "] };
    function toggleSpeech(){
      if (speakGen){ stopSpeech(); return; }
      if (!cardSess || !Speak.supported) return;
      /* the book's own read aloud pauses for the recap (its bar stays, to play on from) */
      if (Speak.isPlaying()) Speak.pause();
      var r = cardSess.r, S = window.llSpeak, v = S && S.currentVoice ? S.currentVoice() : null, rate = Speak.rate ? Speak.rate() : 1;
      var fr = FRAME[Speak.docLang()] || ["", ""];
      var lines = (fr[0] ? [fr[0]] : []).concat(r.sentences.map(function(s){ return s.text; }));
      if (r.cast.length && fr[1]) lines.push(fr[1] + r.cast.map(function(c){ return c.name; }).join(", ") + ".");
      var my = speakGen = Date.now(), i = 0;
      try { speechSynthesis.cancel(); } catch(_){}
      speechBtn(true);
      (function next(){
        if (speakGen !== my) return;
        /* read aloud started again (its Play) takes over; paused, it waits */
        if (i >= lines.length || Speak.isPlaying()){ speakGen = 0; speechBtn(false); return; }
        var u = new SpeechSynthesisUtterance(lines[i++].replace(/[“”"]/g, ""));
        if (v){ u.voice = v; u.lang = v.lang; } else u.lang = Speak.docLang();
        u.rate = Math.max(0.5, Math.min(2, rate));
        u.onend = function(){ setTimeout(next, 250); };
        u.onerror = function(){ if (speakGen === my){ speakGen = 0; speechBtn(false); } };
        speechSynthesis.speak(u);
      })();
    }

    Menu.add({ order: 42, quick: 4, group: "reading", icon: ICONS.recap, label: _tc("menu", "Previously…"), run: onDemand, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    window.llRecap = { summarize: summarize, sentences: sentenceSpans, blocks: textBlocks, sessions: function(id){ var b = data.books[id || Library.currentId()]; return b ? b.s.slice() : []; },
                       show: onDemand, close: close, ago: ago, isOpen: function(){ return !!(card && card.classList.contains("on")); }, speaking: function(){ return !!speakGen; },
                       build: function(x){ return build(x, state.mode); }, GAP: GAP };
    return { note: note, check: check, forget: forget, show: onDemand, close: close };
  })();

  /* ============================================================
     Speed reading — one word at a time (RSVP), each centred on its
     optimal recognition point (that letter in the accent colour, under
     a small guide mark), from the reading position on. Space or a tap
     plays and pauses, ← → go back or on a sentence, ↑ ↓ change the
     speed (150–900 words a minute, remembered), Esc closes — and the
     book then continues from the word it stopped at. Commas, sentence
     ends, paragraphs, headings and long words hold a little longer.
     ============================================================ */
  var Rsvp = (function(){
    var KEY = "ll_rsvp_wpm", MIN = 150, MAX = 900, STEP = 25;
    var F_SENT = 1, F_PARA = 2, F_HEAD = 4, F_PAUSE = 8, F_CONT = 16;     /* F_CONT: a long word goes on in the next frame */
    var LET = "0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ", LETTER = new RegExp("[" + LET + "]"), LETTERS = new RegExp("[" + LET + "]", "g");
    var wpm = clampWpm(parseInt(Store.get(KEY) || "300", 10));
    var toks = null, i = 0, playing = false, timer = null, ramp = 0, open = false, opener = null, held = [], shown = 0, hist = false, backing = false, srWas = null;
    var el = null, wordEl = null, lEl = null, oEl = null, rEl = null, barEl = null, playBtn = null, wpmEl = null, wpmV = null, ctxEl = null, whereEl = null;
    function clampWpm(v){ v = isFinite(v) ? v : 300; return Math.max(MIN, Math.min(MAX, Math.round(v / STEP) * STEP)); }

    /* ---- the words of the document, with their offsets, and where sentences start ---- */
    function build(){
      var key = (Library.currentId() || "") + ":" + Anchor.textLength();
      if (toks && toks.key === key) return toks;
      var t = { key: key, w: [], s: [], f: [], sent: [], cum: [0] };
      textBlocks().forEach(function(bk){
        var spans = sentenceSpans(bk.text), si = 0, re = /\S+/g, m, fresh = true, last = -1;
        while ((m = re.exec(bk.text))){
          var a = m.index, e = a + m[0].length, f = 0;
          if (fresh){ t.sent.push(t.w.length); fresh = false; }
          while (si < spans.length && spans[si].b < e) si++;
          if (si < spans.length && spans[si].b === e){ f |= F_SENT; fresh = true; }
          /* a comma, a dash, and a question or an exclamation that the sentence carries on after ("„Waarom?” vroeg zij") */
          else if (/[,;:?!…]["'”’»)\]]*$|[—–]$|^[—–]$/.test(m[0])) f |= F_PAUSE;
          /* a long word (a Dutch compound) in two or three frames, each ending in a hyphen but the last */
          var cut = parts(m[0]);
          for (var k = 0; k < cut.length - 1; k++){
            var piece = m[0].slice(cut[k], cut[k + 1]);
            t.w.push(/-$/.test(piece) ? piece : piece + "-"); t.s.push(bk.start + a + cut[k]); t.f.push(F_CONT);
          }
          last = t.w.length;
          t.w.push(m[0].slice(cut[cut.length - 1])); t.s.push(bk.start + a + cut[cut.length - 1]); t.f.push(f);
        }
        if (last >= 0) t.f[last] |= F_SENT | F_PARA | (bk.heading ? F_HEAD : 0);
      });
      /* the beats up to each word, for the time left */
      for (var k = 0; k < t.w.length; k++) t.cum.push(t.cum[k] + beats(t.w[k], t.f[k]));
      toks = t;
      return t;
    }
    /* where a word of more than 16 letters is cut (one that long no longer fits its half of a phone's stage and was set
       at half size): [0, cuts…] — into pieces of about 12 letters or fewer, after a hyphen it has, else between two
       consonants before a vowel (arbeidson|geschiktheids|verzekering), else near the middle; words with digits or other
       signs inside (numbers, addresses) stay whole */
    function parts(w){
      var a = w.search(LETTER), b = w.length;
      while (b > a && !LETTER.test(w.charAt(b - 1))) b--;
      var core = a < 0 ? "" : w.slice(a, b), L = core.replace(/-/g, "").length;
      if (L <= 16 || !/^[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]+(?:-[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]+)*$/.test(core)) return [0];
      var n = Math.ceil(L / 12), out = [0], V = /[aeiouyàáâäèéêëìíîïòóôöùúûü]/i, prev = 0;
      for (var k = 1; k < n; k++){
        var want = Math.round(core.length * k / n), best = -1, score = -1;
        for (var i = Math.max(prev + 4, want - 3); i <= Math.min(core.length - 4, want + 3); i++){
          var x = core.charAt(i - 1), y = core.charAt(i), z = core.charAt(i + 1);
          var sc = x === "-" ? 3 : (!V.test(x) && x !== "-" && !V.test(y) && y !== "-" && V.test(z)) ? 2 : 0;
          sc -= Math.abs(i - want) * 0.1;
          if (sc > score){ score = sc; best = i; }
        }
        if (best < 0) continue;
        out.push(a + best); prev = best;
      }
      return out;
    }
    function wordAt(off){
      var s = toks.s, lo = 0, hi = s.length - 1, best = 0;
      while (lo <= hi){ var mid = (lo + hi) >> 1; if (s[mid] <= off){ best = mid; lo = mid + 1; } else hi = mid - 1; }
      /* the word the offset falls in, or the next one when it falls in the space after a word */
      return s[best] + toks.w[best].length <= off && best < s.length - 1 ? best + 1 : best;
    }
    function sentOf(k){
      var s = toks.sent, lo = 0, hi = s.length - 1, best = 0;
      while (lo <= hi){ var mid = (lo + hi) >> 1; if (s[mid] <= k){ best = mid; lo = mid + 1; } else hi = mid - 1; }
      return best;
    }

    /* ---- one word on the stage: the optimal recognition point sits a little left of the middle of the
       word's letters (Spritz's table), and the stage centres that letter ---- */
    function orp(n){ return n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4; }
    function paint(){
      /* the recognition letter is counted among the letters only (o.a. puts it on the a, not on a dot) */
      var w = toks.w[i] || "", at = [], mm;
      LETTERS.lastIndex = 0;
      while ((mm = LETTERS.exec(w))) at.push(mm.index);
      var o = at.length ? at[orp(at.length)] : 0;
      lEl.textContent = w.slice(0, o); oEl.textContent = w.charAt(o); rEl.textContent = w.slice(o + 1);
      /* a word too long for its half of the stage is set smaller, so it never runs off the screen */
      wordEl.style.removeProperty("--k");
      var k = 1;
      if (lEl.scrollWidth > lEl.clientWidth + 1) k = Math.min(k, lEl.clientWidth / lEl.scrollWidth);
      if (rEl.scrollWidth > rEl.clientWidth + 1) k = Math.min(k, rEl.clientWidth / rEl.scrollWidth);
      if (k < 1) wordEl.style.setProperty("--k", (k * 0.94).toFixed(3));
      var n = toks.w.length, pct = n > 1 ? i / (n - 1) * 100 : 100;
      barEl.style.width = pct.toFixed(2) + "%";
      /* the time left at this speed, with the pauses (sentences, commas, long words) it will take */
      var mins = Math.ceil(Math.max(0, toks.cum[n] - toks.cum[Math.min(i, n)]) / wpm);
      whereEl.textContent = _t("{pct}% · {left}", { pct: Math.round(pct), left: mins < 60 ? _t("{n} min left", { n: mins }) : _t("{h} h {m} min left", { h: Math.floor(mins / 60), m: mins % 60 }) });
      whereEl.title = _t("Time left at {n} words a minute", { n: wpm });
    }
    /* paused: the sentence around the word, for bearings */
    function context(){
      if (playing){ ctxEl.hidden = true; ctxEl.innerHTML = ""; return; }
      var si = sentOf(i), a = toks.sent[si], b = si + 1 < toks.sent.length ? toks.sent[si + 1] : toks.w.length, h = [];
      a = Math.max(a, i - 40); b = Math.min(b, i + 40);
      /* a long word's frames are one word again, the frame shown marked inside it */
      while (a > 0 && (toks.f[a - 1] & F_CONT)) a--;
      while (b < toks.w.length && b > 0 && (toks.f[b - 1] & F_CONT)) b++;
      for (var k = a; k < b; k++){
        var w = toks.f[k] & F_CONT ? toks.w[k].replace(/-$/, "") : toks.w[k], x = k === i ? '<mark>' + escapeHtml(w) + '</mark>' : escapeHtml(w);
        h.push(x + (toks.f[k] & F_CONT ? "" : " "));
      }
      ctxEl.innerHTML = h.join("").trim();
      ctxEl.hidden = false;
    }
    /* how long a word stays: the speed's beat, longer after a comma, a sentence, a paragraph or a heading, and
       for a long word or a number; the first words after Play come in a little slower */
    function beats(w, f){
      var m = 1, n = w.replace(/[^0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g, "").length;
      if (n > 7) m += Math.min(0.9, (n - 7) * 0.12);
      if (f & F_HEAD) m += 2.2;
      else if (f & F_PARA) m += 1.9;
      else if (f & F_SENT) m += 1.3;
      else if (f & F_PAUSE) m += 0.6;
      if (/\d/.test(w)) m += 0.3;
      return m;
    }
    function delay(k){
      var m = beats(toks.w[k], toks.f[k]);
      if (ramp < 4){ m *= [1.8, 1.45, 1.2, 1.08][ramp]; ramp++; }
      return 60000 / wpm * m;
    }
    function tick(){
      clearTimeout(timer);
      if (!playing) return;
      paint();
      timer = setTimeout(function(){
        if (!playing) return;
        if (i >= toks.w.length - 1){ pause(); Marks.toast(_t("End of the document")); return; }
        if (!(toks.f[i] & F_CONT)) shown++;     /* words, not frames, count as read */
        i++;
        if (shown >= 25) credit();
        tick();
      }, delay(i));
    }
    function syncPlay(){
      playIcon(playBtn, playing);
      playBtn.setAttribute("aria-label", playing ? _t("Pause") : _t("Play"));
      playBtn.title = playing ? _t("Pause (Space)") : _t("Play (Space)");
      el.classList.toggle("playing", playing);
    }
    function play(){ if (playing || !toks.w.length) return; if (i >= toks.w.length - 1) i = 0; playing = true; ramp = 0; Wake.hold(true); syncPlay(); context(); tick(); }
    function pause(){ playing = false; clearTimeout(timer); Wake.hold(false); credit(); syncPlay(); paint(); context(); }
    /* the words read this way count in the reading stats, like words read on the page */
    function credit(){ if (shown > 0){ Stats.noteWords(shown); shown = 0; } }
    function toggle(){ if (playing) pause(); else play(); }
    /* back: to the start of this sentence, or of the one before when already there; on: the next sentence */
    function back(){
      var si = sentOf(i), st = toks.sent[si];
      i = i - st > 1 || si === 0 ? st : toks.sent[si - 1];
      moved();
    }
    function fwd(){ var si = sentOf(i); if (si + 1 < toks.sent.length) i = toks.sent[si + 1]; moved(); }
    function moved(){ ramp = 0; if (playing) tick(); else { paint(); context(); } }
    function setWpm(v){
      wpm = clampWpm(v); Store.set(KEY, String(wpm));
      wpmEl.value = wpm; wpmV.textContent = _t("{n} wpm", { n: wpm });
      if (!playing) paint();
    }

    /* ---- the overlay, made the first time it opens ---- */
    function make(){
      el = document.createElement("div");
      el.id = "rsvp"; el.hidden = true;
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "rsvpTitle");
      el.innerHTML =
        '<div class="rsvp-top"><span class="rsvp-title" id="rsvpTitle">' + _t("Speed reading") + '</span><span class="rsvp-where" id="rsvpWhere"></span>' +
          '<button type="button" class="rsvp-x" id="rsvpClose" title="' + _t("Close (Esc)") + '" aria-label="' + _t("Close speed reading") + '">' + ICONS.close + '</button></div>' +
        '<div class="rsvp-stage" id="rsvpStage" title="' + _t("Tap to play or pause") + '">' +
          '<div class="rsvp-word" aria-hidden="true" data-no-i18n><span class="rsvp-l"></span><span class="rsvp-orp"></span><span class="rsvp-r"></span></div>' +
          '<p class="rsvp-ctx" id="rsvpCtx" data-no-i18n hidden></p></div>' +
        '<div class="rsvp-prog" aria-hidden="true"><i id="rsvpBar"></i></div>' +
        '<div class="rsvp-ctl">' +
          '<button type="button" class="ctl" id="rsvpBack" title="' + _t("Back a sentence (←)") + '" aria-label="' + _t("Back a sentence") + '">' + ICONS.chevronL + '</button>' +
          '<button type="button" class="ctl primary" id="rsvpPlay" aria-label="' + _t("Play") + '">' + ICONS.play + '</button>' +
          '<button type="button" class="ctl" id="rsvpFwd" title="' + _t("On a sentence (→)") + '" aria-label="' + _t("On a sentence") + '">' + ICONS.chevronR + '</button></div>' +
        '<div class="rowline rsvp-speed"><label for="rsvpWpm">' + _t("Speed") + '</label><input type="range" id="rsvpWpm" min="' + MIN + '" max="' + MAX + '" step="' + STEP + '">' +
          '<span class="val" id="rsvpWpmV"></span></div>' +
        '<p class="hint rsvp-keys">' + _t("Space or a tap plays and pauses · ← → a sentence · ↑ ↓ speed · Esc closes") + '</p>';
      document.body.appendChild(el);
      wordEl = el.querySelector(".rsvp-word"); lEl = el.querySelector(".rsvp-l"); oEl = el.querySelector(".rsvp-orp"); rEl = el.querySelector(".rsvp-r");
      barEl = el.querySelector("#rsvpBar"); playBtn = el.querySelector("#rsvpPlay"); wpmEl = el.querySelector("#rsvpWpm"); wpmV = el.querySelector("#rsvpWpmV");
      ctxEl = el.querySelector("#rsvpCtx"); whereEl = el.querySelector("#rsvpWhere");
      playBtn.addEventListener("click", toggle);
      el.querySelector("#rsvpBack").addEventListener("click", back);
      el.querySelector("#rsvpFwd").addEventListener("click", fwd);
      el.querySelector("#rsvpClose").addEventListener("click", function(){ close(); });
      el.querySelector("#rsvpStage").addEventListener("click", toggle);
      wpmEl.addEventListener("input", function(){ setWpm(+wpmEl.value); });
      /* the keys belong to the overlay while it is open: caught on the window before the page's own
         (page turns, single-key shortcuts, zen's Escape) see them */
      window.addEventListener("keydown", function(e){
        if (!open || e.key === "Tab") return;
        e.stopImmediatePropagation();
        if (e.key === "Escape"){ e.preventDefault(); close(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target, onBtn = t && t.tagName === "BUTTON", onRange = t && t.type === "range";
        if ((e.key === " " || e.key === "Enter") && onBtn) return;         /* the button's own press */
        if (onRange && /^(Arrow|Home|End|Page)/.test(e.key)) return;       /* the slider's own keys */
        if (e.key === " " || e.key === "k"){ e.preventDefault(); toggle(); }
        else if (e.key === "ArrowLeft"){ e.preventDefault(); back(); }
        else if (e.key === "ArrowRight"){ e.preventDefault(); fwd(); }
        else if (e.key === "ArrowUp"){ e.preventDefault(); setWpm(wpm + STEP); }
        else if (e.key === "ArrowDown"){ e.preventDefault(); setWpm(wpm - STEP); }
        else if (e.key === "w"){ e.preventDefault(); close(); }
      }, true);
      /* leaving the page pauses; it never plays on unseen */
      document.addEventListener("visibilitychange", function(){ if (open && playing && document.visibilityState === "hidden") pause(); });
    }
    function start(){
      if (state.mode !== "doc"){ Marks.toast(_t("Speed reading works in text documents")); return; }
      if (open) return;
      build();
      if (!toks.w.length){ Marks.toast(_tc("rsvp", "Nothing to read")); return; }
      if (!el) make();
      /* the book's words, in the book's language (hyphenation, a screen reader's voice) */
      wordEl.lang = ctxEl.lang = bookLang();
      var off = Library.topCharOffset();
      if (off === null || off === undefined) off = typeof state.pageOff === "number" ? state.pageOff : 0;
      i = wordAt(off);
      if (Speak.isPlaying()) Speak.pause();
      if (Auto.isOn()) Auto.stop();
      Side.close(); Pop.close(true); Menu.close(); setSheet(false);
      opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      /* modal: the rest of the page is inert while the overlay is up */
      held = [];
      Array.prototype.forEach.call(document.body.children, function(n){ if (n !== el && n.id !== "toast" && !n.inert){ n.inert = true; held.push(n); } });
      open = true; playing = false;
      el.hidden = false; el.classList.add("on");
      document.body.classList.add("rsvp-on");
      /* a history entry of its own: Android's Back closes speed reading instead of leaving the app. Going back to the
         entry below must not scroll the page to where it was when this one was added (the book moves on to the word
         instead), so that entry's scroll restoration is manual until then (a new entry takes it over) */
      if (!hist){
        try { if (srWas === null) srWas = history.scrollRestoration || "auto"; history.scrollRestoration = "manual"; history.pushState({ llRsvp: true }, ""); hist = true; } catch(_){}
      }
      wpmEl.value = wpm; wpmV.textContent = _t("{n} wpm", { n: wpm });
      syncPlay(); paint(); context();
      playBtn.focus({ preventScroll: true });
    }
    /* closing moves the book to the word it stopped at */
    function close(fromBack){
      if (!open) return;
      pause();
      open = false;
      el.hidden = true; el.classList.remove("on");
      document.body.classList.remove("rsvp-on");
      held.forEach(function(n){ n.inert = false; }); held = [];
      /* closed any other way: its history entry goes (the popstate that follows is expected) */
      if (hist && fromBack !== true){ hist = false; backing = true; try { history.back(); } catch(_){ backing = false; } }
      if (state.mode === "doc" && toks && typeof toks.s[i] === "number"){ revealOffset(toks.s[i]); Library.notePosition(); }
      var to = opener && document.contains(opener) && opener.getClientRects().length ? opener : $("#main");
      if (to) to.focus({ preventScroll: true });
      opener = null;
    }
    document.addEventListener("ll:fileopened", function(){ if (open) close(); toks = null; });
    window.addEventListener("popstate", function(){
      /* our own history.back(); if speed reading was opened again before it landed, that took the new entry: put it back */
      if (backing){ backing = false; if (open && hist){ try { history.pushState({ llRsvp: true }, ""); } catch(_){ hist = false; } } else scrollBack(); return; }
      if (open && hist){ hist = false; close(true); scrollBack(); }
    });
    function scrollBack(){ if (srWas !== null){ try { history.scrollRestoration = srWas; } catch(_){} srWas = null; } }

    Menu.add({ order: 53, group: "reading", icon: ICONS.bolt, label: _t("Speed reading"), key: "W", run: start, show: function(){ return state.mode === "doc"; } });
    window.llRsvp = { open: start, close: close, play: play, pause: pause, back: back, fwd: fwd, setWpm: setWpm, isOpen: function(){ return open; },
                      state: function(){ return { i: i, word: toks && toks.w[i], offset: toks && toks.s[i], playing: playing, wpm: wpm, words: toks ? toks.w.length : 0 }; },
                      delay: function(k){ var r = ramp; ramp = 9; var d = delay(k === undefined ? i : k); ramp = r; return d; }, orp: orp,
                      seek: function(k){ if (open && toks && k >= 0 && k < toks.w.length){ i = k; moved(); } } };
    return { open: start, close: close, isOpen: function(){ return open; }, isPlaying: function(){ return playing; },
             offset: function(){ return open && toks && typeof toks.s[i] === "number" ? toks.s[i] : null; } };
  })();

  /* ============================================================
     Background sounds — rain, fire, café, forest night and waves, made
     on the device with the Web Audio API (sounds.js, loaded the first
     time they are wanted: from the menu, or a book opened while they
     were left on). They play while a book is open, under read aloud too.
     ============================================================ */
  var Sounds = (function(){
    var KEY = "ll_sounds";
    function wanted(){
      var o = null;
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      return !!(o && o.on === true && o.mix && Object.keys(o.mix).some(function(k){ return o.mix[k] > 0; }));
    }
    function load(){ return need(["sounds"]).then(function(){ if (!window.llSounds) throw new Error("sounds.js"); return window.llSounds; }); }
    function openPanel(){ load().then(function(S){ S.openPanel(); }, function(){ Marks.toast(_t("Couldn’t load the sounds")); }); }
    /* left on last time: the module comes with the next book and watches the page from then on */
    document.addEventListener("ll:fileopened", function(){ if (!window.llSounds && wanted()) load().then(function(S){ S.sync(); }).catch(function(){}); });
    function playing(){ return !!(window.llSounds && window.llSounds.isOn && window.llSounds.isOn()); }
    /* the menu's entry in one tap: stop what plays, or play the last blend again; the panel (the
       sounds, the volume, the mix) is the toast's Mix… away, and opens by itself the first time */
    function quick(){
      var mix = { action: _t("Mix\u2026"), run: openPanel };
      if (playing()){ window.llSounds.setOn(false); Marks.toast(_t("Background sounds off"), mix); return; }
      if (!Store.get(KEY)){ openPanel(); return; }
      var go = function(S){ S.setOn(true); Marks.toast(_t("{mix} \u2014 playing", { mix: S.describe() }), mix); };
      if (window.llSounds) go(window.llSounds);
      else load().then(go, function(){ Marks.toast(_t("Couldn’t load the sounds")); });
    }
    Menu.add({ order: 54, group: "reading", icon: ICONS.sound, label: function(){ return playing() ? _tc("menu", "Stop background sounds") : _tc("menu", "Background sounds"); }, run: quick, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    /* once there is a blend to go back to, the tile above plays or stops it; the panel itself (which
       sounds, the volume, the mix) keeps an entry of its own beside it, so it never hangs on the
       toast's four seconds */
    Menu.add({ order: 54.5, group: "reading", icon: ICONS.sliders, label: _t("Sound mix…"), run: openPanel,
               show: function(){ return (state.mode === "doc" || state.mode === "pdf") && !!Store.get(KEY); } });
    return { load: load, openPanel: openPanel };
  })();

  /* the app's own entries: opening a file (the bar's Open button goes away while reading), the
     library, and the settings sheet (the ⋯ menu and the s key open it) */
  Menu.add({ order: 1, group: "app", icon: ICONS.open, label: _t("Open a file\u2026"), key: "O", run: function(){ $("#fileInput").click(); } });
  Menu.add({ order: 2, group: "app", icon: ICONS.books, label: _t("Library"), run: function(){ Library.home(); }, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
  Menu.add({ order: 85, head: true, group: "app", icon: ICONS.gear, label: _t("Settings"), key: "S", run: function(){ setSheet(true); } });

  /* ============================================================
     Tabs — several open documents; switching re-renders from the library copy
     and resumes at the saved position
     ============================================================ */
  var Tabs = (function(){
    var KEY = "ll_tabs", tabs = [], activeId = null, strip = $("#tabs");
    try { tabs = JSON.parse(Store.get(KEY) || "[]"); if (!Array.isArray(tabs)) tabs = []; } catch(_){ tabs = []; }
    tabs = tabs.filter(function(t){ return t && t.id && t.name; }).map(function(t){ return { id: t.id, name: t.name, title: t.title || "", file: null }; });
    function save(){ try { Store.set(KEY, JSON.stringify(tabs.map(function(t){ return { id: t.id, name: t.name, title: t.title || "" }; }))); } catch(_){} }
    /* a tab shows the book's title (the file's name is its tooltip) */
    function titleOf(t){ return t.title || Library.titleOf(t.id) || bareName(t.name); }
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    /* one Tab stop for the strip (the active tab; arrows move along it), and the close is a plain
       mark inside the tab rather than a second control nested in it: Delete, Backspace or the
       menu's Close document close a tab from the keyboard */
    function render(){
      strip.classList.toggle("on", tabs.length >= 2);
      var hadFocus = strip.contains(document.activeElement);
      var stop = tabs.some(function(t){ return t.id === activeId; }) ? activeId : (tabs[0] && tabs[0].id);
      strip.innerHTML = tabs.map(function(t){
        var on = t.id === activeId;
        return '<button type="button" class="tab' + (on ? ' on' : '') + '" role="tab" tabindex="' + (t.id === stop ? 0 : -1) + '" aria-selected="' + on + '" aria-keyshortcuts="Delete" data-id="' + esc(t.id) + '" title="' + esc(t.name) + '">' +
          '<span class="tab-name">' + esc(titleOf(t)) + '</span><span class="tab-x" aria-hidden="true" data-x="' + esc(t.id) + '">' + ICONS.close + '</span></button>';
      }).join("");
      var on = strip.querySelector(".tab.on"); if (on) on.scrollIntoView({ inline: "nearest", block: "nearest" });
      /* the strip is drawn again when a document opens: keyboard focus that was in it stays in it */
      if (hadFocus && stop) focusTab(stop);
      if (state.flow === "pages" && (state.mode === "doc" || state.mode === "pdf")) relayoutPaged();
    }
    function tabEl(id){ return strip.querySelector('.tab[data-id="' + CSS.escape(id) + '"]'); }
    function focusTab(id){ var t = tabEl(id); if (t) t.focus({ preventScroll: true }); }
    function noteOpen(id, name, file){
      var t = tabs.filter(function(x){ return x.id === id; })[0];
      if (!t){ t = { id: id, name: name, title: "", file: file }; tabs.push(t); }
      else { t.file = file || t.file; if (name) t.name = name; }
      activeId = id; save(); render();
    }
    function setName(id, title){ var t = tabs.filter(function(x){ return x.id === id; })[0]; if (t && title && t.title !== title){ t.title = title; save(); render(); } }
    function activate(id){
      var t = tabs.filter(function(x){ return x.id === id; })[0];
      if (!t) return;
      if (t.id === activeId && (state.mode === "doc" || state.mode === "pdf")) return;
      Library.flush();
      if (t.file){ openFile(t.file, { fromTab: true }); }
      else Library.openId(id);
    }
    function close(id){
      var i = tabs.findIndex(function(x){ return x.id === id; });
      if (i < 0) return;
      var wasActive = tabs[i].id === activeId, hadFocus = strip.contains(document.activeElement);
      tabs.splice(i, 1); save();
      if (wasActive) abandonOpen();
      if (wasActive){
        if (tabs.length){ activate(tabs[Math.min(i, tabs.length - 1)].id); }
        else { activeId = null; Library.home(); }
      }
      render();
      /* a keyboard close keeps focus in the strip (render moves it to the tab that is left), or
         on the document once the strip has gone (one document left, or none) */
      if (hadFocus && !strip.classList.contains("on")) $("#main").focus({ preventScroll: true });
    }
    function drop(id){ var i = tabs.findIndex(function(x){ return x.id === id; }); if (i >= 0){ tabs.splice(i, 1); save(); render(); } }
    function clear(){ tabs = []; activeId = null; save(); render(); }
    /* add files without opening them (multi-select / multi-drop) */
    /* the ids are hashed at their own pace, so they are collected before any tab is added:
       pushing each one as it arrived put the strip in whatever order the hashing finished in */
    function addFiles(files){
      var list = Array.prototype.slice.call(files || []).filter(Boolean);
      if (!list.length) return Promise.resolve();
      return Promise.all(list.map(function(f){ return Library.idFor(f); })).then(function(ids){
        var added = false;
        ids.forEach(function(id, i){
          var f = list[i];
          if (!tabs.some(function(x){ return x.id === id; })){ tabs.push({ id: id, name: f.name, title: "", file: f }); added = true; }
          /* make sure it is in the library too */
          Library.remember(f, id);
        });
        if (added){ save(); render(); }
      });
    }
    strip.addEventListener("click", function(e){
      var x = e.target.closest(".tab-x"); if (x){ e.stopPropagation(); close(x.dataset.x); return; }
      var t = e.target.closest(".tab"); if (t) activate(t.dataset.id);
    });
    /* arrows, Home and End move along the strip and open the tab they land on */
    strip.addEventListener("keydown", function(e){
      var t = e.target.closest(".tab"); if (!t) return;
      var step = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: 0 };
      if (e.key in step){
        e.preventDefault();
        var i = tabs.findIndex(function(x){ return x.id === t.dataset.id; }), n = tabs.length;
        var j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + step[e.key] + n) % n;
        if (tabs[j] && tabs[j].id !== t.dataset.id){ activate(tabs[j].id); focusTab(tabs[j].id); }
        return;
      }
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); activate(t.dataset.id); focusTab(t.dataset.id); }
      if (e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); close(t.dataset.id); }
      if (e.key === "w" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); close(t.dataset.id); }
    });
    /* the × is hidden from assistive technology, so the menu carries the same action */
    Menu.add({ order: 3, porder: 92, group: "app", icon: ICONS.close, label: _t("Close document"), show: function(){ return !!activeId && (state.mode === "doc" || state.mode === "pdf"); }, run: function(){ if (activeId) close(activeId); } });
    document.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab" && tabs.length > 1){
        e.preventDefault();
        var i = tabs.findIndex(function(x){ return x.id === activeId; });
        var n = (i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
        activate(tabs[n].id);
      }
    });
    render();
    return { noteOpen: noteOpen, activate: activate, close: close, drop: drop, clear: clear, addFiles: addFiles, setName: setName, list: function(){ return tabs; }, active: function(){ return activeId; }, render: render, titleOf: titleOf };
  })();

  /* open one or many files: the first shows, the rest become tabs */
  function openFiles(files){
    var list = Array.prototype.slice.call(files || []).filter(Boolean);
    if (!list.length) return;
    openFile(list[0]);
    if (list.length > 1){
      /* keep the tabs in the order the files were chosen */
      Library.idFor(list[0]).then(function(id){ Tabs.noteOpen(id, list[0].name, list[0]); Tabs.addFiles(list.slice(1)); });
    }
  }

  /* ---------- wiring ---------- */
  $("#openBtn").addEventListener("click", function(){ $("#fileInput").click(); });
  $("#openBtn2").addEventListener("click", function(){ $("#fileInput").click(); });
  $("#libOpen").addEventListener("click", function(){ $("#fileInput").click(); });
  $("#fileInput").addEventListener("change", function(e){
    openFiles(e.target.files);
    e.target.value = "";
  });

  /* a file dragged over the window: a dashed frame says it can be dropped anywhere. dragover
     keeps firing while the drag lasts, so the frame goes when the events stop */
  var dragTimer = null;
  function dragOff(){ clearTimeout(dragTimer); dragTimer = null; document.body.classList.remove("dragging"); $("#empty").classList.remove("drag"); }
  document.addEventListener("dragover", function(e){
    e.preventDefault();
    document.body.classList.add("dragging"); $("#empty").classList.add("drag");
    clearTimeout(dragTimer); dragTimer = setTimeout(dragOff, 220);
  });
  document.addEventListener("dragleave", function(e){ if (!e.relatedTarget) dragOff(); });
  document.addEventListener("drop", function(e){
    e.preventDefault();
    dragOff();
    if (e.dataTransfer.files && e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
  });

  /* ---------- launched from the OS: "Open with", the share sheet, shortcuts ---------- */
  var Launch = (function(){
    var params = new URLSearchParams(location.search);
    function clean(){ try { history.replaceState(null, "", location.pathname); } catch(_){} }
    function sharedFiles(){
      if (!("caches" in window)) return Promise.resolve([]);
      return caches.open("lamplight-share").then(function(c){
        return c.keys().then(function(keys){
          return Promise.all(keys.map(function(req){
            return c.match(req).then(function(res){
              var name = decodeURIComponent(res.headers.get("X-Name") || "shared.txt");
              return res.blob().then(function(blob){ return new File([blob], name, { type: res.headers.get("Content-Type") || blob.type }); });
            });
          })).then(function(files){ return caches.delete("lamplight-share").then(function(){ return files; }); });
        });
      }).catch(function(){ return []; });
    }
    function boot(){
      if ("launchQueue" in window && window.launchQueue.setConsumer){
        window.launchQueue.setConsumer(function(launchParams){
          if (!launchParams.files || !launchParams.files.length) return;
          Promise.all(launchParams.files.map(function(h){ return h.getFile ? h.getFile() : null; })).then(function(files){ openFiles(files.filter(Boolean)); });
        });
      }
      var action = params.get("action");
      if (params.has("shared")){
        clean();
        sharedFiles().then(function(files){
          if (files.length) openFiles(files);
          else if (params.get("text") || params.get("url")){
            var txt = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean).join("\n");
            openFile(new File([txt], (params.get("title") || _t("Shared text")) + ".txt", { type: "text/plain" }));
          }
        });
      } else if (action === "continue"){
        clean();
        Library.ready.then(function(){ var b = Library.books()[0]; if (b) Library.openId(b.id); });
      } else if (action || params.has("open") || params.has("source")){
        clean();
      }
    }
    return { boot: boot };
  })();

  $("#wordmark").addEventListener("click", function(){ Library.home(); });
  $("#wordmark").addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " "){ e.preventDefault(); Library.home(); } });
  /* the bar's document buttons; the Aa and lamp buttons open their popovers (see Pop) */
  $("#searchBtn").addEventListener("click", function(){ Search.openPanel(); });
  $("#tocBtn").addEventListener("click", function(){ Toc.openPanel(); });
  $("#speakBtn").addEventListener("click", function(){ if (Speak.isActive()) Speak.stop(); else Speak.start(); });
  /* the read-aloud button shows its state: the Speak module marks the body while it is on */
  function syncSpeakBtn(){
    var b = $("#speakBtn"), on = Speak.isActive();
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    var lab = on ? _t("Stop reading aloud") : _t("Read aloud");
    b.setAttribute("aria-label", lab);
    b.title = lab;
  }
  if (window.MutationObserver) new MutationObserver(function(){
    syncSpeakBtn();
    /* zen hides the bar: a popover left under it would float on its own */
    if (document.body.classList.contains("zen")) Pop.close(true);
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  /* t: between the day and the night theme (the auto pair; day / dusk unless changed). From a
     theme that is neither, a light one goes to the night theme and a dark one to the day theme */
  function toggleDayNight(){
    var day = state.autoDay, night = state.autoNight, cur = state.theme, dark = isDarkColor(currentTheme().bg), to;
    if (cur === day && day !== night) to = night;
    else if (cur === night && day !== night) to = day;
    else to = dark ? day : night;
    if (to === cur) to = dark ? "day" : "dusk";
    selectTheme(to);
  }

  /* ---------- phones held in one hand: the reading actions at the foot of the screen ----------
     With a finger for a pointer on a phone (560px and under) and a document open, the reading
     buttons (Contents, Aa, Read aloud, the lamp and ⋯) move from the top bar into a slim row at the
     foot of the dock (#actRow), where the thumb is. The bar keeps the library mark, the book's
     title with its section, and Search. The buttons themselves move, their ids and listeners with
     them; the row goes and comes back with the bar (hidebar in Scroll flow, immersive in Pages,
     app.css). The tabs strip folds into the title: a tap on it opens a switcher of the open books. */
  var PhoneBar = (function(){
    var mq = window.matchMedia ? window.matchMedia("(pointer: coarse) and (max-width: 560px)") : null;
    var row = $("#actRow"), fname = $("#fname"), IDS = ["tocBtn", "gear", "speakBtn", "lamp", "more"], homes = {};
    IDS.forEach(function(id){ var el = document.getElementById(id), ph = document.createComment(" " + id + " "); el.parentNode.insertBefore(ph, el); homes[id] = ph; });
    function on(){ return !!(mq && mq.matches) && (state.mode === "doc" || state.mode === "pdf"); }
    function place(){
      var want = on(), was = document.body.classList.contains("phonebar");
      if (want !== was) Pop.close(true);
      document.body.classList.toggle("phonebar", want);
      IDS.forEach(function(id){
        var el = document.getElementById(id), ph = homes[id];
        if (want){ if (el.parentNode !== row) row.appendChild(el); }
        else if (el.parentNode === row) ph.parentNode.insertBefore(el, ph.nextSibling);
      });
      /* the title is the way to the other open books */
      if (want){ fname.setAttribute("role", "button"); fname.tabIndex = 0; fname.setAttribute("aria-haspopup", "dialog"); }
      else { fname.removeAttribute("role"); fname.removeAttribute("tabindex"); fname.removeAttribute("aria-haspopup"); }
      if (want !== was){ headVar(); dockVar(); if (pagedActive()) relayoutPaged(); }
    }
    if (mq){ if (mq.addEventListener) mq.addEventListener("change", place); else if (mq.addListener) mq.addListener(place); }

    /* the switcher: the open books (the tabs), each with its close; the library and a new file below */
    function esc(x){ return escapeHtml(String(x)); }
    function render(body, foot){
      var list = Tabs.list(), act = Tabs.active() || Library.currentId();
      if (!list.length && act) list = [{ id: act, name: "" }];
      body.innerHTML = '<ul class="bk-list">' + list.map(function(t){
        var b = Library.books().filter(function(x){ return x.id === t.id; })[0], pos = Library.positionFor(t.id), pct = pos ? pos.pct : 0, on = t.id === act;
        var title = Tabs.titleOf ? Tabs.titleOf(t) : bookName(b), type = b ? b.type : "", prog = pct ? pct + "%" : _t("new");
        return '<li class="bk-row' + (on ? ' on' : '') + '"><button type="button" class="bk-open" data-id="' + esc(t.id) + '"' + (on ? ' aria-current="true"' : '') + '>' +
          (type ? '<span class="lib-type">' + esc(type) + '</span>' : '') +
          '<span class="bk-name">' + esc(title) + '</span><span class="bk-meta">' + esc(on ? _t("Reading now \u00B7 {progress}", { progress: prog }) : prog) + '</span></button>' +
          '<button type="button" class="bk-x" data-x="' + esc(t.id) + '" title="' + esc(_t("Close")) + '" aria-label="' + esc(_t("Close {name}", { name: title })) + '">' + ICONS.close + '</button></li>';
      }).join("") + '</ul>';
      foot.innerHTML = '<button type="button" class="chip" data-bk="library">' + ICONS.books + '<span>' + esc(_t("Library")) + '</span></button>' +
        '<button type="button" class="chip" data-bk="open">' + ICONS.open + '<span>' + esc(_t("Open a file\u2026")) + '</span></button>';
    }
    function openSwitcher(){ Side.open("books", _t("Open books"), render); }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("books")) return;
      var x = e.target.closest(".bk-x");
      if (x){
        Tabs.close(x.dataset.x);
        if (Tabs.list().length && (state.mode === "doc" || state.mode === "pdf")) Side.refresh("books", render); else Side.close();
        return;
      }
      var o = e.target.closest(".bk-open");
      if (o){ var id = o.dataset.id; Side.close(); if (id !== (Tabs.active() || Library.currentId())) Tabs.activate(id); }
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("books")) return;
      var b = e.target.closest("[data-bk]"); if (!b) return;
      Side.close();
      if (b.dataset.bk === "library") Library.home(); else $("#fileInput").click();
    });
    fname.addEventListener("click", function(){ if (document.body.classList.contains("phonebar")) openSwitcher(); });
    fname.addEventListener("keydown", function(e){
      if ((e.key === "Enter" || e.key === " ") && document.body.classList.contains("phonebar")){ e.preventDefault(); openSwitcher(); }
    });
    /* a long press on the lamp switches between the day and the night theme without the popover */
    longPress($("#lamp"), function(){ Pop.close(true); toggleDayNight(); Marks.toast(_t("{name} theme", { name: themeName(state.theme) || currentTheme().name })); });
    place();
    return { place: place, on: on, openSwitcher: openSwitcher };
  })();
  /* The settings sheet sits in the flow under the bar and sticks there while scrolling. In
     Scroll flow, opening it should push the text down so what was at the top reappears just
     under the sheet, and closing it should pull the text back up; browsers with scroll
     anchoring undo exactly that shift, so the document is put where it belongs afterwards. */
  var sheetOpener = null;
  /* `from` is the control that asked for the sheet; without one, the element that had focus */
  var sheetScrim = null;
  function setSheet(open, from){
    var sheet = $("#sheet");
    var was = sheet.classList.contains("open");
    if (open === undefined) open = !was;
    if (open === was) return;
    /* a phone: the sheet rises from the bottom like every other panel, over a scrim that closes it,
       and the page stays where it is under it; wider screens: it drops from the bar and pushes the text */
    var phone = isPhone(), paged = phone || document.body.classList.contains("paged"), ref = $("#main");
    if (!sheetScrim){
      sheetScrim = document.createElement("div"); sheetScrim.id = "sheetScrim"; sheetScrim.setAttribute("aria-hidden", "true");
      sheetScrim.addEventListener("click", function(){ setSheet(false); });
      sheet.parentNode.insertBefore(sheetScrim, sheet);
    }
    sheetScrim.classList.toggle("on", open && phone);
    document.documentElement.classList.toggle("lock-sheet", open && phone);
    var before = ref.getBoundingClientRect().top, h = was ? sheet.offsetHeight : 0;
    /* read before the class flips: the browser only drops focus from a hidden element lazily */
    var active = document.activeElement, inside = sheet.contains(active);
    if (open){ Pop.close(true); Side.close(); }
    sheet.classList.toggle("open", open);
    sheet.setAttribute("aria-hidden", open ? "false" : "true");
    if (!paged){
      if (open) h = sheet.offsetHeight;
      var wanted = before + (open ? h : -h), actual = ref.getBoundingClientRect().top;
      if (Math.abs(actual - wanted) > 1) window.scrollBy(0, actual - wanted);
    }
    if (open && SheetTabs) SheetTabs.pick();
    /* keyboard focus: opened from the document (or the s key), it lands on the section strip;
       opened from a bar button it stays there and Tab flows into the sheet. Closing with focus
       inside hands it back to the opener, else to the ⋯ button; focus elsewhere is left alone */
    if (open){
      sheetOpener = from || (active && active !== document.body && !inside ? active : null);
      if (!sheetOpener || sheetOpener.tabIndex < 0){ var first = $("#sheetTabs button"); if (first) first.focus({ preventScroll: true }); }
    } else {
      if (inside){
        var to = sheetOpener && document.contains(sheetOpener) && sheetOpener.getClientRects().length ? sheetOpener : $("#more");
        if (to) to.focus({ preventScroll: true });
      }
      sheetOpener = null;
    }
  }

  /* ---- the sheet's section strip: built once every group exists (the dictionary and translation
     groups are added by their module at load), sticky at the top of the sheet. A button jumps to
     its group; the button for the group under the strip is marked while the sheet scrolls ---- */
  var SheetTabs = (function(){
    var sheet = $("#sheet"), strip = null, groups = [], lock = 0, raf = null;
    /* the icon per group, by its id (not by the label's text: that is in the interface's language) */
    var META = { readingGroup: ICONS.books, themeGroup: ICONS.sun, textGroup: ICONS.aa,
                 pdfGroup: ICONS.print, dictGroup: ICONS.meaning, trGroup: ICONS.translate };
    /* the section buttons carry a line icon beside the word (the Text group's heading keeps its "Aa") */
    var TAB_ICONS = { textGroup: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>' };
    function nameOf(g){
      var l = g.querySelector(".label"), t = "";
      if (l) Array.prototype.forEach.call(l.childNodes, function(n){ if (n.nodeType === 3) t += n.textContent; });
      return t.trim();
    }
    function build(){
      if (strip) return;
      groups = Array.prototype.slice.call(sheet.querySelectorAll(".sheet-inner > .group"));
      strip = document.createElement("nav");
      strip.className = "sheet-tabs"; strip.id = "sheetTabs"; strip.setAttribute("aria-label", _t("Settings sections"));
      /* a phone's bottom sheet: its handle and its title over the sections (app.css shows them there only) */
      var grab = document.createElement("div"), ttl = document.createElement("div");
      grab.className = "sheet-grab"; grab.setAttribute("aria-hidden", "true");
      ttl.className = "sheet-title"; ttl.textContent = _t("Settings"); ttl.setAttribute("aria-hidden", "true");
      grab.addEventListener("click", function(){ setSheet(false); });
      strip.appendChild(grab); strip.appendChild(ttl);
      var row = document.createElement("div"); row.className = "sheet-tabs-row";
      groups.forEach(function(g, i){
        var n = nameOf(g);
        if (!g.id) g.id = "group" + i;
        var m = META[g.id] || "", l = g.querySelector(".label");
        if (l && m && !l.querySelector("svg, .label-aa")) l.insertAdjacentHTML("afterbegin", m);
        var b = document.createElement("button");
        b.type = "button"; b.dataset.group = g.id;
        b.innerHTML = (TAB_ICONS[g.id] || (m && m.indexOf("<svg") === 0 ? m : "")) + "<span></span>";
        b.lastChild.textContent = n || g.id;
        row.appendChild(b);
      });
      strip.appendChild(row);
      dragToClose(sheet, [grab, ttl], function(){ setSheet(false); }, function(){ return sheet.classList.contains("open"); });
      var x = document.createElement("button");
      x.type = "button"; x.className = "sheet-x"; x.id = "sheetClose"; x.title = _t("Close settings"); x.setAttribute("aria-label", _t("Close settings"));
      x.innerHTML = ICONS.close;
      strip.appendChild(x);
      var inner = sheet.querySelector(".sheet-inner");
      inner.insertBefore(strip, inner.firstChild);
      strip.addEventListener("click", function(e){
        var b = e.target.closest("button[data-group]");
        if (b){ go(b.dataset.group); return; }
        if (e.target.closest("#sheetClose")) setSheet(false);
      });
      sheet.addEventListener("scroll", function(){ if (raf) return; raf = requestAnimationFrame(function(){ raf = null; pick(); }); }, { passive: true });
      if (window.IntersectionObserver){
        var io = new IntersectionObserver(function(){ pick(); }, { root: sheet, threshold: [0, 0.5, 1] });
        groups.forEach(function(g){ io.observe(g); });
      }
      pick();
    }
    function topOf(g){ return g.getBoundingClientRect().top - sheet.getBoundingClientRect().top + sheet.scrollTop; }
    /* a group that does not apply to the open document (PDF while a text is open, Text while a PDF
       is) steps back, and its section button leaves the strip; on the start screen both apply */
    function applies(){
      var pdf = state.mode === "pdf", txt = state.mode === "doc";
      $("#textGroup").classList.toggle("dim", pdf);
      $("#pdfGroup").classList.toggle("dim", txt);
      var ph = $("#pdfHint"); if (ph) ph.hidden = !txt;
      if (!strip) return;
      Array.prototype.forEach.call(strip.querySelectorAll("button[data-group]"), function(b){
        var g = document.getElementById(b.dataset.group);
        b.hidden = !!(g && g.classList.contains("dim"));
      });
    }
    /* room under the last group, so that it too can be scrolled up under the strip like the others */
    function pad(){
      var last = groups[groups.length - 1], inner = sheet.querySelector(".sheet-inner");
      /* the slack is under the 12px pick line below, so the last group can be the one under the strip */
      var extra = sheet.clientHeight - strip.offsetHeight - last.offsetHeight - 8;
      inner.style.paddingBottom = Math.max(24, Math.round(extra)) + "px";
    }
    function mark(id, hold){
      if (!strip) return;
      if (hold) lock = Date.now() + hold;
      Array.prototype.forEach.call(strip.querySelectorAll("button[data-group]"), function(b){
        var on = b.dataset.group === id;
        b.classList.toggle("on", on);
        if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
        if (on && b.scrollIntoView) b.scrollIntoView({ inline: "nearest", block: "nearest" });
      });
    }
    /* the group under the strip */
    function pick(){
      if (!strip || !groups.length || !sheet.classList.contains("open")) return;
      pad();
      if (Date.now() < lock) return;
      var line = sheet.scrollTop + strip.offsetHeight + 12, cur = groups[0];
      groups.forEach(function(g){ if (topOf(g) <= line) cur = g; });
      mark(cur.id);
    }
    function go(id){
      var g = document.getElementById(id);
      if (!g) return;
      pad();
      mark(id, 700);
      sheet.scrollTo({ top: Math.max(0, topOf(g) - strip.offsetHeight - 2), behavior: noMotion() ? "auto" : "smooth" });
    }
    return { build: build, pick: pick, mark: mark, go: go, applies: applies };
  })();

  /* ---- the interface's language: Settings › Reading › App language (Automatic, Nederlands, English).
     i18n.js keeps the choice (ll_ui_lang) and every string goes through its t() as it is drawn, so a
     change of language reloads the page: the reading position is saved first, and after the reload
     the same book opens at the same place and the settings come back open at this row ---- */
  var UiLang = (function(){
    var RKEY = "ll_i18n_resume", I = window.LL_I18N || null;
    function chips(){ return Array.prototype.slice.call(document.querySelectorAll("#uiLangChips .chip")); }
    function sync(){
      var cur = I ? I.setting() : "auto";
      chips().forEach(function(ch){
        var on = ch.dataset.uilang === cur;
        ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    function choose(v){
      if (!I || v === I.setting()) return;
      var changed = I.setLang(v);
      sync();
      /* Automatic on a Dutch phone after Nederlands (and the like): the same language, nothing to redraw */
      if (!changed) return;
      var id = (state.mode === "doc" || state.mode === "pdf") ? Library.currentId() : null;
      try { sessionStorage.setItem(RKEY, JSON.stringify({ id: id || null, t: Date.now() })); } catch(_){}
      Library.flush();
      /* the position goes to IndexedDB: a moment for it to land before the page goes */
      setTimeout(function(){ location.reload(); }, 250);
    }
    /* the settings sheet, open at the language row */
    function showRow(){
      setSheet(true);
      var sh = $("#sheet"), row = $("#uiLangRow");
      if (!sh || !row) return;
      SheetTabs.mark("readingGroup", 700);
      sh.scrollTop = Math.max(0, row.getBoundingClientRect().top - sh.getBoundingClientRect().top + sh.scrollTop - sh.clientHeight / 3);
    }
    function resume(){
      var o = null;
      try { o = JSON.parse(sessionStorage.getItem(RKEY) || "null"); sessionStorage.removeItem(RKEY); } catch(_){ o = null; }
      if (!o || !(Date.now() - (o.t || 0) < 60000)) return;
      if (!o.id){ showRow(); return; }
      Library.ready.then(function(){
        Library.openId(o.id);
        /* once the book is in and back at its place (or after a few seconds whatever happens) */
        var t0 = Date.now();
        (function wait(){
          var there = (state.mode === "doc" || state.mode === "pdf") && Library.currentId() === o.id && !Library.restoring();
          if (there || Date.now() - t0 > 8000){ setTimeout(showRow, there ? 150 : 0); return; }
          setTimeout(wait, 150);
        })();
      }).catch(function(){});
    }
    function boot(){
      var box = $("#uiLangChips");
      if (!box) return;
      if (!I){ $("#uiLangRow").hidden = true; $("#uiLangHint").hidden = true; return; }
      box.addEventListener("click", function(e){
        var ch = e.target.closest(".chip[data-uilang]");
        if (ch) choose(ch.dataset.uilang);
      });
      sync();
      resume();
    }
    return { boot: boot, sync: sync, choose: choose };
  })();

  /* ---- the current section after the title while reading: the last heading at or above the
     top of the screen (the outline entry for the page, in a PDF), looked up at most twice a
     second on scroll and page turns. It goes in a data attribute the stylesheet appends, so the
     title's own text stays what exports, printing and About read ---- */
  var Section = (function(){
    var timer = null, last = 0, offs = null, offsLen = -1, fname = $("#fname");
    function set(t){
      /* a section named like the book (its title heading) is not said twice */
      if (t && t === fname.textContent.trim()) t = "";
      if (t) fname.dataset.sec = t; else delete fname.dataset.sec;
      fname.title = fname.textContent + (t ? " · " + t : "");
    }
    /* each heading's character offset, computed once per document */
    function entries(){
      var len = Anchor.textLength();
      if (offs && offsLen === len) return offs;
      offs = Toc.entries().map(function(e, i){
        var w = document.createTreeWalker(e.el, NodeFilter.SHOW_TEXT), n = w.nextNode();
        return { title: e.title, i: i, off: n ? Anchor.offsetOf(n, 0) : null };
      }).filter(function(e){ return e.off !== null; });
      offsLen = len;
      return offs;
    }
    /* the section holding character offset `top`: the last heading at or before it (with its
       index in the contents). The title, the page-turn bar and the contents panel all use this
       one rule, so they name the same section for the same place */
    function at(top){
      if (top === null || top === undefined) return null;
      var cur = null;
      entries().forEach(function(e){ if (e.off <= top + 1) cur = e; });
      return cur;
    }
    function pick(){
      if (state.mode === "doc"){
        var top = Library.topCharOffset();
        if (top === null) return;
        var cur = at(top);
        set(cur ? cur.title : "");
      } else if (state.mode === "pdf" && state.pdfDoc){
        var doc = state.pdfDoc;
        Toc.pdfEntries().then(function(es){
          if (state.pdfDoc !== doc) return;
          var pg = Library.currentPdfPage(), cur = "";
          es.forEach(function(e){ if (e.page && e.page <= pg) cur = e.title; });
          set(cur);
        });
      } else set("");
    }
    function update(){
      clearTimeout(timer);
      timer = setTimeout(function(){ last = Date.now(); pick(); }, Math.max(60, 500 - (Date.now() - last)));
    }
    function reset(){ offs = null; set(""); }
    window.addEventListener("scroll", update, { passive: true });
    if (window.MutationObserver) new MutationObserver(update).observe($("#pgInfo"), { childList: true, characterData: true, subtree: true });
    document.addEventListener("ll:fileopened", function(){ reset(); Pop.close(true); });
    return { update: update, reset: reset, at: at };
  })();

  /* ---- first-run tips on the start screen, and one toast on the first document ever opened ---- */
  $("#tips").hidden = Store.get("ll_tips") === "seen";
  $("#tipsOk").addEventListener("click", function(){ Store.set("ll_tips", "seen"); $("#tips").hidden = true; });
  /* the tip waits its turn: it never covers a message that is showing (a font that failed, say) */
  function tipDoc(){
    var t = $("#toast");
    if (t && t.classList.contains("on")){ setTimeout(tipDoc, 600); return; }
    Marks.toast(_t("Tip: tap any word for its meaning"));
  }
  document.addEventListener("ll:fileopened", function(){
    if (Store.get("ll_tip_doc")) return;
    var tries = 0, t = setInterval(function(){
      if (state.mode === "doc" || state.mode === "pdf"){
        clearInterval(t); Store.set("ll_tip_doc", "1");
        setTimeout(tipDoc, 900);
      } else if (++tries > 100 || (state.mode === "status" && !state.opening)) clearInterval(t);
    }, 300);
  });

  $("#themeChips").addEventListener("click", function(e){
    var ch = e.target.closest(".chip");
    if (!ch) return;
    if (ch.dataset.new) Maker.open({ from: state.theme }); else pickTheme(ch.dataset.theme);
  });
  /* the themes picked by hand, the latest first: the theme popover shows the last few */
  function recentThemes(){ try { var a = JSON.parse(Store.get("ll_theme_recent") || "[]"); return Array.isArray(a) ? a : []; } catch(_){ return []; } }
  function noteTheme(prev){
    if (!prev) return;
    var a = recentThemes().filter(function(k){ return k !== prev; });
    a.unshift(prev);
    Store.set("ll_theme_recent", JSON.stringify(a.slice(0, 6)));
  }
  function selectTheme(theme){
    if (theme !== state.theme) noteTheme(state.theme);
    state.theme = theme;
    if (customById(theme)) syncCustomUI();
    applyTheme(); AutoTheme.userPicked(theme);
  }
  /* the theme before this one (Previous): the latest used that still exists */
  function prevTheme(){
    var a = recentThemes();
    for (var i = 0; i < a.length; i++) if (a[i] !== state.theme && resolveTheme(a[i])) return a[i];
    return null;
  }
  /* a short cross-fade from one theme to the next (the browser's view transition); none with
     reduced motion, in e-ink mode, or where the browser has none */
  function crossFade(fn){
    if (!noMotion() && document.startViewTransition && document.visibilityState === "visible"){
      try { document.startViewTransition(fn); return; } catch(_){}
    }
    fn();
  }
  /* a theme picked by hand in a picker: applied at once, with the fade. While day and night
     switching is on it lasts until the next switch, and the first time that happens the toast
     offers to turn switching off */
  function pickTheme(theme, noFade){
    if (!resolveTheme(theme) || theme === state.theme) return;
    if (noFade) selectTheme(theme); else crossFade(function(){ selectTheme(theme); });
    if (state.auto !== "off" && Store.get("ll_auto_asked") !== "1"){
      Store.set("ll_auto_asked", "1");
      Marks.toast(_t("Day and night is on: this theme lasts until the next switch."), { action: _t("Turn off"), ms: 7000, run: function(){
        AutoTheme.setMode("off"); Marks.toast(_t("Day and night switching is off"));
      } });
    }
  }
  /* the saved themes changed (new, renamed, copied or deleted): redraw the chips, the day / night lists and the open popover */
  function customsChanged(){ buildThemeChips(); AutoTheme.syncUI(); Pop.refreshThemes(); }
  /* Edit, Rename, Duplicate and Delete for one of the reader's own themes */
  function themeAction(act, k){
    var c = customById(k); if (!c) return;
    if (act === "edit") Maker.open({ edit: c.id });
    else if (act === "rename") renameCustom(c);
    else if (act === "dup") dupCustom(c);
    else if (act === "del") deleteCustom(c);
  }
  function renameCustom(c){
    var name = prompt(_t("Name for this theme"), c.name);
    if (name === null) return;
    name = name.trim().slice(0, 60);
    if (!name || name === c.name) return;
    c.name = name; customsChanged(); syncCustomUI(); Prefs.save(); Pop.sync();
  }
  function dupCustom(c){
    var d = copyCustom(c, customName(_t("{name} copy", { name: c.name })));
    customsChanged(); Prefs.save();
    Marks.toast(_t("Copied as \u201C{name}\u201D", { name: d.name }));
    return d;
  }
  /* Delete asks first, then offers Undo; the theme in use gives way to the one before it */
  function deleteCustom(c){
    if (!c || !confirm(_t("Delete the theme \u201C{name}\u201D?", { name: c.name }))) return false;
    var at = state.customs.indexOf(c), gone = "c:" + c.id, was = { theme: state.theme, day: state.autoDay, night: state.autoNight };
    if (at < 0) return false;
    state.customs.splice(at, 1);
    if (state.autoDay === gone) state.autoDay = "day";
    if (state.autoNight === gone) state.autoNight = "dusk";
    customsChanged();
    if (state.theme === gone) selectTheme(prevTheme() || (isDarkColor(c.bg) ? "dusk" : "day")); else Prefs.save();
    Marks.toast(_t("Deleted \u201C{name}\u201D", { name: c.name }), { undo: function(){
      if (customById(gone)) return;
      state.customs.splice(Math.min(at, state.customs.length), 0, c);
      state.autoDay = was.day; state.autoNight = was.night;
      customsChanged();
      if (was.theme === gone) selectTheme(gone); else Prefs.save();
      AutoTheme.syncUI(); Pop.sync();
    } });
    return true;
  }

  /* ---- the maker: your own theme from three colours ----
     Starts from any theme (Make my own from this one) or edits one of the reader's own. Background,
     text and accent are picked; the panel, the raised surface, the secondary text, the hairline and
     the lamp are derived from them (customColors), so a saved theme wears the same tokens as a
     built-in on every screen. Text and accent are moved in lightness until they read at 4.5:1, and
     a note says so. While it is open the draft is on screen everywhere (themeDraft); Cancel puts
     the theme back. */
  var Maker = (function(){
    var d = null;
    var INK = ["#141414", "#2B2A26", "#40331F", "#25303A", "#C7C3B6", "#E9DBCF", "#CBD5E1", "#FFFFFF"];
    function esc(x){ return escapeHtml(String(x)); }
    function derive(){
      var bg = d.bg, ink = d.autoInk ? deriveInk(bg) : d.ink, fixed = false;
      if (contrast(ink, bg) < 4.5){ ink = fixColor(ink, [bg]); fixed = true; }
      var c = { name: d.name, bg: bg, ink: ink, autoInk: !!d.autoInk && !fixed, accent: d.accent };
      if (d.panel) c.panel = d.panel;
      if (d.muted) c.muted = d.muted;
      var t = customColors(c);
      if (c.panel && contrast(t.ink, t.panel) < 4.5){ delete c.panel; t = customColors(c); }
      if (c.muted && (contrast(t.muted, t.bg) < 4.5 || contrast(t.muted, t.panel) < 4.5)){ delete c.muted; t = customColors(c); }
      if (contrast(t.accent, t.bg) < 4.5 || contrast(t.accent, t.panel) < 4.5){ c.accent = fixColor(t.accent, [t.bg, t.panel]); fixed = true; t = customColors(c); }
      return { c: c, t: t, fixed: fixed };
    }
    function row(kind, label, list){
      return '<div class="mk-row"><div class="mk-l"><span class="mk-lt">' + esc(label) + '</span>' +
        (kind === "ink" ? '<button type="button" class="chip mk-auto" id="mkAutoInk" aria-pressed="false">' + esc(_t("Automatic")) + '</button>' : '') +
        '<input type="color" class="mk-pick" id="mk-' + kind + '" data-k="' + kind + '" aria-label="' + esc(_t("{what}: any colour", { what: label })) + '"></div>' +
        '<div class="mk-sw" data-k="' + kind + '">' + list.map(function(c){
          return '<button type="button" class="sw" data-c="' + c.toLowerCase() + '" style="background:' + c + '" aria-label="' + esc(label + " " + c) + '" aria-pressed="false"></button>';
        }).join("") + '</div></div>';
    }
    function render(body, foot){
      body.innerHTML = '<div class="mk">' +
        '<div class="mk-prev" id="mkPrev" aria-hidden="true">' +
          '<div class="mk-bar"><span class="mk-mark">lamp<b>light</b></span><span class="mk-bar-t">' + esc(_t("Chapter three \u00B7 12 min left")) + '</span></div>' +
          '<div class="mk-page"><div class="mk-h">' + esc(_t("Chapter three")) + '</div>' +
            '<p>' + esc(_t("The lamp hums quietly. One more chapter, she tells herself,")) + ' <span class="mk-link">' + esc(_t("just one more")) + '</span>.</p>' +
            '<div class="mk-muted">' + esc(_t("Page 42 of 310")) + '</div>' +
            '<div class="mk-acts"><span class="mk-btn">' + esc(_t("Keep reading")) + '</span><span class="mk-card">' + esc(_t("A note")) + '</span></div>' +
          '</div></div>' +
        '<p class="mk-note" id="mkNote" role="status" hidden>' + esc(_t("Adjusted for readability")) + '</p>' +
        row("bg", _t("Background"), BG_SWATCHES) + row("ink", _t("Text"), INK) + row("acc", _t("Accent"), ACC_SWATCHES) +
        '<label class="mk-name"><span class="mk-lt">' + esc(_t("Name")) + '</span><input type="text" id="mkName" class="sel" maxlength="60" autocomplete="off" spellcheck="false"></label>' +
        '</div>';
      foot.innerHTML = '<button type="button" class="chip" id="mkCancel">' + esc(_t("Cancel")) + '</button>' +
        '<button type="button" class="chip mk-save" id="mkSave">' + esc(_t("Save")) + '</button>';
    }
    function update(){
      if (!d) return;
      var r = derive(), t = r.t, pv = $("#mkPrev");
      themeDraft = t; applyTheme();
      if (pv) pv.setAttribute("style", "--bg:" + t.bg + ";--ink:" + t.ink + ";--muted:" + t.muted + ";--panel:" + t.panel + ";--raise:" + t.raise +
        ";--line:" + t.line + ";--accent:" + t.accent + ";--lamp:" + t.lamp);
      $("#mkNote").hidden = !r.fixed;
      var cur = { bg: d.bg, ink: d.autoInk ? r.c.ink : d.ink, acc: d.accent };
      Object.keys(cur).forEach(function(k){
        var p = $("#mk-" + k), v = String(cur[k]).toLowerCase();
        if (p && document.activeElement !== p) p.value = v;
        Array.prototype.forEach.call(Side.body.querySelectorAll('.mk-sw[data-k="' + k + '"] .sw'), function(b){
          var on = b.dataset.c === v && !(k === "ink" && d.autoInk); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
      var a = $("#mkAutoInk"); if (a){ a.classList.toggle("on", !!d.autoInk); a.setAttribute("aria-pressed", d.autoInk ? "true" : "false"); }
    }
    function set(k, v){
      v = normHex(v); if (!v || !d) return;
      if (k === "bg") d.bg = v; else if (k === "ink"){ d.ink = v; d.autoInk = false; } else d.accent = v;
      update();
    }
    function done(){ d = null; if (themeDraft){ themeDraft = null; applyTheme(); } }
    function open(opts){
      opts = opts || {};
      var src = opts.edit ? customById("c:" + opts.edit) : null, fromId = resolveTheme(opts.from) ? opts.from : state.theme, from = resolveTheme(fromId) || currentTheme();
      if (src) d = { editId: src.id, name: src.name, bg: src.bg, ink: src.autoInk ? deriveInk(src.bg) : src.ink, autoInk: !!src.autoInk, accent: src.accent, panel: src.panel, muted: src.muted };
      else d = { name: customName(_t("My {name}", { name: themeName(fromId) || from.name })), bg: normHex(from.bg), ink: normHex(from.ink), autoInk: false, accent: normHex(from.accent) };
      Side.open("maker", src ? _t("Edit theme") : _t("Your own theme"), render, done);
      $("#mkName").value = d.name;
      update();
    }
    function save(){
      if (!d) return;
      var r = derive(), name = ($("#mkName").value || "").trim().slice(0, 60) || d.name || customName(), c = d.editId ? customById("c:" + d.editId) : null;
      if (c){
        ["bg", "ink", "autoInk", "accent"].forEach(function(k){ c[k] = r.c[k]; });
        if (r.c.panel) c.panel = r.c.panel; else delete c.panel;
        if (r.c.muted) c.muted = r.c.muted; else delete c.muted;
        c.name = name;
      } else { r.c.name = name; c = addCustom(r.c); }
      d = null; themeDraft = null;
      Side.close();
      customsChanged();
      var id = "c:" + c.id;
      if (state.theme === id){ syncCustomUI(); applyTheme(); } else pickTheme(id, true);
      Marks.toast(_t("Saved \u201C{name}\u201D", { name: name }));
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("maker") || !d) return;
      var sw = e.target.closest(".mk-sw .sw");
      if (sw){ set(sw.parentNode.dataset.k, sw.dataset.c); return; }
      if (e.target.closest("#mkAutoInk")){ if (d.autoInk){ d.ink = deriveInk(d.bg); d.autoInk = false; } else d.autoInk = true; update(); }
    });
    Side.body.addEventListener("input", function(e){
      if (!Side.is("maker") || !d) return;
      if (e.target.classList.contains("mk-pick")) set(e.target.dataset.k, e.target.value);
      else if (e.target.id === "mkName") d.name = e.target.value;
    });
    Side.body.addEventListener("keydown", function(e){ if (Side.is("maker") && e.key === "Enter" && e.target.id === "mkName"){ e.preventDefault(); save(); } });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("maker")) return;
      if (e.target.closest("#mkSave")) save(); else if (e.target.closest("#mkCancel")) Side.close();
    });
    return { open: open, save: save, draft: function(){ return d; } };
  })();
  function focusChip(theme){ var ch = $('#themeChips .chip[data-theme="' + theme + '"]'); if (ch) ch.focus(); }
  /* New…: a saved theme that starts from the colours on screen */
  function createCustom(){
    var t = currentTheme();
    var c = addCustom({ name: customName(), bg: normHex(t.bg), ink: normHex(t.ink), autoInk: true, accent: normHex(t.accent) });
    customsChanged(); selectTheme("c:" + c.id); focusChip("c:" + c.id);
    return c;
  }

  /* ---- custom theme editor: every change applies at once and is saved with the theme ---- */
  function editing(){ return customById(state.theme); }
  function edited(){ syncCustomUI(); applyTheme(); }
  $("#cRename").addEventListener("click", function(){ var c = editing(); if (c) renameCustom(c); });
  $("#cDup").addEventListener("click", function(){
    var c = editing(); if (!c) return;
    var d = copyCustom(c, customName(_t("{name} copy", { name: c.name })));
    customsChanged(); selectTheme("c:" + d.id);
    Marks.toast(_t("Copied as “{name}”", { name: d.name }));
  });
  $("#cSaveAs").addEventListener("click", function(){
    var c = editing(); if (!c) return;
    var name = prompt(_t("Name for the new theme"), customName());
    if (name === null) return;
    var d = copyCustom(c, name.trim().slice(0, 60) || customName());
    customsChanged(); selectTheme("c:" + d.id);
    Marks.toast(_t("Saved as “{name}”", { name: d.name }));
  });
  $("#cDel").addEventListener("click", function(){ var c = editing(); if (c && deleteCustom(c)) focusChip(state.theme); });
  /* background: quick swatches, the tint / brightness sliders, or any colour */
  $("#bgSwatches").addEventListener("click", function(e){
    var s = e.target.closest(".sw"), c = editing();
    if (!s || !c) return;
    c.bg = s.dataset.c.toLowerCase(); edited();
  });
  function bgFromSliders(){
    var c = editing(); if (!c) return;
    var h = +$("#cHue").value, l = +$("#cLit").value;
    c.bg = hslToHex(h, l > 55 ? 14 : 22, l);
    $("#vHue").textContent = h + "°";
    $("#vLit").textContent = l + " %";
    syncPicks(c); applyTheme();
  }
  $("#cHue").addEventListener("input", bgFromSliders);
  $("#cLit").addEventListener("input", bgFromSliders);
  /* a picker and its hex field drive the same colour; a valid hex applies as it is typed */
  function bindPick(key, set){
    var p = $("#c" + key), h = $("#h" + key);
    p.addEventListener("input", function(){ var c = editing(); if (!c) return; set(c, p.value); edited(); });
    h.addEventListener("input", function(){
      var c = editing(), v = normHex(h.value);
      h.classList.toggle("bad", !v);
      if (v) h.removeAttribute("aria-invalid"); else h.setAttribute("aria-invalid", "true");
      if (c && v){ set(c, v); edited(); }
    });
    h.addEventListener("blur", function(){ var c = editing(); if (c) syncPicks(c); });
  }
  bindPick("Bg", function(c, v){ c.bg = v; });
  bindPick("Ink", function(c, v){ c.ink = v; c.autoInk = false; });
  bindPick("Acc", function(c, v){ c.accent = v; });
  bindPick("Panel", function(c, v){ c.panel = v; });
  bindPick("Muted", function(c, v){ c.muted = v; });
  /* the automatic boxes: turning one off keeps the derived colour as the starting point */
  $("#autoInk").addEventListener("change", function(e){
    var c = editing(); if (!c) return;
    c.autoInk = e.target.checked;
    if (!c.autoInk) c.ink = $("#cInk").value;
    edited();
  });
  $("#autoPanel").addEventListener("change", function(e){
    var c = editing(); if (!c) return;
    if (e.target.checked) delete c.panel; else c.panel = $("#cPanel").value;
    edited();
  });
  $("#autoMuted").addEventListener("change", function(e){
    var c = editing(); if (!c) return;
    if (e.target.checked) delete c.muted; else c.muted = $("#cMuted").value;
    edited();
  });
  $("#accSwatches").addEventListener("click", function(e){
    var s = e.target.closest(".sw"), c = editing();
    if (!s || !c) return;
    c.accent = s.dataset.c.toLowerCase(); edited();
  });
  $("#cFix").addEventListener("click", fixContrast);
  /* exposed for tests (not a public API) */
  window.llThemes = { THEMES: THEMES, CYCLE: CYCLE, groups: themeGroups, pickerGroups: pickerGroups, contrast: contrast, resolve: resolveTheme, current: currentTheme,
    customs: function(){ return state.customs; }, select: selectTheme, create: createCustom, fix: fixContrast,
    pick: pickTheme, previous: prevTheme, remove: deleteCustom, maker: Maker };

  $("#flowChips").addEventListener("click", function(e){
    var ch = e.target.closest(".chip");
    if (ch) setFlow(ch.dataset.flow);
  });
  $("#fontSel").addEventListener("change", function(e){ state.font = e.target.value; applyType(); });
  $("#fontBrowse").addEventListener("click", Fonts.openPanel);
  $("#rSize").addEventListener("input", function(e){ state.size = +e.target.value; applyType(); });
  $("#rLh").addEventListener("input",  function(e){ state.lh   = +e.target.value; applyType(); });
  $("#rW").addEventListener("input",   function(e){ state.width= +e.target.value; applyType(); });
  $("#rM").addEventListener("input",   function(e){ state.margin = +e.target.value; applyType(); });
  $("#rWeight").addEventListener("input", function(e){ state.weight = +e.target.value; applyType(); });
  $("#rLs").addEventListener("input",  function(e){ state.ls   = +e.target.value; applyType(); });
  $("#rWs").addEventListener("input",  function(e){ state.ws   = +e.target.value; applyType(); });
  $("#rPgap").addEventListener("input", function(e){ state.pgap = +e.target.value; applyType(); });
  $("#cJustify").addEventListener("change", function(e){ state.justify = e.target.checked; applyType(); });
  $("#cHyphens").addEventListener("change", function(e){ state.hyphens = e.target.checked; applyType(); });
  $("#cFocus").addEventListener("change", function(e){ state.focus = e.target.checked; applyType(); });
  $("#focusChips").addEventListener("click", function(e){
    var ch = e.target.closest(".chip");
    if (!ch) return;
    state.focusLevel = ch.dataset.focus; state.focus = true;
    applyType();
  });
  /* back to the typography this reader ships with — the family and the theme are left alone */
  function resetType(){
    state.size = 19; state.lh = 1.75; state.width = 720; state.margin = 0;
    state.weight = 400; state.ls = 0; state.ws = 0; state.pgap = 0.95;
    state.justify = false; state.hyphens = false; state.focus = false;
    applyType();
    Marks.toast(_t("Text settings reset"));
  }
  $("#typeReset").addEventListener("click", resetType);
  $("#cSpread").addEventListener("change", function(e){ state.spread = e.target.checked; Prefs.save(); relayoutPaged(); });

  $("#rZoom").addEventListener("input", function(e){
    state.zoom = (+e.target.value) / 100;
    $("#vZoom").textContent = e.target.value + " %";
    queueRerender();
  });
  /* Plain background: the textured themes without their paper or cloth */
  $("#plainBg").addEventListener("change", function(e){ state.plainBg = e.target.checked; applyTheme(); });
  $("#softenPdf").addEventListener("change", function(e){
    state.soften = e.target.checked;
    applyTheme();
  });

  /* A− / A+ : text size in doc mode, zoom in pdf mode */
  function bump(dir){
    if (state.mode === "pdf"){
      state.zoom = Math.max(0.6, Math.min(2.5, state.zoom + dir * 0.1));
      $("#rZoom").value = Math.round(state.zoom * 100);
      $("#vZoom").textContent = Math.round(state.zoom * 100) + " %";
      queueRerender();
      Pop.sync();
    } else {
      state.size = Math.max(14, Math.min(28, state.size + dir));
      $("#rSize").value = state.size;
      applyType();
    }
  }
  $("#smaller").addEventListener("click", function(){ bump(-1); });
  $("#bigger").addEventListener("click",  function(){ bump(1); });

  /* page turning: buttons, edge taps, swipes, keys — middle tap toggles the bars */
  $("#prevPg").addEventListener("click", function(){ turn(-1); });
  $("#nextPg").addEventListener("click", function(){ turn(1); });

  /* the bars in Pages flow: shown (show true), hidden (false) or the other way round (undefined) */
  function toggleBars(show){
    var imm = document.body.classList.contains("immersive"), want = show === undefined ? !imm : !show;
    if (want === imm) return;
    document.body.classList.toggle("immersive", want);
    setSheet(false);
    relayoutPaged();
  }
  /* the top and bottom 56px of the page, where the bars live: a tap there shows or hides them, and
     never looks a word up (in the middle of a phone's page almost every point is a word) */
  var BAR_STRIP = 56;
  function inBarStrip(y, el){
    var r = (el || (state.mode === "pdf" ? $("#pdf") : $("#docView"))).getBoundingClientRect();
    return y - r.top < BAR_STRIP || r.bottom - y < BAR_STRIP;
  }
  function tapNav(e){
    if (!pagedActive()) return;
    if (e.target.closest("a")) return;
    var sel = window.getSelection();
    if (sel && sel.toString()) return;
    var r = e.currentTarget.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    /* e-ink mode: the left third goes back, the rest forward, a whole page at a time */
    if (state.eink === true){ turn(x < 1 / 3 ? -1 : 1); return; }
    if (inBarStrip(e.clientY, e.currentTarget)) toggleBars();
    else if (x < 0.35) turn(-1);
    else if (x > 0.65) turn(1);
    else toggleBars();
  }
  $("#docView").addEventListener("click", tapNav);
  $("#pdf").addEventListener("click", tapNav);

  /* swipes in Pages flow: sideways turns the page; down on the page shows the bars, up hides them
     (the page itself never scrolls vertically in Pages flow — a zoomed PDF page that does keeps its
     vertical swipes, and e-ink mode keeps its bars) */
  var touchX = null, touchY = null, touchPage = false;
  document.addEventListener("touchstart", function(e){
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
    touchPage = !!(e.target && e.target.closest && e.target.closest("#docView, #pdf"));
  }, {passive:true});
  document.addEventListener("touchend", function(e){
    if (touchX === null || !pagedActive()) { touchX = null; return; }
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) turn(dx < 0 ? 1 : -1);
    else if (touchPage && Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.4 && state.eink !== true){
      var pdf = $("#pdf");
      if (state.mode === "pdf" && pdf.scrollHeight > pdf.clientHeight + 2) return;
      toggleBars(dy > 0);
    }
  }, {passive:true});

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ setSheet(false); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (Side.current()) return;   /* the keys scroll the open drawer, not the pages behind it */
    if (!pagedActive()) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " "){ e.preventDefault(); turn(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); turn(-1); }
    else if (e.key === "Home"){ e.preventDefault(); if (state.mode === "doc") gotoPage(0); else { state.pdfPageNum = 1; renderPdfSingle(); } }
    else if (e.key === "End"){ e.preventDefault(); if (Journal) Journal.jumped(); if (state.mode === "doc") gotoPage(state.totalPages - 1); else { state.pdfPageNum = state.pdfDoc.numPages; renderPdfSingle(); } }
  });

  /* ---------- keyboard shortcuts (single keys, when nothing is being typed) ---------- */
  var Keys = (function(){
    var list = [];
    function add(key, label, run, when){ list.push({ key: key, label: label, run: run, when: when }); }
    function typing(e){ return /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable; }
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    add("o", _t("Open a file"), function(){ $("#fileInput").click(); });
    add("s", _t("Settings"), function(){ document.body.classList.remove("hidebar"); setSheet(); });
    add("t", _t("Switch day / night theme"), toggleDayNight);
    add("+", _t("Larger text / zoom in"), function(){ bump(1); }, docOpen);
    add("-", _t("Smaller text / zoom out"), function(){ bump(-1); }, docOpen);
    add("p", _t("Switch scroll / pages"), function(){ setFlow(state.flow === "pages" ? "scroll" : "pages"); }, docOpen);
    add("/", _t("Search in the document"), function(){ Search.openPanel(); }, docOpen);
    add("c", _t("Contents"), function(){ Toc.openPanel(); }, docOpen);
    add("b", _t("Bookmark here"), function(){ Marks.addBookmark(); }, docOpen);
    add("n", _t("Bookmarks & notes"), function(){ Marks.openPanel(); }, docOpen);
    add("r", _t("Read aloud (start / stop)"), function(){ if (Speak.isActive()) Speak.stop(); else Speak.start(); }, docOpen);
    add("l", _t("Reading ruler"), function(){ Ruler.toggle(); }, docOpen);
    add("z", _t("Zen mode (enter / leave)"), function(){ Zen.toggle(); }, function(){ return Zen.isOn() || docOpen(); });
    add("a", _t("Auto-scroll (start / stop)"), function(){ if (Auto.isOn()) Auto.stop(); else Auto.start(); }, docOpen);
    add("w", _t("Speed reading (one word at a time)"), function(){ Rsvp.open(); }, function(){ return state.mode === "doc"; });
    add("h", _t("Library / home"), function(){ Library.home(); }, docOpen);
    add("i", _t("About this text"), function(){ About.openPanel(); }, docOpen);
    add("?", _t("Keyboard shortcuts"), function(){ openHelp(); });
    add("g", _t("Reading stats"), function(){ Stats.openPanel(); });
    add("j", _t("Reading journal"), function(){ Journal.openPanel(); });
    var extra = [
      [_t("\u2190 \u2192, PgUp/PgDn, Space"), _t("Turn pages (Pages flow)")], ["Home / End", _t("First / last page (Pages flow)")],
      ["Ctrl/\u2318+F", _t("Search")], ["Ctrl/\u2318+Tab", _t("Next tab")], ["Enter / Shift+Enter", _t("Next / previous match (in search)")],
      ["Esc", _t("Close panels and cards")], [_t("Right-click a sentence"), _t("Explain it (desktop)")], [_t("Hold a sentence"), _t("Explain it (touch)")],
      [_t("Select text, then d or Shift+F10"), _t("Define or explain it (F7 turns on caret browsing)")]
    ];
    function openHelp(){
      Side.open("keys", _t("Keyboard shortcuts"), function(body){
        var h = '<div class="keys">';
        list.forEach(function(k){ h += '<div class="key-row"><kbd>' + k.key.replace("<", "&lt;") + '</kbd><span>' + escapeHtml(k.label) + '</span></div>'; });
        extra.forEach(function(x){ h += '<div class="key-row"><kbd>' + escapeHtml(x[0]) + '</kbd><span>' + escapeHtml(x[1]) + '</span></div>'; });
        body.innerHTML = h + '</div>';
      });
    }
    document.addEventListener("keydown", function(e){
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
      if (e.key === "Escape") return;
      var key = e.key === "=" ? "+" : e.key;
      var hit = list.filter(function(k){ return k.key === key; })[0];
      if (!hit || (hit.when && !hit.when())) return;
      e.preventDefault();
      hit.run();
    });
    Menu.add({ order: 80, group: "app", icon: ICONS.keyboard, label: _t("Keyboard shortcuts"), key: "?", run: openHelp, show: function(){ return window.matchMedia ? !window.matchMedia("(pointer: coarse)").matches : true; } });
    return { openHelp: openHelp, add: add, list: function(){ return list; } };
  })();

  var rz = null;
  window.addEventListener("resize", function(){
    clearTimeout(rz);
    rz = setTimeout(function(){
      if (state.mode === "doc" && state.flow === "pages") relayoutDocPages();
      else if (state.mode === "pdf" && state.pdfDoc){ renderPdf(); }
    }, 350);
  });
  /* a web font or an image arriving after the first layout changes where the pages break */
  var lateLayout = null;
  function relayoutLater(){
    clearTimeout(lateLayout);
    lateLayout = setTimeout(function(){ if (state.mode === "doc" && state.flow === "pages") relayoutDocPages(); }, 80);
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", relayoutLater);
  $("#doc").addEventListener("load", function(e){ if (e.target && e.target.tagName === "IMG") relayoutLater(); }, true);

  /* scroll: progress bar + auto-hiding top bar.
     Down past a bit -> bar hides. Up a decent amount (or near the top) -> bar returns. */
  var lastY = 0, upAcc = 0;
  window.addEventListener("scroll", function(){
    if (document.body.classList.contains("paged")) return;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    setProgressBar(max > 0 ? (h.scrollTop / max) * 100 : 0);
    Progress.tick();

    if (state.mode !== "doc" && state.mode !== "pdf") return;
    Library.notePosition();
    var y = h.scrollTop;
    var dy = y - lastY;
    lastY = y;
    /* the sheet and the popovers hang from the bar: it stays while one of them is open */
    if ($("#sheet").classList.contains("open") || $("#pop").classList.contains("open") || y < 90){
      document.body.classList.remove("hidebar");
      upAcc = 0;
    } else if (dy > 4){
      upAcc = 0;
      if (y > 170) document.body.classList.add("hidebar");
    } else if (dy < 0){
      upAcc += -dy;
      if (upAcc > 150){
        document.body.classList.remove("hidebar");
        upAcc = 0;
      }
    }
  }, {passive:true});


  /* ============================================================
     Lamplight — offline dictionary + sentence explainer
     ============================================================ */
  (function(){
    /* the icons this card draws — the redesign's shared table (24×24, stroked, round caps) */
    var ICONS = {
      meaning:   "M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2H2z | M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2H22z",
      explain:   "M7 15c-2 0-3.5-1.5-3.5-3.5S5 8 7 8s3 1.5 3 3.5c0 3-2 6-4 7 | M17 15c-2 0-3.5-1.5-3.5-3.5S15 8 17 8s3 1.5 3 3.5c0 3-2 6-4 7",
      simpler:   "M4 20l9-9 | M14 6l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z | M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6L19 3z",
      parts:     "M3 8h6v8H3z | M9 8h6v8H9z | M15 8h6v8h-6z",
      translate: "M4 5h9 M8 5v2c0 4-2 7-5 9 M6 10c1 3 3 5 6 6 | M13 20l4-9 4 9 M14.5 17h5",
      highlight: "M4 20h6 | M14 4l6 6-9 9H5v-6l9-9z",
      star:      "M12 3l2.1 5.6L20 10.5l-5.9 1.9L12 18l-2.1-5.6L4 10.5l5.9-1.9z",
      close:     "M6 6l12 12 M18 6L6 18"
    };
    function icon(name, size){
      return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        ICONS[name].split(" | ").map(function(d){ return '<path d="' + d + '"/>'; }).join("") + '</svg>';
    }
    var LS_MODE = "ll_dictmode";   // "tap" | "hold" | "off"
    var dictMode = Store.get(LS_MODE) || "tap";

    /* ---------- styles ----------
       One card for everything the reader touches: a head, a tab strip, one panel per tab and a
       footer of actions on the passage. A bottom sheet on phones, a floating card on wider
       screens; the strip and the footer stay put while the panel scrolls. */
    var css = document.createElement("style");
    css.textContent = [
      /* on touch screens the app's own tap / hold gestures replace native selection */
      "@media (pointer: coarse){",
      "  #doc.nosel, #doc.nosel *{",
      "    -webkit-user-select:none; user-select:none; -webkit-touch-callout:none;",
      "  }",
      "}",
      ".ll-hit{background:var(--accent); color:var(--bg); border-radius:3px;}",
      /* on a dark page the accent at full strength, dimmed under the scrim, turns murky: a tint with the text colour on it */
      ":root[data-tone=dark] .ll-hit{background:color-mix(in oklab, var(--accent) 35%, transparent); color:var(--ink);}",
      /* text for screen readers only (the pill's announcement) */
      ".ll-sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap;}",
      "#dictScrim{position:fixed; inset:0; z-index:59; background:var(--scrim); display:none; touch-action:none;}",
      "#dictScrim.on{display:block;}",
      /* a bottom sheet on phones: the raised surface, 24px top corners, the third step of elevation */
      "#dictCard{",
      "  position:fixed; left:0; right:0; bottom:0; z-index:60;",
      "  display:flex; flex-direction:column; max-height:66vh;",
      "  background:var(--raise); color:var(--ink);",
      "  border-top:1px solid var(--line); border-radius:var(--r-xl) var(--r-xl) 0 0;",
      "  box-shadow:var(--shadow-3);",
      "  transform:translateY(110%); visibility:hidden;",
      "  transition:transform var(--t-fade) var(--ease-in), visibility 0s linear var(--t-fade), background var(--t-theme) ease;",
      "  font-family:var(--ui-font);",
      "}",
      "#dictCard.open{transform:none; visibility:visible; transition:transform var(--t-sheet) var(--ease-out), visibility 0s, background var(--t-theme) ease;}",
      "#dictCard:focus{outline:none;}",
      "#dictCard:focus-visible{outline:var(--ring) solid var(--accent); outline-offset:-2px;}",
      /* the handle: a 36 × 4 pill in a 24px grab zone */
      "#dictCard .grab{flex:none; width:36px; height:4px; border-radius:999px; background:color-mix(in oklab, var(--hair), var(--ink) 40%); margin:10px auto;}",
      "#dictCard .inner{display:flex; flex-direction:column; flex:1 1 auto; min-height:0;}",
      /* head: the mark (a lamp-tinted round), the word or “This sentence” in the title face, a round close */
      "#dictCard .head{flex:none; display:flex; align-items:center; gap:12px; padding:4px 8px 0 16px; min-height:56px;}",
      "#dictCard .mark{",
      "  flex:none; width:40px; height:40px; border-radius:50%;",
      "  display:flex; align-items:center; justify-content:center;",
      "  background:var(--lamp-soft); color:var(--lamp);",
      "}",
      "#dictCard .mark svg{width:22px; height:22px;}",
      "#dictCard .hw{flex:1; min-width:0; display:flex; flex-wrap:wrap; align-items:baseline; gap:0 10px;}",
      "#dictCard .term{font-family:var(--title-font); font-size:var(--fs-term); font-weight:600; line-height:1.25; letter-spacing:-.01em; word-break:break-word;}",
      "#dictCard .ipa{color:var(--muted); font-size:var(--fs-body); line-height:1.3;}",
      "#dictCard .x{",
      "  flex:none; width:48px; height:48px; border:0; border-radius:50%;",
      "  background:transparent; color:var(--ink); display:flex; align-items:center; justify-content:center; cursor:pointer;",
      "}",
      "#dictCard .x svg{width:22px; height:22px;}",
      "#dictCard .x:hover{background:var(--accent-soft);}",
      /* the sentence itself, cut at three lines with a way to see it all */
      "#dictCard .quote{",
      "  flex:none; margin:10px 16px 0; padding:10px 14px; font-family:var(--reader-font); font-size:1rem; line-height:1.55;",
      "  border-left:3px solid var(--lamp); border-radius:0 var(--r-sm) var(--r-sm) 0;",
      "  background:var(--lamp-soft); overflow-wrap:break-word;",
      "}",
      "#dictCard .quote.clamp{display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;}",
      "#dictCard .more{",
      "  flex:none; align-self:flex-end; min-height:40px; margin:0 8px 0; padding:0 10px; border:0; border-radius:var(--r-pill);",
      "  background:transparent; color:var(--accent); font:inherit; font-size:var(--fs-small); font-weight:600; cursor:pointer;",
      "}",
      "#dictCard .more:hover{background:var(--accent-soft);}",
      /* the tab strip: equal tabs, the chosen one underlined in the accent and in the text's weight */
      "#dictCard .tabs{flex:none; display:flex; gap:2px; margin:10px 0 0; padding:0 8px; border-bottom:1px solid var(--line);}",
      "#dictCard [role=tab]{",
      "  flex:1 1 0; min-width:0; height:44px; position:relative;",
      "  display:flex; align-items:center; justify-content:center; gap:6px; padding:0 6px;",
      "  border:0; border-radius:var(--r-sm) var(--r-sm) 0 0; background:transparent; color:var(--muted);",
      "  font:inherit; font-size:var(--fs-body); font-weight:600; white-space:nowrap; cursor:pointer;",
      "}",
      "#dictCard [role=tab] svg{flex:none; width:18px; height:18px; stroke-width:2;}",
      "#dictCard [role=tab]:focus-visible{outline-offset:-3px;}",
      "#dictCard [role=tab]:hover{background:var(--accent-soft); color:var(--ink);}",
      "#dictCard [role=tab][aria-selected=true]{color:var(--ink);}",
      "#dictCard [role=tab][aria-selected=true]::after{",
      "  content:\"\"; position:absolute; left:8px; right:8px; bottom:-1px; height:3px; border-radius:3px 3px 0 0; background:var(--accent);",
      "}",
      "#dictCard [role=tab][aria-disabled=true]{opacity:.42; cursor:default;}",
      "#dictCard [role=tab][aria-disabled=true]:hover{background:transparent; color:var(--muted);}",
      "#dictCard .bdg{",
      "  font-size:var(--fs-eyebrow); line-height:1; padding:4px 7px; border-radius:999px; font-variant-numeric:tabular-nums;",
      "  background:var(--accent-soft); color:var(--ink);",
      "}",
      "#dictCard .dot{flex:none; width:6px; height:6px; border-radius:50%; background:var(--accent);}",
      "@media (max-width:359px){ #dictCard [role=tab]{gap:4px; padding:0 4px; font-size:var(--fs-small);} }",
      /* the panels scroll between the strip and the footer */
      "#dictCard .body{flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:12px 16px;}",
      "#dictCard .panel[hidden]{display:none;}",
      "#dictCard .panel:focus{outline:none;}",
      "#dictCard .panel:focus-visible{outline:2px solid var(--accent); outline-offset:-2px; border-radius:8px;}",
      "#dictCard .foot{",
      "  flex:none; display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px calc(8px + env(safe-area-inset-bottom, 0px));",
      "  border-top:1px solid var(--line); background:var(--raise);",
      "}",
      "#dictCard .empty{color:var(--muted); font-size:var(--fs-body); line-height:1.5; text-align:center; padding:24px 8px;}",
      /* the keyboard's way in: a field to type a word or a sentence into */
      "#dictCard .lookup{display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:2px 0 4px;}",
      "#dictCard .lookup input{",
      "  flex:1; min-width:0; min-height:48px; padding:0 14px; border:1.5px solid var(--ctl-line); border-radius:var(--r-sm);",
      "  background:var(--well); color:var(--ink); font:inherit; font-size:var(--fs-body);",
      "}",
      "#dictCard .lookup .hint{flex-basis:100%; color:var(--muted); font-size:var(--fs-small); line-height:1.45;}",
      /* meaning: senses with the part of speech as an italic accent word, synonyms in muted */
      "#dictCard .senses{display:grid; gap:12px;}",
      "#dictCard .sense{font-size:var(--fs-body); line-height:1.5;}",
      "#dictCard .pos{color:var(--accent); font-family:var(--title-font); font-style:italic; font-weight:500; margin-right:6px;}",
      "#dictCard .syn{display:block; margin-top:4px; font-size:var(--fs-small); color:var(--muted);}",
      "#dictCard .note{color:var(--muted); font-size:var(--fs-small); line-height:1.45; padding:2px 0 6px;}",
      "#dictCard .sec{",
      "  font-size:var(--fs-eyebrow); font-weight:700; letter-spacing:.08em; text-transform:uppercase;",
      "  color:var(--muted); margin:16px 0 8px;",
      "}",
      "#dictCard .panel > .sec:first-child{margin-top:0;}",
      "#dictCard .brk{display:grid; gap:7px; margin-top:2px;}",
      "#dictCard .brk div{font-size:var(--fs-body); line-height:1.45;}",
      "#dictCard .brk b{font-weight:600;}",
      "#dictCard .brk i{color:var(--muted); font-style:italic;}",
      /* word parts: a row of tiles, one per prefix / root / suffix, joined by plus signs (drawn
         as part of the tile that follows, so a wrapped row never starts with a stray sign) */
      "#dictCard .parts{display:flex; flex-wrap:wrap; align-items:stretch; gap:6px 4px; margin:2px 0 6px;}",
      "#dictCard .part{",
      "  display:flex; flex-direction:column; align-items:flex-start; min-width:0; max-width:12em; position:relative;",
      "  padding:8px 12px 9px; border-radius:var(--r-md); border:1px solid var(--line);",
      "  background:var(--raise); font:inherit; color:var(--ink); text-align:left;",
      "}",
      "#dictCard .part + .part{margin-left:18px;}",
      "#dictCard .part + .part::before{content:\"+\"; position:absolute; left:-15px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:0.9375rem;}",
      "#dictCard button.part{cursor:pointer; border-color:color-mix(in srgb, var(--accent) 45%, var(--line));}",
      "#dictCard button.part:hover{background:var(--accent-soft);}",
      "#dictCard .part .pt{font-family:var(--title-font); font-size:var(--fs-subtitle); line-height:1.2; font-weight:600;}",
      "#dictCard .part .pk{font-size:var(--fs-small); line-height:1.3; color:var(--accent); margin-top:2px;}",
      "#dictCard .part .pm{font-size:var(--fs-small); line-height:1.35; margin-top:2px;}",
      "#dictCard .part .po{font-size:var(--fs-small); line-height:1.3; color:var(--muted); font-style:italic; margin-top:1px;}",
      "#dictCard .gloss{font-style:italic; font-size:var(--fs-body); line-height:1.45; margin:2px 0 4px;}",
      /* example sentences: the sentence (a tap reads it aloud), its translation, the credit; a quiet placeholder meanwhile */
      "#dictCard .ex[hidden]{display:none;}",
      "#dictCard .ex .sec{margin-top:20px;}",
      "#dictCard .ex-list{list-style:none; margin:0; padding:0; display:grid; gap:12px;}",
      "#dictCard .ex-list li{padding-left:12px; border-left:3px solid var(--accent-soft);}",
      "#dictCard .ex-s{display:block; width:100%; text-align:start; margin:0; padding:2px 0; border:0; background:none; color:var(--ink); font:inherit; font-family:var(--reader-font); font-size:var(--fs-body); line-height:1.5; cursor:pointer; border-radius:6px;}",
      "#dictCard .ex-s[aria-pressed=true]{background:var(--accent-soft);}",
      "#dictCard .ex-s mark{background:var(--lamp-soft); color:inherit; font-weight:600; border-radius:3px; padding:0 2px;}",
      "#dictCard .ex-tr{color:var(--muted); font-size:var(--fs-small); line-height:1.45; margin-top:2px;}",
      "#dictCard .ex-src{display:inline-block; color:var(--muted); font-size:0.75rem; line-height:1.3; margin-top:3px; text-decoration:underline; text-decoration-color:var(--hair); text-underline-offset:2px;}",
      "#dictCard .ex-src:hover{color:var(--ink);}",
      "#dictCard .ex-more{margin:10px 0 2px; padding:0 4px; min-height:36px; border:0; background:none; color:var(--accent); font:inherit; font-size:var(--fs-small); font-weight:600; cursor:pointer;}",
      "#dictCard .ex-more[hidden]{display:none;}",
      "#dictCard .ex-wait{display:grid; gap:8px; padding:2px 0 4px;}",
      "#dictCard .ex-wait span{display:block; height:10px; border-radius:999px; background:var(--hair); opacity:.55; animation:llExWait 1.4s ease-in-out infinite alternate;}",
      "#dictCard .ex-wait span + span{width:62%;}",
      "@keyframes llExWait{to{opacity:.2;}}",
      "@media (prefers-reduced-motion: reduce){ #dictCard .ex-wait span{animation:none;} }",
      "@media (pointer: coarse){ #dictCard .ex-more{min-height:44px;} #dictCard .ex-src{padding:4px 0;} }",
      "@media (forced-colors: active){ #dictCard .ex-s mark{background:Highlight; color:HighlightText;} }",
      /* the translation line (filled by translate.js): under the word, lined up with it, or under the quoted
         sentence; the translation in the reader font, a quiet engine line, a "translating…" while it comes */
      "#dictCard .trline{flex:none; margin:6px 16px 0; min-width:0;}",
      "#dictCard .trline[hidden]{display:none;}",
      "#dictCard .trline[data-kind=word]{padding-left:52px;}",
      "#dictCard .trline[data-kind=sentence]{padding:2px 12px 0 15px;}",
      "#dictCard .tr-out{font-family:var(--title-font); font-size:var(--fs-subtitle); line-height:1.45; overflow-wrap:break-word;}",
      "#dictCard .trline[data-kind=sentence] .tr-out{font-size:0.9375rem;}",
      "#dictCard .trline.clamp .tr-out{display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;}",
      "#dictCard .tr-out[dir=rtl]{text-align:right;}",
      "#dictCard .tr-eng{color:var(--muted); font-size:var(--fs-small); line-height:1.4; padding:2px 0 0;}",
      "#dictCard .tr-wait{color:var(--muted); font-size:var(--fs-small); font-style:italic; line-height:1.5;}",
      "#dictCard .trline .note{padding:0;}",
      "#dictCard .trline .acts{margin:6px 0 0;}",
      "#dictCard .tr-offer{margin:10px 0 2px; padding:12px 14px; border:var(--bw) solid var(--line); border-radius:var(--r-md); background:var(--raise); font-size:var(--fs-small); line-height:1.45; color:var(--muted);}",
      "#dictCard .tr-offer .acts[hidden]{display:none;}",
      "#dictCard .tr-offer progress{display:block; width:100%; height:6px; margin:6px 0 0; accent-color:var(--accent);}",
      /* simpler: how plain to make it, then the plainer text with each change dotted in the
         accent colour and a tap-to-show note */
      "#dictCard .lvl{margin:0 0 12px;}",
      "#dictCard .lvl .sec{margin-top:0;}",
      /* four longish labels: the pill wraps onto a second row rather than scrolling out of sight */
      "#dictCard .lvl .seg{max-width:100%; flex-wrap:wrap; overflow:visible; row-gap:4px;}",
      "#dictCard .simple{font-family:var(--reader-font); font-size:1rem; line-height:1.55; padding:0 0 2px;}",
      "#dictCard .chg{",
      "  display:inline; font:inherit; color:inherit; background:transparent; border:0; padding:0; margin:0;",
      "  cursor:pointer; border-radius:2px; text-decoration:underline dotted var(--accent);",
      "  text-decoration-thickness:2px; text-underline-offset:3px;",
      "}",
      "#dictCard .chg[aria-expanded=true]{background:var(--accent-soft);}",
      /* text on the ink tint is ink: muted slips under 4.5:1 on the tint on eight themes */
      "#dictCard .chgnote{",
      "  display:inline-block; margin:0 3px; padding:1px 7px; border-radius:6px; vertical-align:baseline;",
      "  font-family:var(--ui-font); font-size:var(--fs-small); line-height:1.5; color:var(--ink);",
      "  background:color-mix(in srgb, var(--ink) 6%, transparent);",
      "}",
      /* explain: one box per clause, its roles as small tiles */
      "#dictCard .clause{padding:12px 14px; margin:0 0 10px; border:var(--bw) solid var(--line); border-radius:var(--r-md); background:var(--raise);}",
      "#dictCard .clause .ctext{font-family:var(--reader-font); font-size:var(--fs-body); line-height:1.5;}",
      "#dictCard .clause .ckind{",
      "  display:inline-block; font-size:var(--fs-eyebrow); color:var(--accent); font-weight:700;",
      "  letter-spacing:.06em; margin:0 0 4px;",
      "}",
      "#dictCard .roles{display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;}",
      "#dictCard .role{",
      "  font-size:var(--fs-small); line-height:1.35; padding:5px 9px; border-radius:var(--r-sm);",
      "  background:color-mix(in srgb, var(--ink) 6%, transparent);",
      "}",
      "#dictCard .role b{",
      "  display:block; font-size:var(--fs-eyebrow); font-weight:700; letter-spacing:.08em;",
      "  text-transform:uppercase; color:var(--ink); margin-bottom:1px;",
      "}",
      "#dictCard .tense{font-size:var(--fs-small); color:var(--muted); margin-top:8px; line-height:1.4;}",
      "#dictCard .tense b{color:var(--ink); font-weight:600;}",
      "#dictCard .plain{font-family:var(--reader-font); font-size:1rem; line-height:1.55; padding:2px 0 2px;}",
      /* style: the register as a quiet pill, then a row per figure of speech; a row marks its
         own words in the quote above */
      "#dictCard #dictExpl > .sec:first-child{margin-top:0;}",
      "#dictCard .style{display:grid; gap:6px; margin:0 0 4px;}",
      "#dictCard .pill{",
      "  display:inline-block; padding:2px 9px; border-radius:999px; flex:none;",
      "  font-size:var(--fs-small); line-height:1.55; white-space:nowrap; border:1px solid var(--line);",
      "}",
      "#dictCard .pill.ink{background:var(--lamp-soft); color:var(--ink);}",
      "#dictCard .pill.acc{background:var(--accent-soft); border-color:var(--accent); color:var(--ink);}",
      "#dictCard .reg{display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px;}",
      "#dictCard .reg .rnote{color:var(--muted); font-size:var(--fs-small); line-height:1.45;}",
      "#dictCard .figrow{",
      "  display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; width:100%; margin:0; text-align:left;",
      "  padding:10px 12px; border:var(--bw) solid var(--line); border-radius:var(--r-sm); background:transparent;",
      "  color:var(--ink); font-family:inherit; font-size:var(--fs-small); line-height:1.5; cursor:pointer;",
      "  transition:background-color var(--t-fade), border-color var(--t-fade);",
      "}",
      "#dictCard .figrow:hover{background:var(--accent-soft);}",
      "#dictCard .figrow[aria-pressed=true]{background:var(--accent-soft); border:var(--bw-sel) solid var(--accent);}",
      "#dictCard .figrow .ftext{font-family:var(--reader-font);}",
      "#dictCard .figrow .fnote{color:var(--muted);}",
      "@media (pointer: coarse){ #dictCard .figrow{min-height:48px;} }",
      "#dictCard .quote mark.fig{",
      "  background:var(--accent-soft); color:var(--ink); border-radius:3px;",
      "  text-decoration:underline; text-decoration-color:var(--accent); text-decoration-thickness:2px; text-underline-offset:3px;",
      "}",
      /* chips: quiet actions; the footer's are tonal (the accent's tint, no border); .go is the one
         primary action of a panel (the AI rewrite, a translation, a download), filled with the lamp */
      "#dictCard .acts{display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 4px;}",
      "#dictCard .act{",
      "  display:inline-flex; align-items:center; gap:8px; min-height:40px; padding:0 16px; border-radius:999px;",
      "  border:1.5px solid var(--ctl-line); background:transparent; color:var(--ink);",
      "  font:inherit; font-size:var(--fs-body); font-weight:600; cursor:pointer; transition:background-color var(--t-fade), border-color var(--t-fade), transform var(--t-press) var(--ease-out);",
      "}",
      "#dictCard .act svg{width:18px; height:18px; stroke-width:2;}",
      "#dictCard .foot .act{background:var(--accent-soft); border-color:transparent; color:var(--ink);}",
      /* the dark tone: the card's dividers and inner boxes in --hair (app.css), which stays visible on the raised surface */
      ":root[data-tone=dark] #dictCard :is(.tabs, .foot, .tr-offer, .clause){border-color:var(--hair);}",
      "@media (hover:hover){ #dictCard .act:hover, #dictCard .foot .act:hover{background:color-mix(in srgb, var(--accent) 24%, transparent);} }",
      "#dictCard .act:active{transform:scale(.97);}",
      "#dictCard .act[aria-pressed=true]{background:var(--accent-soft); border-color:var(--accent);}",
      "#dictCard .act.go, #dictCard .act.go:hover{background:var(--lamp); border-color:var(--lamp); color:var(--on-fill);}",
      "#dictCard .act.go:hover{box-shadow:0 0 0 4px var(--glow);}",
      ":root[data-tone=contrast] #dictCard .foot .act{border-color:var(--line);}",
      /* a finger's 48px: the chips reach it through a margin they share with no neighbour (8px apart),
         the tabs and "Show all" are drawn at it, the selection pill's buttons reach its edges */
      "@media (pointer: coarse){",
      "  #dictCard .act{min-height:44px; position:relative;}",
      "  #dictCard .act::after{content:\"\"; position:absolute; inset:-2px;}",
      "  #dictCard [role=tab]::before{content:\"\"; position:absolute; inset:-2px 0;}",
      "  #dictCard .more{min-height:48px;}",
      "  #dictPill button::after{content:\"\"; position:absolute; inset:-4px 0;}",
      "}",
      /* a phone's footer keeps its actions (Highlight, Note…, Read from here, Copy) on one row: they
         share the width, at the small size, rather than wrapping into a second row of the card */
      "@media (max-width:560px){",
      "  #dictCard .foot{flex-wrap:nowrap;}",
      "  #dictCard .foot .act{flex:1 1 auto; min-width:0; justify-content:center; padding:0 8px; font-size:var(--fs-small); white-space:nowrap;}",
      "}",
      /* the Dutch words are longer (Markeren, Notitie…, Hier voorlezen, Kopiëren): a phone keeps them whole with less room around them */
      "@media (max-width:420px){",
      "  html[lang=nl] #dictCard .foot{gap:6px; padding-left:12px; padding-right:12px;}",
      "  html[lang=nl] #dictCard .foot .act{padding:0 2px;}",
      "}",
      /* the selection pill: Define / Explain and Highlight, a small popover above the selection */
      "#dictPill{",
      "  position:fixed; z-index:58; display:none; padding:4px; border-radius:999px;",
      "  border:var(--bw) solid var(--line); background:var(--raise); color:var(--ink);",
      "  font-family:var(--ui-font); font-size:var(--fs-body); font-weight:600;",
      "  box-shadow:var(--shadow-2);",
      "}",
      "#dictPill.on{display:flex;}",
      "#dictPill button{",
      "  display:flex; align-items:center; gap:8px; height:40px; padding:0 14px; position:relative;",
      "  border:0; border-radius:999px; background:transparent; color:inherit; font:inherit; cursor:pointer;",
      "}",
      "#dictPill button + button{margin-left:3px;}",
      "#dictPill button + button::before{content:\"\"; position:absolute; left:-2px; top:8px; bottom:8px; width:1px; background:var(--line);}",
      "#dictPill button svg{color:var(--lamp); stroke-width:2;}",
      "#dictPill button:hover{background:var(--accent-soft);}",
      "#dictPill button:active{transform:scale(.97);}",
      /* wider screens: a floating card by the bottom-right corner, no scrim */
      "@media (min-width:561px){",
      "  #dictScrim{background:transparent;}",
      /* above the dock (the read-aloud bar, the page-turn bar) and under the header */
      "  #dictCard{",
      "    left:auto; right:22px; bottom:calc(var(--dockH, 0px) + 22px); width:460px; max-width:calc(100vw - 44px);",
      "    max-height:min(72vh, calc(100vh - var(--headH, 0px) - var(--dockH, 0px) - 44px));",
      "    border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-2);",
      "    transform:translateY(12px); opacity:0;",
      "    transition:transform var(--t-fade) var(--ease-in), opacity var(--t-fade) ease, visibility 0s linear var(--t-fade);",
      "  }",
      "  #dictCard.open{transform:none; opacity:1; transition:transform var(--t-sheet) var(--ease-out), opacity var(--t-fade) ease, visibility 0s;}",
      "  #dictCard .grab{display:none;}",
      "  #dictCard .head{padding-top:10px;}",
      "  #dictCard .foot{padding-bottom:12px;}",
      "}",
      "@media (forced-colors: active){",
      "  #dictCard [role=tab][aria-selected=true]{text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:6px;}",
      "  #dictCard [role=tab][aria-disabled=true]{color:GrayText; opacity:1;}",
      "  #dictCard .bdg, #dictCard .mark, #dictPill{border:1px solid ButtonText;}",
      "  #dictCard .dot{background:ButtonText;}",
      "  #dictCard .pill{border-color:ButtonText;}",
      "  #dictCard .figrow[aria-pressed=true]{border-color:Highlight; border-width:2px;}",
      "  #dictCard .quote mark.fig{background:Highlight; color:HighlightText;}",
      "}"
    ].join("\n");
    document.head.appendChild(css);

    /* ---------- card markup ---------- */
    var scrim = document.createElement("div"); scrim.id = "dictScrim";
    var card  = document.createElement("div"); card.id  = "dictCard";
    card.innerHTML = '<div class="grab" aria-hidden="true"></div><div class="inner"></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(card);
    var inner = card.querySelector(".inner");
    var pill = document.createElement("div"); pill.id = "dictPill";
    pill.setAttribute("role", "group"); pill.setAttribute("aria-label", _t("Selected text"));
    pill.innerHTML = '<button type="button" data-act="lookup">' + icon("explain", 16) + '<span>' + esc(_t("Explain")) + '</span></button>' +
                     '<button type="button" data-act="mark">' + icon("highlight", 16) + '<span>' + esc(_t("Highlight")) + '</span></button>';
    document.body.appendChild(pill);
    /* the pill is announced when it appears (it never takes focus) */
    var pillLive = document.createElement("div"); pillLive.className = "ll-sr"; pillLive.setAttribute("aria-live", "polite");
    document.body.appendChild(pillLive);

    var openedAt = 0, cardOpener = null;
    card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false"); card.setAttribute("aria-label", _t("Dictionary")); card.tabIndex = -1;
    /* focusEl: a control inside the card to land on instead of the card itself */
    function openCard(focusEl){
      openedAt = Date.now(); scrim.classList.add("on"); card.classList.add("open"); hidePill();
      document.documentElement.classList.add("lock-card");   /* a phone holds the page still under the sheet */
      if (!cardOpener) cardOpener = document.activeElement;
      setTimeout(function(){
        if (!card.classList.contains("open")) return;
        var f = typeof focusEl === "function" ? focusEl() : focusEl;
        (f && card.contains(f) ? f : card).focus({ preventScroll: true });
      }, 60);
    }
    function closeCard(){
      var wasOpen = card.classList.contains("open");
      scrim.classList.remove("on"); card.classList.remove("open");
      document.documentElement.classList.remove("lock-card");
      clearHit();
      /* focus goes back where the card came from: the pill is shown again first when it came
         from there (the selection is still there), and a control no longer on screen gives way
         to the document itself rather than letting focus fall to the body */
      if (wasOpen && cardOpener && cardOpener.focus && document.contains(cardOpener) && cardOpener !== document.body){
        if (cardOpener.closest("#dictPill")) updatePill();
        var to = cardOpener.getClientRects().length ? cardOpener : document.getElementById("main");
        if (to) to.focus({ preventScroll: true });
      }
      cardOpener = null;
    }
    /* the click that some browsers synthesise when a long-press finger lifts must not close the card */
    scrim.addEventListener("click", function(){ if (Date.now() - openedAt > 400) closeCard(); });
    card.querySelector(".grab").addEventListener("click", closeCard);
    dragToClose(card, [card], closeCard, function(){ return card.classList.contains("open"); }, ".grab, .head");
    /* the card sits over the side panel and the sheet, so while it is open it takes Escape first
       (capture phase) and the layers under it stay as they are */
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape") return;
      if (card.classList.contains("open")){ e.preventDefault(); e.stopImmediatePropagation(); }
      closeCard();
    }, true);

    /* ---------- the card's shape ----------
       Everything the reader touches opens the same card: a head, a strip of tabs, a panel per
       tab and a footer of actions on the passage. cur is what the card shows now; every
       asynchronous answer checks cur.gen, so a late one never draws over the next word. A
       panel keeps its result while the card stays open, so switching tabs costs nothing. */
    var TABS = {
      meaning:   { label: _t("Meaning"),            icon: "meaning" },
      parts:     { label: _t("Parts"),              icon: "parts" },
      explain:   { label: _tc("tab", "Explain"),    icon: "explain" },
      simpler:   { label: _t("Simpler"),            icon: "simpler", attr: ' data-m="simplify"' }
    };
    var cur = null, gen = 0;
    function buildCard(o){
      o.gen = ++gen; o.lazy = o.lazy || {}; cur = o;
      stopSpeech();
      var h = '<div class="head"><div class="mark">' + icon(o.icon, 20) + '</div><div class="hw">' +
              '<div class="term"' + (o.kind === "word" ? ' lang="en"' : '') + '>' + esc(o.title) + '</div>' + (o.ipa ? '<div class="ipa">' + esc(o.ipa) + '</div>' : '') + '</div>' +
              '<button type="button" class="x" aria-label="' + esc(_t("Close")) + '" title="' + esc(_t("Close")) + '">' + icon("close", 20) + '</button></div>';
      /* the translation line (filled by translate.js): under the word, or under the sentence it translates */
      var trl = o.tr ? '<div class="trline' + (o.quote ? ' clamp' : '') + '" id="dictTr" data-kind="' + o.tr + '" hidden>' +
                       '<div class="tr-slot" data-kind="' + o.tr + '" aria-live="polite"></div></div>' : '';
      if (o.quote) h += '<div class="quote clamp" id="dictQuote" lang="en">' + esc(o.quote) + '</div>' + trl +
                        '<button type="button" class="more" hidden aria-expanded="false" aria-controls="dictQuote' + (o.tr ? ' dictTr' : '') + '">' + esc(_t("Show all")) + '</button>';
      else h += trl;
      /* one tab needs no strip (the lookup field): its panel is a plain region then */
      var tabbed = o.tabs.length > 1;
      if (tabbed){
        h += '<div class="tabs" role="tablist" aria-label="' + esc(o.tabsLabel) + '">';
        o.tabs.forEach(function(t){
          var d = TABS[t];
          h += '<button type="button" role="tab" id="dictTab-' + t + '" aria-controls="dictPanel-' + t + '" aria-selected="false" tabindex="-1" data-tab="' + t + '"' +
               (d.attr || '') + (o.off && o.off[t] ? ' aria-disabled="true"' : '') + '>' + icon(d.icon, 18) + '<span>' + esc(d.label) + '</span></button>';
        });
        h += '</div>';
      }
      h += '<div class="body">';
      o.tabs.forEach(function(t){
        h += '<div class="panel" id="dictPanel-' + t + '" data-tab="' + t + '"' + (tabbed ? ' role="tabpanel" aria-labelledby="dictTab-' + t + '" tabindex="0"' : '') + ' hidden>' +
             ((o.panels && o.panels[t]) || '') + '</div>';
      });
      h += '</div>';
      if (o.foot.length){
        h += '<div class="foot" id="dictMarkActs">';
        o.foot.forEach(function(a){
          h += '<button type="button" class="act" data-m="' + a.m + '"' + (a.id ? ' id="' + a.id + '"' : '') + (a.pressed ? ' aria-pressed="false"' : '') + '>' + esc(a.label) + '</button>';
        });
        h += '</div>';
      }
      inner.innerHTML = h;
      card.setAttribute("aria-label", o.dialogLabel);
      inner.querySelector(".x").addEventListener("click", closeCard);
      var more = inner.querySelector(".more");
      if (more) more.addEventListener("click", function(){
        var open = !inner.querySelector("#dictQuote").classList.toggle("clamp"), trl = inner.querySelector("#dictTr");
        if (trl) trl.classList.toggle("clamp", !open);
        more.textContent = open ? _t("Show less") : _t("Show all");
        more.setAttribute("aria-expanded", open ? "true" : "false");
      });
      var strip = inner.querySelector(".tabs");
      if (strip){
        strip.addEventListener("click", function(e){
          var b = e.target.closest("[role=tab]");
          if (b && b.getAttribute("aria-disabled") !== "true") select(b.dataset.tab, false);
        });
        /* arrow keys walk the tabs that have something to show; Home and End jump */
        strip.addEventListener("keydown", function(e){
          var step = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: 0 };
          if (!(e.key in step)) return;
          var list = tabButtons().filter(function(b){ return b.getAttribute("aria-disabled") !== "true"; });
          var i = list.indexOf(inner.querySelector("[role=tab][aria-selected=true]"));
          var j = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + step[e.key] + list.length) % list.length;
          e.preventDefault();
          if (list[j]) select(list[j].dataset.tab, true);
        });
      }
      var foot = inner.querySelector(".foot");
      if (foot) foot.addEventListener("click", function(e){ var b = e.target.closest("button"); if (b) footAct(b); });
      select(o.active);
      refreshMore();
    }
    /* "Show all" is there while the quote, or the translation under it, is cut short */
    function refreshMore(){
      var more = inner.querySelector(".more"), q = inner.querySelector("#dictQuote"), t = inner.querySelector("#dictTr .tr-out");
      if (!more || !q || !more.hidden) return;
      if (q.scrollHeight > q.clientHeight + 2 || (t && t.scrollHeight > t.clientHeight + 2)) more.hidden = false;
    }
    function tabButtons(){ return Array.prototype.slice.call(inner.querySelectorAll("[role=tab]")); }
    function tabEl(t){ return inner.querySelector('[role=tab][data-tab="' + t + '"]'); }
    function panelEl(t){ return inner.querySelector('.panel[data-tab="' + t + '"]'); }
    function select(t, focus){
      if (!cur || cur.tabs.indexOf(t) < 0) return;
      cur.active = t;
      tabButtons().forEach(function(b){
        var on = b.dataset.tab === t;
        b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
        if (on){ var d = b.querySelector(".dot"); if (d) d.remove(); }
      });
      Array.prototype.forEach.call(inner.querySelectorAll(".panel"), function(p){ p.hidden = p.dataset.tab !== t; });
      var body = inner.querySelector(".body"); if (body) body.scrollTop = 0;
      if (focus){ var b = tabEl(t); if (b) b.focus({ preventScroll: true }); }
      /* a panel drawn the first time its tab opens */
      if (cur.lazy[t]){ var f = cur.lazy[t]; delete cur.lazy[t]; f(); }
    }
    /* a tab that has nothing yet is dimmed; when its answer comes it lights up, with a count or
       a dot so the reader knows there is something there */
    function markTab(t, mark){
      var b = tabEl(t); if (!b) return;
      b.removeAttribute("aria-disabled");
      var old = b.querySelector(".bdg, .dot"); if (old) old.remove();
      if (mark === "dot"){ if (cur && cur.active !== t) b.insertAdjacentHTML("beforeend", '<span class="dot" aria-hidden="true"></span>'); }
      else if (mark) b.insertAdjacentHTML("beforeend", '<span class="bdg">' + esc(mark) + '</span>');
    }
    /* the footer acts on the passage in the book; Copy takes what the open tab shows */
    function footAct(b){
      var m = b.dataset.m;
      if (!cur) return;
      if (m === "copy"){ copyPlain(copyText()); return; }
      if (m === "say"){ speakPlain(cur.title, b, null); return; }
      var L = window.__ll;
      if (!L || !L.Marks || !cur.span) return;
      if (m === "read"){ closeCard(); L.Speak.start(cur.span.start); return; }
      clearHit();
      var mk = L.Marks.addHighlight(cur.span.start, cur.span.end);
      closeCard();
      if (mk && m === "note") L.Marks.openPanel(mk.key);
      else if (mk) L.Marks.toast(_t("Highlighted"));
    }
    function copyText(){
      if (cur.active === "simpler" && cur.simple) return cur.simple;
      return cur.kind === "word" ? cur.title : cur.sentence;
    }
    function copyPlain(s){
      var done = function(){ if (window.__ll && window.__ll.Marks) window.__ll.Marks.toast(_t("Copied")); };
      var fallback = function(){
        var ta = document.createElement("textarea");
        ta.value = s; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch(_){}
        document.body.removeChild(ta);
        done();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, fallback);
      else fallback();
    }
    /* one plain utterance at a time (Say it, Read aloud in Simpler): the narrator's voice at the
       saved rate; the button shows it is speaking and a second press stops it */
    var utter = null, utterBtn = null, utterLabel = "";
    function resetSpeechBtn(){
      if (utterBtn){ if (utterLabel) utterBtn.textContent = utterLabel; utterBtn.setAttribute("aria-pressed", "false"); }
      utterBtn = null; utterLabel = "";
    }
    function stopSpeech(){
      if (!utter) return;
      utter = null;
      try { speechSynthesis.cancel(); } catch(_){}
      resetSpeechBtn();
    }
    /* lang: the text's language (an example sentence), when the narrator's voice may not speak it */
    function speakPlain(s, btn, stopLabel, lang){
      if (utter){ stopSpeech(); return; }
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
      if (window.__ll && window.__ll.Speak && window.__ll.Speak.isPlaying()) window.__ll.Speak.pause();
      var u = new SpeechSynthesisUtterance(s);
      var name = Store.get("ll_tts_voice") || "", vs = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
      for (var i = 0; i < vs.length; i++) if (vs[i].name === name){ u.voice = vs[i]; break; }
      if (lang){
        u.lang = lang;
        var vl = function(v){ return String(v.lang || "").slice(0, 2).toLowerCase() === lang; };
        if (u.voice && !vl(u.voice)) u.voice = null;
        for (var j = 0; j < vs.length && !u.voice; j++) if (vl(vs[j]) && vs[j].localService) u.voice = vs[j];
        for (var k = 0; k < vs.length && !u.voice; k++) if (vl(vs[k])) u.voice = vs[k];
      }
      u.rate = Math.min(2, Math.max(0.5, parseFloat(Store.get("ll_tts_rate") || "1") || 1));
      u.onend = u.onerror = function(){ if (utter === u){ utter = null; resetSpeechBtn(); } };
      utter = u; utterBtn = btn; utterLabel = stopLabel ? btn.textContent : "";
      if (stopLabel) btn.textContent = stopLabel;
      btn.setAttribute("aria-pressed", "true");
      try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch(_){ utter = null; resetSpeechBtn(); }
    }
    /* closing the card (any way) stops what it was saying */
    new MutationObserver(function(){ if (!card.classList.contains("open")) stopSpeech(); }).observe(card, { attributes: true, attributeFilter: ["class"] });

    /* ---------- highlight the tapped word ---------- */
    var hitEl = null;
    function clearHit(){
      if (!hitEl) return;
      var p = hitEl.parentNode;
      if (p){ p.replaceChild(document.createTextNode(hitEl.textContent), hitEl); p.normalize(); }
      hitEl = null;
      Anchor.invalidate();
      if (p) Focus.again(p);
    }
    function markHit(node, s, e){
      clearHit();
      try {
        var r = document.createRange();
        r.setStart(node, s); r.setEnd(node, e);
        var sp = document.createElement("span");
        sp.className = "ll-hit";
        r.surroundContents(sp);
        hitEl = sp;
        Anchor.invalidate();
      } catch(_){}
    }

    /* ---------- dictionary data ----------
       dict1–dict6.json are alphabetical ranges (dict-index.json holds the first key of
       each), so a word tells us which chunk to fetch; chunks are loaded on demand and kept. */
    var DICT_PARTS = 6, DB = {}, chunkJobs = {}, bounds = null, boundsJob = null;
    function loadIndex(){
      if (bounds) return Promise.resolve(bounds);
      if (boundsJob) return boundsJob;
      boundsJob = fetch("./dict-index.json").then(function(r){ if (!r.ok) throw 0; return r.json(); })
        .then(function(j){ bounds = j.starts; DICT_PARTS = j.chunks || bounds.length; return bounds; })
        .catch(function(){ bounds = ["-", "continuo", "grower", "neo-lamarckism", "scraggy", "vortex"]; return bounds; });
      return boundsJob;
    }
    function chunkFor(w){
      var i = 0;
      for (var k = 1; k < bounds.length; k++){ if (w >= bounds[k]) i = k; }
      return i + 1;
    }
    function loadChunk(i){
      if (DB[i]) return Promise.resolve(DB[i]);
      if (chunkJobs[i]) return chunkJobs[i];
      chunkJobs[i] = fetch("./dict" + i + ".json").then(function(r){ if (!r.ok) throw 0; return r.json(); })
        .then(function(part){ DB[i] = part; return part; })
        .catch(function(){ chunkJobs[i] = null; return {}; });   /* not kept: the next lookup tries again */
      return chunkJobs[i];
    }
    /* make sure every chunk these words live in is loaded, then return a synchronous finder */
    function withWords(words){
      return loadIndex().then(function(){
        var need = {};
        words.forEach(function(w){ if (w) need[chunkFor(String(w).toLowerCase())] = 1; });
        return Promise.all(Object.keys(need).map(function(i){ return loadChunk(+i); }));
      }).then(function(){ return find; });
    }
    function find(w){
      if (!bounds) return null;
      var part = DB[chunkFor(w)];
      return part && part[w] ? part[w] : null;
    }
    function dictReady(){ return Object.keys(DB).length > 0; }
    /* the index is tiny — fetch it when idle so the first tap only waits for one chunk */
    if (window.requestIdleCallback) requestIdleCallback(function(){ loadIndex(); }, { timeout: 3000 });
    else setTimeout(loadIndex, 1200);

    var IRREG = {"was":"be","were":"be","been":"be","am":"be","is":"be","are":"be","being":"be","had":"have","has":"have","having":"have","did":"do","does":"do","done":"do","went":"go","gone":"go","goes":"go","gave":"give","given":"give","took":"take","taken":"take","came":"come","became":"become","saw":"see","seen":"see","knew":"know","known":"know","got":"get","gotten":"get","made":"make","said":"say","thought":"think","told":"tell","found":"find","left":"leave","felt":"feel","kept":"keep","held":"hold","brought":"bring","bought":"buy","caught":"catch","taught":"teach","sought":"seek","fought":"fight","stood":"stand","understood":"understand","heard":"hear","led":"lead","meant":"mean","met":"meet","paid":"pay","ran":"run","sat":"sit","sold":"sell","sent":"send","spent":"spend","spoke":"speak","spoken":"speak","stole":"steal","stolen":"steal","swore":"swear","sworn":"swear","swam":"swim","swum":"swim","threw":"throw","thrown":"throw","wore":"wear","worn":"wear","won":"win","wrote":"write","written":"write","woke":"wake","woken":"wake","drew":"draw","drawn":"draw","drove":"drive","driven":"drive","drank":"drink","drunk":"drink","ate":"eat","eaten":"eat","fell":"fall","fallen":"fall","flew":"fly","flown":"fly","forgot":"forget","forgotten":"forget","froze":"freeze","frozen":"freeze","grew":"grow","grown":"grow","hid":"hide","hidden":"hide","hung":"hang","lain":"lie","laid":"lay","lost":"lose","rang":"ring","rung":"ring","rose":"rise","risen":"rise","rode":"ride","ridden":"ride","sang":"sing","sung":"sing","sank":"sink","sunk":"sink","shook":"shake","shaken":"shake","shone":"shine","shot":"shoot","slept":"sleep","slid":"slide","sprang":"spring","sprung":"spring","stuck":"stick","struck":"strike","strung":"string","swept":"sweep","swung":"swing","tore":"tear","torn":"tear","trod":"tread","trodden":"tread","wept":"weep","wrung":"wring","bent":"bend","bit":"bite","bitten":"bite","bled":"bleed","blew":"blow","blown":"blow","bred":"breed","broke":"break","broken":"break","built":"build","burnt":"burn","chose":"choose","chosen":"choose","clung":"cling","crept":"creep","dealt":"deal","dug":"dig","dreamt":"dream","fed":"feed","fled":"flee","flung":"fling","forbade":"forbid","forbidden":"forbid","knelt":"kneel","lent":"lend","lit":"light","leapt":"leap","learnt":"learn","shrank":"shrink","shrunk":"shrink","smelt":"smell","spelt":"spell","spilt":"spill","spat":"spit","spoilt":"spoil","spun":"spin","strode":"stride","strove":"strive","striven":"strive","swollen":"swell","wove":"weave","woven":"weave","withdrew":"withdraw","withdrawn":"withdraw","arose":"arise","arisen":"arise","bore":"bear","borne":"bear","beat":"beat","beaten":"beat","begun":"begin","began":"begin","bound":"bind","dwelt":"dwell","hewn":"hew","overcame":"overcome","shrunken":"shrink","children":"child","men":"man","women":"woman","feet":"foot","teeth":"tooth","geese":"goose","mice":"mouse","people":"person","lice":"louse","oxen":"ox","knives":"knife","wives":"wife","lives":"life","leaves":"leaf","halves":"half","shelves":"shelf","wolves":"wolf","thieves":"thief","calves":"calf","loaves":"loaf","selves":"self","scarves":"scarf","hooves":"hoof","elves":"elf","sheaves":"sheaf","criteria":"criterion","phenomena":"phenomenon","his":"he","him":"he","her":"she","hers":"she","its":"it","their":"they","them":"they","theirs":"they","our":"we","ours":"we","us":"we","mine":"I","your":"you","yours":"you"};


    /* Webster lists inflected forms as bare cross-references ("of Give",
       "pl. of Child"). Those are useless in a card, so prefer a real entry. */
    var STUB = /^(&\s*)?((p\.\s*p\.|pl\.|sing\.|imp\.|past|a\s+form)\s*(&\s*)?)*(of|see)\b/i;
    function isStub(entry){
      return entry.m.every(function(m){ return STUB.test((m.d || "").trim()); });
    }

    /* inflection guesses, so "gave" / "lentils" / "shelves" / "whistling" resolve */
    function variants(w){
      var o = IRREG[w] ? [IRREG[w], w] : [w];
      function add(x){ if (x && x.length > 1 && o.indexOf(x) < 0) o.push(x); }
      if (w.length > 3){
        if (/ies$/.test(w)) add(w.slice(0,-3) + "y");
        if (/(ses|xes|zes|ches|shes)$/.test(w)) add(w.slice(0,-2));
        if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0,-1));
        if (/ied$/.test(w)) add(w.slice(0,-3) + "y");
        if (/ed$/.test(w)){ add(w.slice(0,-1)); add(w.slice(0,-2)); }
        if (/ing$/.test(w)){ add(w.slice(0,-3)); add(w.slice(0,-3) + "e"); }
        if (/(.)\1(ed|ing|er|est)$/.test(w)) add(w.replace(/(.)\1(ed|ing|er|est)$/, "$1"));
        if (/est$/.test(w)){ add(w.slice(0,-3)); add(w.slice(0,-2)); }
        if (/er$/.test(w)){ add(w.slice(0,-2)); add(w.slice(0,-1)); }
        if (/ly$/.test(w)) add(w.slice(0,-2));
        if (/'s$|’s$/.test(w)) add(w.slice(0,-2));
      }
      return o;
    }

    function lookupLocal(word){
      var w = word.toLowerCase().replace(/[’]/g, "'");
      var tries = variants(w);
      return withWords(tries).then(function(){
        var fallback = null;
        for (var i = 0; i < tries.length; i++){
          var e = find(tries[i]);
          if (!e) continue;
          if (!isStub(e)) return { word: tries[i], entry: e };
          if (!fallback) fallback = { word: tries[i], entry: e };
        }
        return fallback;
      });
    }

    /* online fallback — free, no key needed */
    function lookupOnline(word){
      return fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word))
        .then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(j){
          var e = j && j[0]; if (!e) return null;
          var ipa = "";
          (e.phonetics || []).some(function(p){ if(p.text){ ipa = p.text; return true; } });
          var m = [];
          (e.meanings || []).forEach(function(mm){
            (mm.definitions || []).slice(0,3).forEach(function(dd){
              m.push({ p: mm.partOfSpeech, d: dd.definition });
            });
          });
          if (!m.length) return null;
          return { word: e.word, entry: { i: ipa || e.phonetic || "", m: m.slice(0,6) }, online: true };
        })
        .catch(function(){ return null; });
    }

    function esc(s){
      return String(s).replace(/[&<>"]/g, function(c){
        return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c];
      });
    }
    /* a sentence of the interface with markup in its {slots}: its own words are escaped, the slots are
       filled with the markup given (so a Dutch sentence can put the book's words where Dutch wants them) */
    function tH(s, html){
      return esc(_t(s)).replace(/\{(\w+)\}/g, function(m, k){ return html && Object.prototype.hasOwnProperty.call(html, k) ? html[k] : m; });
    }
    /* the book's words and the dictionary's (English whatever the interface's language): marked as such,
       for hyphenation and the screen reader's voice */
    function enH(s){ return '<span lang="en">' + esc(s) + '</span>'; }

    /* the Meaning panel, and the head once the headword and its sound are known */
    function renderWord(term, res, my){
      if (!cur || cur.kind !== "word" || cur.gen !== my) return;
      var p = panelEl("meaning"), h = '';
      if (res){
        cur.title = res.word;
        inner.querySelector(".term").textContent = res.word;
        var hw = inner.querySelector(".hw"), ipa = hw.querySelector(".ipa");
        if (res.entry.i){
          if (!ipa){ ipa = document.createElement("div"); ipa.className = "ipa"; hw.appendChild(ipa); }
          ipa.textContent = res.entry.i;
        } else if (ipa) ipa.remove();
        h += '<div class="senses">';
        res.entry.m.slice(0,6).forEach(function(m){
          h += '<div class="sense">';
          if (m.p) h += '<span class="pos">' + esc(_tc("pos", m.p)) + '</span> ';
          h += enH(m.d);
          if (m.s && m.s.length) h += '<span class="syn">' + tH("also: {words}", { words: enH(m.s.join(", ")) }) + '</span>';
          h += '</div>';
        });
        h += '</div>';
        if (res.online) h += '<div class="note">' + esc(_t("Looked up online — not in the offline dictionary.")) + '</div>';
      } else {
        h += '<div class="empty">' + esc(navigator.onLine ? _t("No definition found.") : _t("No definition found — you’re offline, so only the built-in dictionary was searched.")) + '</div>';
      }
      p.innerHTML = h;
      renderParts(term, res);
      runExamples(term, res, my);
    }

    /* ---------- word parts (prefix / root / suffix, see llMorph) ----------
       Drawn in the Parts panel once morph.js and the chunks for the possible stems are in;
       the tab lights up with the number of parts. The definition never waits for it. */
    var partsToken = 0;
    function shortDef(entry){
      var m = null;
      if (window.llExplain){
        var best = window.llExplain.bestSense(entry, null, window.llExplain.rank);
        if (best) m = best.m;
      }
      if (!m){
        for (var i = 0; i < entry.m.length; i++) if (entry.m[i].p){ m = entry.m[i]; break; }
        m = m || entry.m[0];
      }
      var d = window.llExplain ? window.llExplain.cleanDef(m.d, m.p) : String(m.d || "").replace(/\s+/g, " ").trim();
      if (d.length > 60) d = d.slice(0, 57).replace(/\s+\S*$/, "") + "…";
      return d;
    }
    /* what the analyser is told about a dictionary word: a short definition, its parts of
       speech, and whether some senses (Webster's) carry no tag at all */
    function partLookup(w){
      var tries = IRREG[w] ? [w, IRREG[w]] : [w];
      for (var i = 0; i < tries.length; i++){
        var e = find(tries[i]);
        if (!e || isStub(e)) continue;
        var pos = [], open = false;
        e.m.forEach(function(m){ if (m.p){ if (pos.indexOf(m.p) < 0) pos.push(m.p); } else open = true; });
        return { d: shortDef(e), pos: pos, open: open, obscure: !pos.length };
      }
      return null;
    }
    function renderParts(term, res){
      var token = ++partsToken, my = cur.gen;
      var words = [term.toLowerCase().replace(/[’]/g, "'")];
      if (res && res.word && words.indexOf(res.word) < 0) words.push(res.word);
      need(["morph"]).then(function(){
        var cands = [];
        words.forEach(function(w){ cands = cands.concat(window.llMorph.candidates(w)); });
        return withWords(cands.concat(cands.map(function(c){ return IRREG[c]; })));
      }).then(function(){
        if (token !== partsToken || !cur || cur.gen !== my || !card.classList.contains("open")) return;
        var r = null;
        for (var i = 0; i < words.length && !r; i++) r = window.llMorph.analyse(words[i], partLookup);
        if (!r) return;
        var h = '<div class="parts">';
        r.parts.forEach(function(p){
          /* a base is shown as the word it is (hurry, not the hurri- of "unhurried") */
          /* the kind and the origin are morph.js's English words, put into the interface's language here */
          var tile = '<span class="pt" lang="en">' + esc(p.kind === "base" && p.word ? p.word : p.text) + '</span><small class="pk">' + esc(_t(p.kind)) + '</small>' +
                     /* a link letter's "joins the parts" is morph.js's own words, not a meaning from a table */
                     (p.meaning ? (p.kind === "link" ? '<span class="pm">' + esc(_t(p.meaning)) + '</span>' : '<span class="pm" lang="en">' + esc(p.meaning) + '</span>') : '') +
                     (p.origin ? '<i class="po">' + esc(_t(p.origin)) + '</i>' : '');
          if (p.kind === "base" && p.word) h += '<button type="button" class="part" data-w="' + esc(p.word) + '" title="' + esc(_t("Look up “{word}”", { word: p.word })) + '">' + tile + '</button>';
          else h += '<span class="part"' + (p.origin ? ' title="' + esc(_t(p.origin)) + '"' : '') + '>' + tile + '</span>';
        });
        h += '</div>';
        if (r.gloss) h += '<div class="gloss">' + tH("so: {gloss}", { gloss: enH(r.gloss) }) + '</div>';
        if (r.confidence < 0.5) h += '<div class="note">' + esc(_t("A guess from the spelling.")) + '</div>';
        var box = document.createElement("div");
        box.className = "wordparts";
        box.innerHTML = h;
        box.addEventListener("click", function(e){
          var b = e.target.closest("button.part");
          if (b) defineWord(b.dataset.w);
        });
        var p = panelEl("parts");
        p.innerHTML = ""; p.appendChild(box);
        markTab("parts", String(r.parts.length));
      }).catch(function(err){ console.warn("Word parts unavailable", err); });
    }

    /* ---------- example sentences (Tatoeba, CC BY 2.0 FR) ----------
       Under the meaning, once it is drawn: three sentences with the word in them (highlighted), each
       with its translation under it, and More for five more. Asked for only when online and the switch
       in the Dictionary settings is on (the default): 4 s at most, and nothing at all on a failure or
       when there are none, so the card never waits for it. Each word's answer is kept in Cache Storage
       (tatoeba-examples, which sw.js keeps across releases), so a word seen before has them offline. */
    var EX_KEY = "ll_examples", EX_CACHE = "tatoeba-examples", EX_MAX = 800, EX_API = "https://api.tatoeba.org/unstable/sentences";
    var ISO3 = { en: "eng", nl: "nld", de: "deu", fr: "fra", es: "spa", it: "ita", pt: "por", sv: "swe", da: "dan", no: "nob", fi: "fin",
                 pl: "pol", cs: "ces", sk: "slk", hu: "hun", ro: "ron", el: "ell", tr: "tur", ru: "rus", uk: "ukr", ar: "ara", he: "heb",
                 fa: "pes", hi: "hin", bn: "ben", ur: "urd", id: "ind", ms: "zsm", vi: "vie", th: "tha", zh: "cmn", "zh-Hant": "cmn",
                 ja: "jpn", ko: "kor", sw: "swh", ca: "cat" };
    function examplesOn(){ return Store.get(EX_KEY) !== "0"; }
    /* the book's language, and the reader's for the translations: the language chosen under Translation,
       else the device's, else (a book already in it) the other side of Dutch ↔ English */
    function exLangs(){
      var L = window.__ll, src = L && L.Speak && L.Speak.docLang ? L.Speak.docLang() : "en";
      if (!ISO3[src]) return null;
      var picked = Store.get("ll_tr_to"), to = picked && picked !== "auto" && ISO3[picked] ? picked : trReader();
      if (to.slice(0, 2) === src) to = picked && picked !== "auto" && ISO3[picked] && picked.slice(0, 2) !== src ? picked : (src === "nl" ? "en" : "nl");
      if (ISO3[to] === ISO3[src]) to = src === "nl" ? "en" : "nl";
      return { src: src, to: to.slice(0, 2), from3: ISO3[src], to3: ISO3[to] };
    }
    var EX_WORD = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;
    function exTokens(t){ return (String(t).match(EX_WORD) || []).map(function(w){ return w.toLowerCase().replace(/’/g, "'"); }); }
    /* a stem for the forms the search also finds (whistling, whistled; fietsen, fietste) */
    function exStem(w){
      var st = w.replace(/(ing|ed|es|en|er|est|ly|te|de|s|e|y|t)$/, "");
      return st.length >= 3 && w.length > 3 ? st : "";
    }
    function exMatch(w, forms, stem){ return forms.indexOf(w) >= 0 || !!(stem && w.indexOf(stem) === 0 && w.length - stem.length <= 4); }
    function exMark(text, forms, stem){
      var out = "", last = 0, m;
      EX_WORD.lastIndex = 0;
      while ((m = EX_WORD.exec(text))){
        if (!exMatch(m[0].toLowerCase().replace(/’/g, "'"), forms, stem)) continue;
        out += esc(text.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
        last = m.index + m[0].length;
      }
      return out + esc(text.slice(last));
    }
    /* the exact form tapped first, then the base form; 4–16 words; a direct translation */
    function exScore(s, tw, forms){
      var toks = exTokens(s.t), n = toks.length, k = 0;
      if (toks.indexOf(tw) >= 0) k += 6;
      else if (toks.some(function(w){ return forms.indexOf(w) >= 0; })) k += 3;
      k += n >= 4 && n <= 16 ? 3 : -Math.min(3, (n < 4 ? 4 - n : n - 16) / 2);
      if (s.d) k += 2;
      return k;
    }
    /* the answer, cut down to what the card shows: the sentence, one translation (a direct one first) */
    function exItems(j, to3){
      var out = [];
      ((j && j.data) || []).forEach(function(s){
        if (!s || !s.text || s.is_unapproved) return;
        var tr = null;
        [].concat.apply([], s.translations || []).forEach(function(t){
          if (t && t.lang === to3 && t.text && !t.is_unapproved && (!tr || (t.is_direct && !tr.d))) tr = { t: t.text, d: !!t.is_direct };
        });
        if (tr) out.push({ id: s.id, t: s.text, tr: tr.t, d: tr.d });
      });
      return out;
    }
    function exUrl(q, L){ return EX_API + "?lang=" + L.from3 + "&q=" + encodeURIComponent(q) + "&trans:lang=" + L.to3 + "&sort=relevance&limit=40"; }
    function exCache(){ return window.caches && caches.open ? caches.open(EX_CACHE) : Promise.reject(new Error("no cache")); }
    function exCached(url){
      return exCache().then(function(c){ return c.match(url); }).then(function(r){ return r ? r.json() : null; }).catch(function(){ return null; });
    }
    function exKeep(url, items){
      exCache().then(function(c){
        return c.put(url, new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } }))
          .then(function(){ return c.keys(); })
          .then(function(keys){ return Promise.all(keys.slice(0, Math.max(0, keys.length - EX_MAX)).map(function(k){ return c.delete(k); })); });
      }).catch(function(){});
    }
    function exFetch(url, L){
      var ctl = window.AbortController ? new AbortController() : null, timer = 0;
      var late = new Promise(function(_, no){ timer = setTimeout(function(){ if (ctl) ctl.abort(); no(new Error("timeout")); }, 4000); });
      var job = fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer" })
        .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
      return Promise.race([job, late]).then(function(j){ clearTimeout(timer); return exItems(j, L.to3); },
                                            function(e){ clearTimeout(timer); throw e; });
    }
    /* one word: the kept answer, else (online) Tatoeba's */
    function exGet(q, L){
      var url = exUrl(q, L);
      return exCached(url).then(function(hit){
        if (hit) return hit;
        if (!navigator.onLine) return [];
        return exFetch(url, L).then(function(items){ if (items.length) exKeep(url, items); return items; }, function(){ return []; });
      });
    }
    function runExamples(term, res, my){
      if (!examplesOn() || !cur || cur.kind !== "word" || cur.gen !== my) return;
      var L = exLangs(), p = panelEl("meaning");
      var tw = String(term).toLowerCase().replace(/’/g, "'").replace(/^['-]+|['-]+$/g, "");
      if (!L || !p || tw.length < 2 || /\d/.test(tw) || tw.length > 40) return;
      var forms = [tw];
      /* the card's base form is the English dictionary's, so only an English book asks for it too */
      if (L.src === "en" && res && res.word && res.word.toLowerCase() !== tw && !/\s/.test(res.word)) forms.push(res.word.toLowerCase());
      var stem = exStem(forms[forms.length - 1]) || exStem(tw);
      var box = document.createElement("section");
      box.className = "ex"; box.setAttribute("aria-labelledby", "dictExL"); box.setAttribute("aria-busy", "true");
      box.innerHTML = '<div class="sec" id="dictExL">' + esc(_t("Example sentences")) + '</div>' +
                      '<div class="ex-wait" aria-hidden="true"><span></span><span></span></div>';
      /* offline, only the kept answer can come: nothing shows unless it does */
      box.hidden = !navigator.onLine;
      p.appendChild(box);
      Promise.all(forms.map(function(q){ return exGet(q, L); })).then(function(lists){
        if (!cur || cur.gen !== my || !box.parentNode) return;
        var seen = {}, pool = [];
        lists.forEach(function(list, li){
          (list || []).forEach(function(s){
            if (!s || !s.t || seen[s.t]) return;
            seen[s.t] = 1;
            pool.push({ s: s, k: exScore(s, tw, forms) - li, i: pool.length });
          });
        });
        if (!pool.length){ box.remove(); return; }
        pool.sort(function(a, b){ return b.k - a.k || a.i - b.i; });
        box.hidden = false; box.removeAttribute("aria-busy");
        box.innerHTML = '<div class="sec" id="dictExL">' + esc(_t("Example sentences")) + '</div><ul class="ex-list" data-no-i18n></ul>' +
                        '<button type="button" class="ex-more">' + esc(_t("More")) + '</button>';
        var ul = box.querySelector(".ex-list"), more = box.querySelector(".ex-more"), shown = 0;
        function draw(n){
          var end = Math.min(pool.length, shown + n), h = "";
          for (var i = shown; i < end; i++){
            var s = pool[i].s;
            h += '<li><button type="button" class="ex-s" data-i="' + i + '" lang="' + L.src + '" aria-pressed="false" title="' + esc(_t("Read aloud")) + '">' + exMark(s.t, forms, stem) + '</button>' +
                 '<div class="ex-tr" lang="' + L.to + '">' + esc(s.tr) + '</div>' +
                 '<a class="ex-src" href="https://tatoeba.org/sentences/show/' + encodeURIComponent(s.id) + '" target="_blank" rel="noopener noreferrer" lang="en">Tatoeba · CC BY 2.0 FR</a></li>';
          }
          var first = shown;
          ul.insertAdjacentHTML("beforeend", h);
          shown = end;
          more.hidden = shown >= pool.length;
          return ul.querySelector('.ex-s[data-i="' + first + '"]');
        }
        draw(3);
        more.addEventListener("click", function(){
          var f = draw(5);
          if (more.hidden && f) f.focus({ preventScroll: true });
        });
        ul.addEventListener("click", function(e){
          var b = e.target.closest(".ex-s"); if (!b) return;
          var s = pool[+b.dataset.i] && pool[+b.dataset.i].s; if (!s) return;
          if (utter && utterBtn !== b) stopSpeech();
          speakPlain(s.t, b, null, L.src);
        });
      });
    }

    /* the translation line is handed to translate.js as soon as the card is built: it translates at once when the
       text is in another language than the reader's (a quiet "translating…" meanwhile) and stays hidden otherwise */
    function runTranslate(text){
      var line = inner.querySelector("#dictTr"), el = line && line.querySelector(".tr-slot"), my = cur.gen;
      if (!el) return;
      Translate.slot(text, el, { box: line, onResult: function(){ if (cur && cur.gen === my) refreshMore(); } });
    }

    /* the word card: Meaning at once, Parts when the analyser answers, the translation under the word;
       hit = the word's character span in #doc, when it was tapped in the text */
    function defineWord(term, hit){
      var foot = [];
      if (hit && state.mode === "doc") foot.push({ m: "hl", label: _t("Highlight") });
      foot.push({ m: "copy", label: _t("Copy") });
      if ("speechSynthesis" in window) foot.push({ m: "say", label: _t("Say it"), id: "dictSay", pressed: true });
      buildCard({ kind: "word", term: term, title: term, icon: "meaning", dialogLabel: _t("Dictionary"), tabsLabel: _t("Word"),
        tabs: ["meaning", "parts"], off: { parts: true }, active: "meaning", span: hit || null, foot: foot, tr: "word",
        panels: { meaning: '<div class="note">' + tH("Looking up “{word}”…", { word: enH(term) }) + (dictReady() ? '' : '<br>' + esc(_t("Getting the dictionary ready — this only happens once."))) + '</div>' } });
      openCard();
      runTranslate(term);
      var my = cur.gen;
      lookupLocal(term).then(function(res){
        if (!cur || cur.gen !== my) return;
        if (res){ renderWord(term, res, my); return; }
        if (!navigator.onLine){ renderWord(term, null, my); return; }
        var lw = term.toLowerCase();
        var base = IRREG[lw] || lw;
        return lookupOnline(base).then(function(r2){
          if (r2) { renderWord(term, r2, my); return; }
          if (base === lw) { renderWord(term, null, my); return; }
          return lookupOnline(lw).then(function(r3){ renderWord(term, r3, my); });
        });
      });
    }

    /* ---------- sentence explaining (offline, rule-based — see llExplain) ---------- */
    /* a clause's heading, as markup: the book's words in it stay English (explain.js's own labels,
       such as a clause's kind or a joining word's sense, are put into the interface's language) */
    function kindLabel(c){
      var first = "";
      if (c.kind === "sub"){
        var lab = c.label ? esc(_t(c.label)) : esc(_t("clause"));
        return c.sub ? tH("{label} — “{words}”", { label: lab, words: enH(c.sub.toLowerCase()) }) : lab;
      }
      if (c.kind === "rel") return c.label ? tH("describes “{words}”", { words: enH(c.label) }) : esc(_t("describing clause"));
      if (c.kind === "wh") return tH("“{words}” clause — the thing that…", { words: enH(c.label) });
      if (c.conj) return tH("joined with “{words}” ({label})", { words: enH(c.conj), label: esc(_t(c.label)) });
      first = c.question ? _t("question") : c.imperative ? _t("instruction") : _t("main clause");
      if (c.participial || (c.tense && /participle/.test(c.tense.name))) first = _t("added detail");
      return esc(first);
    }
    /* a tense's name and note from explain.js (English, which it also reads back itself) in the interface's
       language: a fixed name, or one put together there — ", passive voice" after it, a modal verb in it */
    function tenseName(n){
      var m = /^(.*), passive voice$/.exec(n);
      if (m) return _t("{tense}, passive voice", { tense: tenseName(m[1]) });
      m = /^modal “([^”]+)”(?: \+ (perfect|continuous))?$/.exec(n);
      if (m) return m[2] === "perfect" ? _t("modal “{word}” + perfect", { word: m[1] }) : m[2] === "continuous" ? _t("modal “{word}” + continuous", { word: m[1] }) : _t("modal “{word}”", { word: m[1] });
      return _t(n);
    }
    function tenseNote(n){
      var m = /^(.*) — looking back at something that did not, or may not, happen$/.exec(n || "");
      return m ? _t("{meaning} — looking back at something that did not, or may not, happen", { meaning: _t(m[1]) }) : _t(n);
    }
    /* a role in a clause: its label, then its words from the sentence (valHtml: markup, see enH) */
    function role(label, valHtml){
      return '<span class="role"><b>' + esc(label) + '</b>' + valHtml + '</span>';
    }
    /* how the sentence is written: its register, and the figures of speech in it. Nothing is
       drawn for plain everyday prose. */
    function renderStyle(r){
      var st = r.style;
      if (!st) return '';
      var figs = st.figurative || [], reg = st.register || { kind: "neutral", note: "" };
      if (!figs.length && reg.kind === "neutral") return '';
      /* the register's and the figures' kinds are explain.js's English, put into the interface's language here; their
         notes are composed there, already in the interface's language (the book's words in them stay as they are) */
      var h = '<div class="sec">' + esc(_t("Style")) + '</div><div class="style">' +
        '<div class="reg"><span class="pill ink">' + esc(_tc("register", reg.kind)) + '</span><span class="rnote">' + esc(reg.note || '') + '</span></div>';
      figs.forEach(function(f, i){
        h += '<button type="button" class="figrow" aria-pressed="false" data-fig="' + i + '">' +
             '<span class="pill acc">' + esc(_tc("figure", f.kind)) + '</span>' +
             '<span class="ftext" lang="en">“' + esc(f.text) + '”</span>' +
             '<span class="fnote">' + esc(f.note || '') + '</span></button>';
      });
      return h + '</div>';
    }
    /* a row marks its own words in the quote above: on hover, on focus, and while it is pressed */
    function wireStyle(r, sentence){
      var quote = inner.querySelector("#dictQuote"), rows = inner.querySelectorAll(".figrow");
      var figs = (r.style && r.style.figurative) || [];
      if (!quote || !rows.length) return;
      function show(i){
        var f = figs[i];
        if (!f){ quote.textContent = sentence; return; }
        quote.innerHTML = esc(sentence.slice(0, f.start)) + '<mark class="fig">' + esc(sentence.slice(f.start, f.end)) +
                          '</mark>' + esc(sentence.slice(f.end));
      }
      function held(){
        for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute("aria-pressed") === "true") return i;
        return -1;
      }
      Array.prototype.forEach.call(rows, function(b, i){
        b.addEventListener("mouseenter", function(){ show(i); });
        b.addEventListener("focus", function(){ show(i); });
        b.addEventListener("mouseleave", function(){ show(held()); });
        b.addEventListener("blur", function(){ show(held()); });
        b.addEventListener("click", function(){
          var on = b.getAttribute("aria-pressed") === "true";
          Array.prototype.forEach.call(rows, function(o){ o.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", on ? "false" : "true");
          show(on ? -1 : i);
        });
      });
    }
    function renderExplain(r, sentence){
      var h = renderStyle(r);
      if (!r.clauses.length){
        h += '<div class="note">' + esc(_t("Nothing to break down here.")) + '</div>';
        return h;
      }
      if (r.clauses.length > 1) h += '<div class="note">' + esc(_tn(r.clauses.length, "1 part", "{n} parts")) + '</div>';
      r.clauses.forEach(function(c){
        h += '<div class="clause"><span class="ckind">' + kindLabel(c) + '</span>' +
             '<div class="ctext" lang="en">' + esc(c.text) + '</div>';
        var roles = "";
        if (c.subject){
          var sl = c.passive ? _t("who / what (receives the action)") : c.existential ? _t("what there is") : _t("who / what");
          var sw = { words: enH(c.subject), head: c.relHead ? enH(c.relHead) : "" };
          var sv = c.inherited ? tH("{words} (same as before)", sw) : c.inheritedNext ? tH("{words} (same as the next part)", sw) : c.relHead ? tH("{words} (= {head})", sw) : sw.words;
          roles += role(sl, sv);
        }
        if (c.verb) roles += role(c.passive ? _t("what happens to it") : _t("did what"), c.negative ? tH("{words} (negative)", { words: enH(c.verb) }) : enH(c.verb));
        if (c.indirect) roles += role(_t("to whom"), enH(c.indirect));
        if (c.object) roles += role(_t("what / whom"), enH(c.object));
        if (c.complement) roles += role(_t("is what"), enH(c.complement));
        if (c.agent) roles += role(_t("done by"), enH(c.agent));
        /* the extras' labels are explain.js's English, put into the interface's language here */
        c.extras.forEach(function(x){ roles += role(_t(x.label), enH(x.text)); });
        if (roles) h += '<div class="roles">' + roles + '</div>';
        /* the tense's name and note are explain.js's English too */
        if (c.tense) h += '<div class="tense">' + tH("Tense: {name} — {note}", { name: '<b>' + esc(tenseName(c.tense.name)) + '</b>', note: esc(tenseNote(c.tense.note)) }) + '</div>';
        h += '</div>';
      });
      if (r.expressions.length){
        h += '<div class="sec">' + esc(_t("Expressions")) + '</div><div class="brk">';
        r.expressions.forEach(function(e){
          var senses = e.entry.m.slice(0, 3).map(function(m){
            var d = window.llExplain.cleanDef(m.d, m.p) || m.d;
            return esc(d) + (m.s && m.s.length ? ' <i>(' + esc(m.s.slice(0, 3).join(", ")) + ')</i>' : '');
          });
          h += '<div><b lang="en">' + esc(e.phrase) + '</b> <i>' + esc(_t(e.kind)) + '</i> — <span lang="en">' + senses.join(' · ') + '</span></div>';
        });
        h += '</div>';
      }
      if (r.plain && r.plain.replace(/\W/g, "").toLowerCase() !== sentence.replace(/\W/g, "").toLowerCase()){
        h += '<div class="sec">' + esc(_t("In plainer words")) + '</div><div class="plain" lang="en">' + esc(r.plain) + '</div>';
      }
      return h;
    }
    function renderKeywords(r){
      var list = [];
      r.keywords.forEach(function(k){
        var tries = [k.lemma, k.word.toLowerCase()].concat(variants(k.word.toLowerCase()));
        for (var i = 0; i < tries.length; i++){
          var e = find(tries[i]);
          if (!e || isStub(e)) continue;
          var sense = window.llExplain.bestSense(e, k.pos, window.llExplain.rank);
          var m = (sense && sense.m) || e.m[0];
          list.push({ w: tries[i], m: m });
          break;
        }
      });
      if (!list.length) return '';
      var h = '<div class="sec">' + esc(_t("Key words")) + '</div><div class="brk">';
      list.forEach(function(x){
        h += '<div lang="en"><b>' + esc(x.w) + '</b>' + (x.m.p ? ' <i lang="' + I18N.lang() + '">' + esc(_tc("pos", x.m.p)) + '</i>' : '') + ' — ' + esc(x.m.d) + '</div>';
      });
      return h + '</div>';
    }
    /* the Explain panel: chunks for every word in the sentence (plus irregular base forms, which
       can start with another letter), then the analysis and the key words */
    function runExplain(sentence){
      var my = cur.gen, box = inner.querySelector("#dictExpl");
      if (!box) return;
      box.innerHTML = '<div class="note">' + esc(_t("Reading it…")) + (dictReady() ? '' : '<br>' + esc(_t("Getting the dictionary ready — this only happens once."))) + '</div>';
      var words = (sentence.toLowerCase().match(/[a-zÀ-ɏ'’-]+/g) || []).map(function(w){ return w.replace(/[’]/g, "'"); });
      var extra = [];
      words.forEach(function(w){ if (IRREG[w]) extra.push(IRREG[w]); variants(w).forEach(function(v){ extra.push(v); }); });
      Promise.all([withWords(words.concat(extra)), need(["explain"])]).then(function(){
        if (!cur || cur.gen !== my) return;
        var r = window.llExplain.explain(sentence, find, window.llExplain.rank);
        /* no word about being offline: the explainer only ever uses the built-in dictionary */
        box.innerHTML = renderExplain(r, sentence) + renderKeywords(r);
        wireStyle(r, sentence);
      }).catch(function(err){
        console.error(err);
        if (cur && cur.gen === my) box.innerHTML = '<div class="note">' + esc(_t("Couldn’t analyse this sentence.")) + '</div>';
      });
    }

    /* the sentence card: Explain and Simpler over one quoted sentence, its translation under the quote. Explain is
       drawn when its tab is open (at once, from a hold or a right-click), Simpler the first time
       its tab opens, the translation at once (see runTranslate). */
    function validSpan(span){
      return (span && typeof span.start === "number" && typeof span.end === "number" && span.end > span.start) ? span : null;
    }
    function openSentence(text, span, tab){
      text = String(text || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      var sp = validSpan(span);
      /* the same passage again (Simpler asked for from another module, say): just turn to that tab */
      if (cur && cur.kind === "sentence" && cur.sentence === text && card.classList.contains("open") &&
          (sp && cur.span ? sp.start === cur.span.start && sp.end === cur.span.end : !sp && !cur.span)){ select(tab); return; }
      var foot = [];
      if (sp) foot.push({ m: "hl", label: _t("Highlight") }, { m: "note", label: _t("Note…") }, { m: "read", label: _t("Read from here") });
      foot.push({ m: "copy", label: _t("Copy") });
      buildCard({ kind: "sentence", sentence: text, title: /\s/.test(text) ? _t("This sentence") : _t("This word"), icon: "explain",
        dialogLabel: _t("Sentence"), tabsLabel: _t("Sentence"), quote: text, tabs: ["explain", "simpler"], active: tab === "simpler" ? "simpler" : "explain",
        span: sp, foot: foot, tr: "sentence",
        panels: { explain: '<div id="dictExpl"></div>',
                  simpler: '<div class="lvl" id="simpLevel"></div><div id="simpBody"></div>' },
        lazy: { explain: function(){ runExplain(text); }, simpler: function(){ runSimplify(text); } } });
      openCard();
      runTranslate(text);
    }
    function explainSentence(sentence, span){ openSentence(sentence, span, "explain"); }

    /* ---------- simplify: a plainer version of the selected sentence(s), offline (see llExplain.simplify) ----------
       The Simpler panel: the plainer text with every change dotted (a tap shows what it was and
       why), a summary line, Read aloud and an optional AI rewrite. */
    /* the dictionary chunks the simplifier needs: every word with its variants and base forms,
       then the synonyms those entries list (the swap rule reads their entries too) */
    function simplifyWords(text){
      var words = (text.toLowerCase().match(/[a-zÀ-ɏ'’-]+/g) || []).map(function(w){ return w.replace(/[’]/g, "'"); });
      var all = [];
      words.forEach(function(w){ all.push(w); if (IRREG[w]) all.push(IRREG[w]); variants(w).forEach(function(v){ all.push(v); }); });
      return withWords(all).then(function(){
        var syns = [];
        all.forEach(function(w){
          var e = find(w);
          if (e) e.m.forEach(function(m){ (m.s || []).forEach(function(s){ if (/^[a-z]+$/.test(s)) syns.push(s); }); });
        });
        return withWords(syns);
      });
    }
    /* how plain to make it: the reader's choice is kept between passages and between visits */
    var LS_LEVEL = "ll_simplify_level";
    var SIMP_LEVELS = [["light", "Light"], ["plain", "Plain"], ["very", "Very plain"], ["kid", "For a 10-year-old"]];
    function simpLevel(){
      var v = Store.get(LS_LEVEL) || "plain";
      for (var i = 0; i < SIMP_LEVELS.length; i++) if (SIMP_LEVELS[i][0] === v) return v;
      return "plain";
    }
    /* a level's name on screen (SIMP_LEVELS keeps the English, which the tests read) */
    function levelName(l){
      for (var i = 0; i < SIMP_LEVELS.length; i++) if (SIMP_LEVELS[i][0] === l) return _t(SIMP_LEVELS[i][1]);
      return _t("Plain");
    }
    function simplifyText(text, level){
      var lv = level || simpLevel();
      /* the plainest level glosses words as it goes, and the plain meanings it glosses them with
         live in morph.js, so that table is fetched with the rest */
      var libs = lv === "kid" ? ["explain", "morph"] : ["explain"];
      return Promise.all([simplifyWords(text), need(libs)]).then(function(){
        return window.llExplain.simplify(text, find, window.llExplain.rank, { level: lv });
      });
    }
    function simpleSummary(changes, level){
      var swaps = 0, phrases = 0, active = 0, splits = 0, cut = 0, gloss = 0;
      changes.forEach(function(c){
        if (c.why === "rarer word") swaps++;
        else if (c.why === "shorter phrase" || c.why === "idiom" || c.why === "connector" || c.why === "abbreviation") phrases++;
        else if (c.why === "passive to active") active++;
        else if (c.why === "split long sentence") splits++;
        else if (c.why === "shortened" || c.why === "aside removed") cut++;
        else if (c.why === "glossed") gloss++;
      });
      var parts = [levelName(level)];
      function count(k, one, many){ if (k) parts.push(_tn(k, one, many)); }
      count(swaps, "1 word swapped", "{n} words swapped");
      count(phrases, "1 phrase shortened", "{n} phrases shortened");
      count(active, "1 sentence turned active", "{n} sentences turned active");
      count(splits, "1 sentence split", "{n} sentences split");
      count(cut, "1 part shortened", "{n} parts shortened");
      count(gloss, "1 word explained", "{n} words explained");
      if (parts.length === 1) parts.push(_t("nothing to simplify — this is already plain"));
      return parts.join(" · ");
    }
    /* opens the card on the Simpler tab (the pill's Explain leads there too, one tab over) */
    function renderSimplify(text, span){ openSentence(text, span, "simpler"); }
    /* the four strengths, above the text; choosing one redraws the passage at that strength */
    function drawLevels(){
      var box = inner.querySelector("#simpLevel");
      if (!box) return;
      var now = simpLevel();
      box.innerHTML = '<div class="sec" id="simpLevelL">' + esc(_t("How plain")) + '</div>' +
        '<div class="chips seg" id="simpLevels" role="group" aria-labelledby="simpLevelL">' +
        SIMP_LEVELS.map(function(p){
          var on = p[0] === now;
          return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-l="' + p[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(_t(p[1])) + '</button>';
        }).join("") + '</div>';
    }
    function runSimplify(text){
      var my = cur.gen, body = inner.querySelector("#simpBody"), box = inner.querySelector("#simpLevel");
      if (!body) return;
      if (box && !box.dataset.wired){
        box.dataset.wired = "1";
        box.addEventListener("click", function(e){
          var b = e.target.closest("#simpLevels .chip");
          if (!b || b.dataset.l === simpLevel()) return;
          Store.set(LS_LEVEL, b.dataset.l);
          drawLevels();
          runSimplify(text);
        });
      }
      drawLevels();
      body.innerHTML = '<div class="note">' + esc(_t("Making it plainer…")) + (dictReady() ? '' : '<br>' + esc(_t("Getting the dictionary ready — this only happens once."))) + '</div>';
      var level = simpLevel();
      simplifyText(text, level).then(function(r){
        if (!cur || cur.gen !== my) return;
        drawSimple(r, text);
      }).catch(function(err){
        console.error(err);
        if (cur && cur.gen === my) body.innerHTML = '<div class="note">' + esc(_t("Couldn’t simplify this.")) + '</div>';
      });
    }
    function drawSimple(r, text){
      var body = inner.querySelector("#simpBody"), out = r.text, h = '<div class="simple" lang="en">', pos = 0;
      r.changes.forEach(function(c){
        h += esc(out.slice(pos, c.start)) +
             '<button type="button" class="chg" aria-expanded="false" title="' + esc(_t("was: {words}", { words: c.from })) + '" data-from="' + esc(c.from) + '" data-why="' + esc(c.why) + '">' +
             esc(out.slice(c.start, c.end)) + '</button>';
        pos = c.end;
      });
      h += esc(out.slice(pos)) + '</div>' +
           '<div class="note" id="simpSum">' + esc(simpleSummary(r.changes, r.level || simpLevel())) + '</div>' +
           '<div class="acts" id="simpActs">' +
           ("speechSynthesis" in window ? '<button type="button" class="act" data-s="read" id="simpRead" aria-pressed="false">' + esc(_t("Read aloud")) + '</button>' : '') + '</div>';
      body.innerHTML = h;
      cur.simple = out;
      body.addEventListener("click", function(e){
        var chg = e.target.closest("button.chg");
        if (chg){ toggleChangeNote(chg); return; }
        var b = e.target.closest("#simpActs button"); if (!b) return;
        if (b.dataset.s === "read") speakPlain(out, b, _t("Stop"));
      });
    }
    /* a tap on a changed word shows (or hides) what it was and why it changed */
    function toggleChangeNote(chg){
      var open = chg.getAttribute("aria-expanded") === "true", next = chg.nextSibling;
      if (next && next.nodeType === 1 && next.classList.contains("chgnote")) next.parentNode.removeChild(next);
      chg.setAttribute("aria-expanded", open ? "false" : "true");
      if (open) return;
      var note = document.createElement("span");
      note.className = "chgnote";
      /* the reason is explain.js's English, put into the interface's language here; the note is the
         interface's, inside the English text */
      note.setAttribute("lang", I18N.lang());
      note.textContent = _t("was “{words}” — {why}", { words: chg.dataset.from, why: _t(chg.dataset.why) });
      chg.parentNode.insertBefore(note, chg.nextSibling);
    }
    /* for tests and other modules */
    window.llSimplify = { render: renderSimplify, simplify: simplifyText, levels: SIMP_LEVELS, level: simpLevel };

    /* ---------- finding the word / sentence under the finger ---------- */
    function rangeAt(x, y){
      if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
      if (document.caretPositionFromPoint){
        var p = document.caretPositionFromPoint(x, y);
        if (!p) return null;
        var r = document.createRange();
        r.setStart(p.offsetNode, p.offset); r.collapse(true);
        return r;
      }
      return null;
    }

    var WORDCH = /[A-Za-zÀ-ɏ'’]/;

    function wordAt(x, y){
      var r = rangeAt(x, y);
      var w = r ? wordInNode(r.startContainer, r.startOffset) : null;
      if (!w) return null;
      /* the caret lands on the nearest text even from blank space (between two paragraphs, past the
         end of a short line): only a word under the finger is looked up — a tap on the blank is the
         page's (in Pages flow the middle of the page shows or hides the bars) */
      try {
        var wr = document.createRange(), pad = 6, rects;
        wr.setStart(w.node, w.s); wr.setEnd(w.node, w.e);
        rects = wr.getClientRects();
        for (var i = 0; i < rects.length; i++){
          var b = rects[i];
          if (x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad) return w;
        }
        return rects.length ? null : w;
      } catch(_){ return w; }
    }
    /* the word around character `offset` of text node `n` inside the document (a tap, or the caret) */
    function wordInNode(n, offset){
      if (!n || n.nodeType !== 3) return null;
      if (!n.parentNode || !n.parentNode.closest || !n.parentNode.closest("#doc")) return null;
      /* focus reading splits a word in two (its bold start and the rest): one text node again for the lookup */
      var whole = Focus.on() ? Focus.unsplit(n, offset) : null;
      if (whole){ n = whole.node; offset = whole.offset; }
      var t = n.textContent, i = Math.min(offset, t.length - 1);
      if (i < 0) return null;
      if (!WORDCH.test(t[i]) && i > 0 && WORDCH.test(t[i-1])) i--;
      if (!WORDCH.test(t[i])) return null;
      var s = i, e = i;
      while (s > 0 && WORDCH.test(t[s-1])) s--;
      while (e < t.length && WORDCH.test(t[e])) e++;
      var w = t.slice(s, e).replace(/^['’]+|['’]+$/g, "");
      if (!w) return null;
      return { word: w, node: n, s: s, e: e };
    }

    /* the sentence around a point: the block's text is split into sentences; for plain .txt
       files a blank line also ends a paragraph, so a sentence never spans two of them */
    function sentenceAt(x, y){
      var r = rangeAt(x, y);
      if (!r) return null;
      var n = r.startContainer;
      var block = (n.nodeType === 3 ? n.parentNode : n);
      if (!block || !block.closest) return null;
      block = block.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, dd, dt, pre, div");
      if (!block || !block.closest("#doc")) return null;
      var raw = block.textContent;
      if (!raw.trim()) return null;

      /* where in the block did we tap? */
      var pre = document.createRange();
      pre.selectNodeContents(block);
      try { pre.setEnd(r.startContainer, r.startOffset); } catch(_){}
      var at = pre.toString().length;

      /* plain text: narrow to the paragraph (blank-line separated) around the tap */
      var pStart = 0, pEnd = raw.length;
      if (block.classList.contains("plain") || block.tagName === "PRE"){
        var re = /\n[ \t]*\n/g, m;
        while ((m = re.exec(raw))){
          if (m.index < at) pStart = m.index + m[0].length;
          else { pEnd = m.index; break; }
        }
      }
      var para = raw.slice(pStart, pEnd);
      at = Math.max(0, at - pStart);
      /* collapse whitespace, keeping the tap position in step */
      var full = "", pos = 0, collapsedAt = null;
      for (var i = 0; i < para.length; i++){
        if (i === at) collapsedAt = full.length;
        var ch = para[i];
        if (/\s/.test(ch)){ if (full.length && full[full.length-1] !== " ") full += " "; }
        else full += ch;
      }
      if (collapsedAt === null) collapsedAt = full.length;
      full = full.trim();
      if (!full) return null;

      var parts = full.match(/[^.!?…]+[.!?…]*["”’]?\s*/g) || [full];
      pos = 0;
      var s = full;
      for (var k = 0; k < parts.length; k++){
        var end = pos + parts[k].length;
        if (collapsedAt <= end || k === parts.length - 1){
          s = parts[k].trim();
          if (s.length < 12 && parts[k+1]) s = (s + " " + parts[k+1]).trim();
          break;
        }
        pos = end;
      }
      /* locate the sentence in the raw text so it can be highlighted */
      var res = { text: s, start: null, end: null };
      try {
        var words = s.split(" ").filter(Boolean).map(function(w){ return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
        var re = new RegExp(words.join("\\s+"));
        var mm = re.exec(raw.slice(pStart));
        if (mm){
          var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
          var first = walker.nextNode();
          var base = first ? Anchor.offsetOf(first, 0) : null;
          if (base !== null){ res.start = base + pStart + mm.index; res.end = res.start + mm[0].length; }
        }
      } catch(_){}
      return res;
    }

    /* ---------- gestures ---------- */
    var doc = document.getElementById("doc");
    function applyMode(){
      if (!doc) return;
      doc.classList.toggle("nosel", dictMode !== "off");
    }
    applyMode();

    var tStart = 0, tX = 0, tY = 0, held = false, holdTimer = null, moved = false;

    function inMiddleBand(x, y){
      if (!document.body.classList.contains("paged")) return true;
      var r = $("#docView").getBoundingClientRect();      /* the strip itself is scrolled sideways */
      var f = (x - r.left) / r.width;
      /* the top and bottom strips of the page show and hide the bars instead (tapNav) */
      if (typeof y === "number" && state.eink !== true && inBarStrip(y, $("#docView"))) return false;
      return f >= 0.35 && f <= 0.65;
    }
    function selectionText(){
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return "";
      var node = sel.anchorNode;
      var el = node && (node.nodeType === 3 ? node.parentNode : node);
      if (!el || !el.closest || !el.closest("#doc")) return "";
      return sel.toString().replace(/\s+/g, " ").trim();
    }

    if (doc){
      /* a translation (translate.js) is not text of #doc: a hold or a right-click on it is translate.js's (it shows the original) */
      var onTranslation = function(e){ return !!(e.target && e.target.closest && e.target.closest(".ll-tr")); };
      doc.addEventListener("touchstart", function(e){
        if (dictMode === "off" || e.touches.length > 1) return;
        tStart = Date.now(); moved = false; held = false;
        if (onTranslation(e) || (e.target && e.target.closest && e.target.closest("a.ll-song"))){ clearTimeout(holdTimer); return; }     /* a song's hold is its own menu (Songs) */
        tX = e.touches[0].clientX; tY = e.touches[0].clientY;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(function(){
          if (moved) return;
          held = true;
          if (navigator.vibrate) navigator.vibrate(12);
          var s = sentenceAt(tX, tY);
          if (s) explainSentence(s.text, s);
        }, 480);
      }, { passive: true });

      doc.addEventListener("touchmove", function(e){
        if (!e.touches.length) return;
        if (Math.abs(e.touches[0].clientX - tX) > 12 || Math.abs(e.touches[0].clientY - tY) > 12){
          moved = true; clearTimeout(holdTimer);
        }
      }, { passive: true });

      doc.addEventListener("touchend", function(){ clearTimeout(holdTimer); }, { passive: true });

      doc.addEventListener("click", function(e){
        if (dictMode !== "tap") return;
        if (held){ held = false; e.stopPropagation(); return; }
        if (moved) return;
        if (e.target.closest && (e.target.closest("a") || e.target.closest("mark.ll-mark"))) return;
        if (selectionText()) return;              /* a drag-selection is handled by the pill */
        if (!inMiddleBand(e.clientX, e.clientY)) return;
        var w = wordAt(e.clientX, e.clientY);
        if (!w) return;
        e.stopPropagation();
        var s0 = Anchor.offsetOf(w.node, w.s), hit = s0 === null ? null : { start: s0, end: s0 + (w.e - w.s) };
        markHit(w.node, w.s, w.e);
        defineWord(w.word, hit);
      }, true);

      /* desktop: long-press equivalent is a right-click (on a selection, or on the sentence under the pointer) */
      doc.addEventListener("contextmenu", function(e){
        if (dictMode === "off" || onTranslation(e)) return;
        var sel = selectionText();
        if (sel){ e.preventDefault(); lookupText(sel, window.Marks_selectionOffsets ? window.Marks_selectionOffsets() : null); return; }
        var s = sentenceAt(e.clientX, e.clientY);
        if (s){ e.preventDefault(); explainSentence(s.text, s); }
      });
    }

    /* the keyboard's way in (the card otherwise opens from a tap, a hold or the pill): d looks up
       the selection, else the word at the caret (caret browsing), else it opens the card with a
       field to type into — a route that needs no pointer and no caret browsing at all */
    function lookupKey(){
      var s = selectionText();
      if (s){ lookupText(s, window.Marks_selectionOffsets ? window.Marks_selectionOffsets() : null); return; }
      var sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.focusNode){
        var w = wordInNode(sel.focusNode, sel.focusOffset);
        if (w){
          var s0 = Anchor.offsetOf(w.node, w.s);
          markHit(w.node, w.s, w.e);
          defineWord(w.word, s0 === null ? null : { start: s0, end: s0 + (w.e - w.s) });
          return;
        }
      }
      openLookup();
    }
    function openLookup(){
      buildCard({ kind: "lookup", title: _t("Look up"), icon: "meaning", dialogLabel: _t("Dictionary"), tabsLabel: _t("Word"),
        tabs: ["meaning"], active: "meaning", span: null, foot: [],
        panels: { meaning: '<form class="lookup" id="dictLookup"><input type="search" id="dictLookupIn" aria-label="' + esc(_t("Word or sentence to look up")) + '" placeholder="' + esc(_t("A word, or a sentence to explain…")) + '" autocomplete="off" spellcheck="false">' +
                           '<button type="submit" class="act go">' + esc(_t("Look up")) + '</button>' +
                           '<div class="hint">' + esc(_t("One word is defined; more words are explained.")) + '</div></form>' } });
      openCard(function(){ return inner.querySelector("#dictLookupIn"); });
      inner.querySelector("#dictLookup").addEventListener("submit", function(e){
        e.preventDefault();
        var v = inner.querySelector("#dictLookupIn").value.replace(/\s+/g, " ").trim();
        if (v) lookupText(v, null);
      });
    }
    function docOpen(){ return state.mode === "doc"; }
    Keys.add("d", _t("Define or explain the selected text"), lookupKey, function(){ return docOpen() && dictMode !== "off"; });
    Menu.add({ order: 61, group: "tools", icon: icon("meaning", 20), label: _t("Define or explain…"), key: "D", run: lookupKey, show: docOpen });

    /* selected text (mouse drag, or the native handles when the dictionary is off): a small
       pill offers to define one word or explain a longer selection, and to highlight it.
       Simpler and Translate are tabs of the card the first button opens. */
    function lookupText(s, off){
      var words = s.split(/\s+/).filter(Boolean);
      if (words.length === 1) defineWord(words[0].replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ]+$/g, "") || words[0], off);
      else explainSentence(s, off);
    }
    function hidePill(){ pill.classList.remove("on"); pillLive.textContent = ""; }
    function updatePill(){
      var s = selectionText();
      if (!s || card.classList.contains("open")){ hidePill(); return; }
      var kind = s.split(/\s+/).length > 1 ? "explain" : "meaning";
      var look = pill.querySelector("[data-act=lookup]");
      if (look.dataset.kind !== kind){
        look.dataset.kind = kind;
        look.innerHTML = icon(kind, 16) + '<span>' + esc(kind === "explain" ? _t("Explain") : _t("Define")) + '</span>';
      }
      var rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)){ hidePill(); return; }
      var was = pill.classList.contains("on");
      pill.classList.add("on");
      /* the selection is the pill's: a highlight's own popover never sits under it */
      if (window.Marks_hidePop) window.Marks_hidePop();
      var said = kind === "explain" ? _t("Selected text: Explain, Highlight") : _t("Selected text: Define, Highlight");
      if (!was || pillLive.textContent !== said) pillLive.textContent = said;
      var pw = pill.offsetWidth, ph = pill.offsetHeight;
      var x = Math.min(Math.max(8, rect.left + rect.width / 2 - pw / 2), window.innerWidth - pw - 8);
      var y = rect.top - ph - 10;
      if (y < 8) y = rect.bottom + 10;
      pill.style.left = x + "px"; pill.style.top = y + "px";
    }
    var selTimer = null;
    document.addEventListener("selectionchange", function(){
      clearTimeout(selTimer);
      selTimer = setTimeout(updatePill, 180);
    });
    pill.addEventListener("mousedown", function(e){ e.preventDefault(); });
    pill.addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      var s = selectionText();
      if (b.dataset.act === "mark"){
        if (window.Marks_highlightSelection) window.Marks_highlightSelection();
        hidePill(); return;
      }
      var off = window.Marks_selectionOffsets ? window.Marks_selectionOffsets() : null;
      hidePill();
      if (s) lookupText(s, off);
    });
    window.addEventListener("scroll", hidePill, { passive: true });
    window.addEventListener("resize", hidePill);

    /* ---------- settings ---------- */
    var sheet = document.querySelector(".sheet-inner");
    if (sheet){
      var g = document.createElement("div");
      g.className = "group"; g.id = "dictGroup";
      g.innerHTML =
        '<div class="label" id="dictLabel">' + esc(_t("Dictionary")) + '</div>' +
        '<div class="chips seg" id="dictChips" role="group" aria-labelledby="dictLabel">' +
          '<button type="button" class="chip" data-dm="tap" aria-pressed="false">' + esc(_t("Tap a word")) + '</button>' +
          '<button type="button" class="chip" data-dm="hold" aria-pressed="false">' + esc(_t("Hold only")) + '</button>' +
          '<button type="button" class="chip" data-dm="off" aria-pressed="false">' + esc(_t("Off")) + '</button>' +
        '</div>' +
        '<div class="hint">' +
          esc(_t("Tap a word for its meaning. Hold on a sentence (or select text) to have it explained — clauses, who did what, tense, idioms and a plainer rewrite, all offline.")) +
        '</div>' +
        '<div class="rowline"><label class="check"><input type="checkbox" role="switch" id="dictEx" aria-describedby="dictExHint">' + esc(_t("Show example sentences (online)")) + '</label></div>' +
        '<div class="hint" id="dictExHint">' + esc(_t("Sentences from Tatoeba under the meaning. The word you tap is sent to Tatoeba; sentences you have seen stay on this device.")) + '</div>';
      sheet.appendChild(g);
      var exSw = g.querySelector("#dictEx");
      exSw.checked = examplesOn();
      exSw.addEventListener("change", function(){ Store.set(EX_KEY, exSw.checked ? "1" : "0"); });
      function syncChips(){
        g.querySelectorAll("#dictChips .chip").forEach(function(c){
          var on = c.dataset.dm === dictMode; c.classList.toggle("on", on); c.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
      g.querySelectorAll("#dictChips .chip").forEach(function(c){
        c.addEventListener("click", function(){
          dictMode = c.dataset.dm;
          Store.set(LS_MODE, dictMode);
          syncChips(); applyMode();
        });
      });
      syncChips();
    }

    /* ---------- translation ----------
       The engines, the cache and the book translator live in translate.js, fetched the first
       time a card is opened or the Translation group scrolls into view. The card's translation
       line, the settings group and the menu entries are made here so they exist before that. */
    var Translate = {
      load: function(){ return need(["translate"]).then(function(){ return window.llTranslate; }); },
      slot: function(text, el, opts){
        if (!el) return;
        Translate.load().then(function(T){ T.slot(text, el, opts); }, function(){
          if (opts && opts.box) opts.box.hidden = false;
          el.innerHTML = '<div class="note">' + esc(_t("Couldn’t load the translator.")) + '</div>';
        });
      },
      /* opens the sentence card (its translation is under the quote) */
      show: function(text, span){ openSentence(text, span, "explain"); }
    };
    /* target languages: BCP-47 code, English name, native name */
    var TR_LANGS = [["es","Spanish","Español"],["fr","French","Français"],["de","German","Deutsch"],["it","Italian","Italiano"],["pt","Portuguese","Português"],["nl","Dutch","Nederlands"],["sv","Swedish","Svenska"],["da","Danish","Dansk"],["no","Norwegian","Norsk"],["fi","Finnish","Suomi"],["pl","Polish","Polski"],["cs","Czech","Čeština"],["sk","Slovak","Slovenčina"],["hu","Hungarian","Magyar"],["ro","Romanian","Română"],["el","Greek","Ελληνικά"],["tr","Turkish","Türkçe"],["ru","Russian","Русский"],["uk","Ukrainian","Українська"],["ar","Arabic","العربية"],["he","Hebrew","עברית"],["fa","Persian","فارسی"],["hi","Hindi","हिन्दी"],["bn","Bengali","বাংলা"],["ur","Urdu","اردو"],["id","Indonesian","Bahasa Indonesia"],["ms","Malay","Bahasa Melayu"],["vi","Vietnamese","Tiếng Việt"],["th","Thai","ไทย"],["zh","Chinese (Simplified)","简体中文"],["zh-Hant","Chinese (Traditional)","繁體中文"],["ja","Japanese","日本語"],["ko","Korean","한국어"],["sw","Swahili","Kiswahili"],["ca","Catalan","Català"],["en","English","English"]];
    /* the reader's language: the device's, when the table has it; else English (translate.js reads it the same way) */
    function trReader(){
      var nav = String((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase(), b = nav.split("-")[0];
      if (b === "zh") return /hant|tw|hk|mo/.test(nav) ? "zh-Hant" : "zh";
      if (b === "nb" || b === "nn") b = "no";
      return TR_LANGS.some(function(l){ return l[0] === b; }) ? b : "en";
    }
    /* a language's name in the interface's language: the table's English, or in Dutch the name Intl
       gives (the table's English through _t where Intl.DisplayNames is missing). translate.js reads the
       names back from the select's options, so it names languages the same way */
    var trDn = null;
    try { if (I18N.lang() === "nl" && typeof Intl !== "undefined" && Intl.DisplayNames) trDn = new Intl.DisplayNames([I18N.locale()], { type: "language" }); } catch(_){ trDn = null; }
    function trLabel(l){
      if (I18N.lang() !== "nl") return l[1];
      var n = null;
      if (trDn) try { n = trDn.of(l[0] === "zh" ? "zh-Hans" : l[0]); } catch(_){ n = null; }
      return n && n !== l[0] ? n.charAt(0).toUpperCase() + n.slice(1) : _t(l[1]);
    }
    function trName(code){ for (var i = 0; i < TR_LANGS.length; i++) if (TR_LANGS[i][0] === code) return trLabel(TR_LANGS[i]); return code; }
    /* what older versions set by themselves on first run (the device's language, or Spanish): read as Automatic */
    function trOldDefault(){ var r = trReader(); return r === "en" ? "es" : r; }
    if (sheet){
      var tg = document.createElement("div");
      tg.className = "group"; tg.id = "trGroup";
      var trOpts = TR_LANGS.map(function(l){ var n = trLabel(l); return '<option value="' + l[0] + '">' + esc(n) + (l[2] !== n ? ' · ' + esc(l[2]) : '') + '</option>'; }).join("");
      var me = trName(trReader());
      tg.innerHTML =
        '<div class="label">' + esc(_t("Translation")) + '</div>' +
        '<div class="rowline"><label for="trLang">' + esc(_t("Into")) + '</label><select id="trLang" class="sel"><option value="auto">' + esc(_t("Automatic · {lang}", { lang: me })) + '</option>' + trOpts + '</select>' +
        '<label for="trFrom">' + esc(_t("From")) + '</label><select id="trFrom" class="sel"><option value="auto">' + esc(_t("Auto-detect")) + '</option>' + trOpts + '</select></div>' +
        '<p class="hint" id="trAutoHint">' + esc(_t("Automatic: a book in another language is translated into {lang}, your device’s language. A book already in {lang} shows no translation when you tap a word; Translate book turns it into {other}.",
          { lang: me, other: trName(trReader() === "en" ? "nl" : "en") })) + '</p>' +
        /* the Dutch ↔ English pack (translate.js fills the row): download once, then instant and offline */
        '<div class="rowline" id="mtRow"><span class="k-state" id="mtState" aria-live="polite">' + esc(_t("Dutch ↔ English")) + '</span>' +
          '<button type="button" class="chip" id="mtDl" hidden>' + esc(_t("Dutch ↔ English (≈ 50 MB, once)")) + '</button>' +
          '<button type="button" class="chip" id="mtRm" hidden>' + esc(_t("Remove")) + '</button></div>' +
        '<progress id="mtProgress" class="k-progress" max="100" value="0" aria-label="' + esc(_t("Downloading Dutch ↔ English")) + '" hidden></progress>' +
        '<div class="rowline"><label id="trViewL">' + esc(_t("Translated book")) + '</label><div class="chips seg" role="radiogroup" aria-labelledby="trViewL" id="trViewChips">' +
          '<button type="button" class="chip" role="radio" aria-checked="false" data-trview="only">' + esc(_t("Translation only")) + '</button>' +
          '<button type="button" class="chip" role="radio" aria-checked="false" data-trview="both">' + esc(_t("Both")) + '</button></div></div>' +
        '<p class="hint" id="trViewHint">' + esc(_t("Translate book (in the menu) translates the whole book. Translation only shows the translation in place of the original — tap or hold a paragraph to see its original; Both shows the translation under each paragraph. Read aloud reads the original, so choose Both to follow it.")) + '</p>' +
        '<div class="hint" id="trHint">' + esc(_t("Tap a word or select a sentence and its translation is in the card.")) + '</div>';
      sheet.appendChild(tg);
      var trTo = tg.querySelector("#trLang"), trFrom = tg.querySelector("#trFrom");
      /* once: what an older version set by itself becomes Automatic; a language chosen since stays */
      if (Store.get("ll_tr_v") !== "2"){
        var trSaved = Store.get("ll_tr_to");
        if (!trSaved || trSaved === trOldDefault()) Store.set("ll_tr_to", "auto");
        Store.set("ll_tr_v", "2");
      }
      trTo.value = Store.get("ll_tr_to"); if (!trTo.value){ trTo.value = "auto"; Store.set("ll_tr_to", "auto"); }
      trFrom.value = Store.get("ll_tr_from") || "auto"; if (!trFrom.value) trFrom.value = "auto";
      var trChanged = function(){
        Store.set("ll_tr_to", trTo.value); Store.set("ll_tr_from", trFrom.value);
        Translate.load().then(function(T){ T.onSettings(); }).catch(function(){});
      };
      trTo.addEventListener("change", trChanged); trFrom.addEventListener("change", trChanged);
      var trView = function(){ return Store.get("ll_tr_view") === "both" ? "both" : "only"; };
      var syncTrView = function(){
        Array.prototype.forEach.call(tg.querySelectorAll("#trViewChips .chip"), function(c){
          var on = c.dataset.trview === trView(); c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
        });
      };
      syncTrView();
      tg.addEventListener("click", function(e){
        var b = e.target.closest && e.target.closest("button");
        if (!b) return;
        if (b.dataset.trview){
          Store.set("ll_tr_view", b.dataset.trview); syncTrView();
          if (window.llTranslate) window.llTranslate.setView(b.dataset.trview);
        } else if (b.id === "mtDl" || b.id === "mtRm"){
          Translate.load().then(function(T){ if (b.id === "mtDl") T.pack.download(); else T.pack.remove(); }, function(){ Marks.toast(_t("Couldn’t load the translator")); });
        }
      });
      /* the engines' status line comes with the script, fetched once the group is on screen */
      var trSeen = function(){ Translate.load().then(function(T){ T.refreshHint(); }).catch(function(){}); };
      if (window.IntersectionObserver){
        var trIo = new IntersectionObserver(function(entries){
          if (entries.some(function(x){ return x.isIntersecting; })){ trIo.disconnect(); trSeen(); }
        });
        trIo.observe(tg);
      } else $("#gear").addEventListener("click", trSeen, { once: true });
    }
    Menu.add({ order: 62, key: "", group: "tools", icon: icon("translate", 20),
      label: function(){ var T = window.llTranslate; return T && T.isOn() ? (T.isPartial() ? _t("Translate the rest") : _t("Show original")) : _t("Translate book…"); },
      run: function(){ Translate.load().then(function(T){ T.togglePage(); }, function(){ Marks.toast(_t("Couldn’t load the translator")); }); },
      show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    /* only while a translation is incomplete does "Translate the rest" take the entry above */
    Menu.add({ order: 63, group: "tools", icon: icon("translate", 20), label: _t("Show original"), run: function(){ Translate.load().then(function(T){ T.showOriginal(); }); },
      show: function(){ var T = window.llTranslate; return !!(T && T.isOn() && T.isPartial()); } });
    /* a translated book: the translation alone, or both languages */
    Menu.add({ order: 64, group: "tools", icon: icon("translate", 20),
      label: function(){ var T = window.llTranslate; return T && T.view() === "both" ? _t("Show translation only") : _t("Show both languages"); },
      run: function(){ var T = window.llTranslate; if (T) T.setView(T.view() === "both" ? "only" : "both"); if (typeof syncTrView === "function") syncTrView(); },
      show: function(){ var T = window.llTranslate; return !!(T && T.isOn()); } });
    /* a document left translated comes back translated: the script is wanted as soon as it opens */
    document.addEventListener("ll:fileopened", function(){
      var on = Store.get("ll_tr_on");
      if (!window.llTranslate && on && on !== "{}") Translate.load().catch(function(){});
    });

    /* re-apply after a new file is opened (doc innerHTML is replaced) */
    var mo = new MutationObserver(applyMode);
    if (doc) mo.observe(doc, { childList: true });

    /* for tests and other modules */
    window.llDict = { explainSentence: explainSentence, defineWord: defineWord, lookupLocal: lookupLocal, withWords: withWords, find: find, loaded: function(){ return Object.keys(DB).map(Number); } };
  })();

  /* exposed for tests and other scripts (not a public API) */
  window.__ll = { need: need, state: state, Store: Store, Library: Library, Marks: Marks, Toc: Toc, Search: Search, Speak: Speak, Progress: Progress, Ruler: Ruler, Auto: Auto, AutoTheme: AutoTheme, Wake: Wake, Tabs: Tabs, Anchor: Anchor, Side: Side, Menu: Menu, PdfText: PdfText, Focus: Focus, Recap: Recap, Rsvp: Rsvp, Songs: Songs, Sounds: Sounds, Dim: Dim, Eink: Eink, PhoneBar: PhoneBar, SheetTabs: SheetTabs, UiLang: UiLang, status: status, openFile: openFile, openFiles: openFiles, show: show, revealOffset: revealOffset,
                 /* Pages flow: lay the columns out again after the text changed, landing on the same text (translate.js) */
                 relayoutPages: function(){ if (state.mode === "doc" && state.flow === "pages") relayoutDocPages(); } };
  window.Search = Search;
  window.Marks_highlightSelection = function(){ var m = Marks.highlightSelection(); if (m) Marks.toast(_t("Highlighted")); };
  window.Marks_selectionOffsets = Marks.selectionOffsets;
  window.Marks_hidePop = Marks.hidePop;

  /* ---------- boot ---------- */
  Prefs.load();
  Store.remove("ll_apikey");   /* the key of the old online explainer: wiped from devices */
  /* first run on a device that asks for more contrast: start with the high-contrast theme */
  if (!Store.get("ll_prefs") && window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches){
    state.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "hidark" : "hicon";
  }
  headVar();
  buildThemeChips();
  buildCustomUI();
  syncCustomUI();
  $("#softenPdf").checked = !!state.soften;
  $("#plainBg").checked = !!state.plainBg;
  document.querySelectorAll("#flowChips .chip").forEach(function(ch){
    var on = ch.dataset.flow === state.flow; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
  });
  applyTheme();
  applyType();
  Eink.boot();
  Dim.apply();
  $("#cSpread").checked = state.spread !== false;
  $("#cWake").checked = state.wake !== false;
  AutoTheme.apply();
  show("empty");
  /* the sheet's section strip, now that every group is in place */
  SheetTabs.build();
  SheetTabs.applies();
  if (!Speak.supported) $("#speakBtn").hidden = true;
  syncSpeakBtn();
  Launch.boot();
  UiLang.boot();

  /* warm up the small parsers once the page is idle, so the first open feels instant */
  var warm = function(){ need(["purify", "marked"]).catch(function(){}); };
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 2500);

  /* ---------- offline install + updates ----------
     Only active when hosted (https), harmless as a local file. A new service worker
     installs in the background; when it is ready we offer a reload rather than
     switching under the reader's feet. */
  var Updates = (function(){
    var reg = null, toastEl = null, reloading = false, wantReload = false;
    /* a first install claims the page too (clients.claim) — that must not reload it */
    var hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    function toast(){
      if (toastEl) return;
      toastEl = document.createElement("div");
      toastEl.id = "updateToast"; toastEl.setAttribute("role", "status");
      toastEl.innerHTML = '<span>' + escapeHtml(_t("A new version of Lamplight is ready.")) + '</span><button type="button" id="updateReload">' + escapeHtml(_t("Reload")) + '</button>' +
        '<button type="button" id="updateLater" aria-label="' + escapeHtml(_t("Later")) + '" title="' + escapeHtml(_t("Later")) + '">' + ICONS.close + '</button>';
      document.body.appendChild(toastEl);
      /* the offer keeps the bottom row and reports its height (--updateH, like the dock's --dockH):
         the small toast and the translation pill step up over it instead of hiding behind it */
      var ro = null, setH = function(){ if (toastEl && toastEl.isConnected) document.body.style.setProperty("--updateH", (toastEl.offsetHeight + 8) + "px"); };
      setH();
      if (window.ResizeObserver){ ro = new ResizeObserver(setH); ro.observe(toastEl); }
      toastEl.querySelector("#updateReload").addEventListener("click", function(){
        wantReload = true;
        if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        else location.reload();
      });
      toastEl.querySelector("#updateLater").addEventListener("click", function(){
        if (ro) ro.disconnect();
        document.body.style.removeProperty("--updateH");
        toastEl.remove(); toastEl = null;
      });
    }
    function watch(worker){
      if (!worker) return;
      worker.addEventListener("statechange", function(){
        if (worker.state === "installed" && navigator.serviceWorker.controller) toast();
      });
    }
    function register(){
      if (!("serviceWorker" in navigator) || !window.isSecureContext) return;   /* https, or localhost while developing */
      navigator.serviceWorker.register("./sw.js").then(function(r){
        reg = r;
        if (r.waiting && navigator.serviceWorker.controller) toast();
        watch(r.installing);
        r.addEventListener("updatefound", function(){ watch(r.installing); });
        /* look for updates now and then, and whenever the reader comes back */
        setInterval(function(){ r.update().catch(function(){}); }, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") r.update().catch(function(){}); });
      }).catch(function(){});
      navigator.serviceWorker.addEventListener("controllerchange", function(){
        if (reloading || !(hadController || wantReload)) { hadController = true; return; }
        reloading = true;
        Library.flush();
        location.reload();
      });
    }
    return { register: register, hasToast: function(){ return !!toastEl; }, offer: toast };
  })();
  Updates.register();
  if (window.__ll) window.__ll.Updates = Updates;

  /* ask the browser to keep our storage (library, positions, notes) out of automatic eviction */
  if (navigator.storage && navigator.storage.persist){
    var askPersist = function(){
      if (Store.get("ll_persist") === "granted") return;
      navigator.storage.persisted().then(function(p){
        if (p){ Store.set("ll_persist", "granted"); return; }
        return navigator.storage.persist().then(function(ok){ Store.set("ll_persist", ok ? "granted" : "denied"); });
      }).catch(function(){});
    };
    /* best asked once something is worth keeping: the first time a file is opened */
    document.addEventListener("ll:fileopened", askPersist, { once: true });
  }
})();
