
(function(){
  "use strict";
  var $ = function(s){ return document.querySelector(s); };

  /* parsers are separate files, fetched the first time a file type needs them
     (and precached by the service worker so that still works offline) */
  var LIBS = {
    pdf:     ["./vendor/pdf.min.js"],   /* parsing runs in vendor/pdf.worker.min.js, a real Web Worker (see needPdf) */
    mammoth: ["./vendor/mammoth.min.js"],
    marked:  ["./vendor/marked.min.js"],
    purify:  ["./vendor/purify.min.js"],
    jszip:   ["./vendor/jszip.min.js"],
    explain: ["./explain.js"]
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

  var THEMES = {
    day:   {name:"Day",    bg:"#EDEDE6", ink:"#1F2323", muted:"#646B68", panel:"#F5F5EF", line:"#D8D9CF", accent:"#2F6D5B"},
    sepia: {name:"Sepia",  bg:"#E9DDC5", ink:"#40331F", muted:"#6E5F42", panel:"#F0E7D2", line:"#D6C7A4", accent:"#8D5A1D"},
    mist:  {name:"Mist",   bg:"#E7EBEE", ink:"#25303A", muted:"#5D6A76", panel:"#F0F3F5", line:"#D1D9DF", accent:"#3C6E93"},
    rose:  {name:"Rose",   bg:"#F4E7E3", ink:"#44302D", muted:"#7C625A", panel:"#F9EFEC", line:"#E3CFC9", accent:"#AE4D5E"},
    dusk:  {name:"Dusk",   bg:"#14161B", ink:"#D6D3C8", muted:"#8E9088", panel:"#1B1E25", line:"#2A2E37", accent:"#D8A24A"},
    forest:{name:"Forest", bg:"#101711", ink:"#CDD8C6", muted:"#83907E", panel:"#161F17", line:"#263223", accent:"#7FB069"},
    ocean: {name:"Ocean",  bg:"#0D141E", ink:"#CBD5E1", muted:"#7E8CA0", panel:"#131C29", line:"#223042", accent:"#5C9CD6"},
    plum:  {name:"Plum",   bg:"#17101F", ink:"#D8CDE3", muted:"#91849F", panel:"#1E1628", line:"#2F2440", accent:"#A97FD6"},
    ink:   {name:"Ink",    bg:"#050506", ink:"#C7C3B6", muted:"#7F7C72", panel:"#0E0E11", line:"#1E1E23", accent:"#C08D3F"},
    /* high contrast: pure white / black with a strong accent, for low vision or bright sunlight */
    hicon: {name:"Contrast",      bg:"#FFFFFF", ink:"#000000", muted:"#3A3A3A", panel:"#FFFFFF", line:"#000000", accent:"#0033CC"},
    hidark:{name:"Contrast dark", bg:"#000000", ink:"#FFFFFF", muted:"#D0D0D0", panel:"#000000", line:"#FFFFFF", accent:"#FFD400"}
  };
  var CYCLE = Object.keys(THEMES);
  var FONTS = {
    serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif",
    sans:  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    mono:  "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace",
    hyper: "'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  };
  var BG_SWATCHES = ["#F6F1E4","#EFEFE8","#EDE7F3","#E4EFE7","#FBEDE0","#E8EFF5",
                     "#14161B","#101711","#171021","#1A1310","#0D1420","#050506"];
  var ACC_SWATCHES = ["#D8A24A","#C96A4A","#C25B78","#A97FD6","#5C9CD6","#3FA08C","#7FB069","#C9A227"];

  var state = {
    theme:"day",
    custom:{bg:"#101418", ink:"#e7e2d6", accent:"#e0a458", autoInk:true},
    font:"serif", size:19, lh:1.75, width:720, margin:0, justify:false, hyphens:false,
    auto:"off", autoDay:"day", autoNight:"dusk", nightFrom:"21:00", nightTo:"07:00", spread:true, wake:true, perPage:1,
    zoom:1, soften:true,
    flow:"scroll", page:0, totalPages:1, pdfPageNum:1,
    mode:"empty", pdfDoc:null, fitScale:1, colw:0, gap:48, toc:null
  };
  var renderGen = 0;

  /* ---------- remembered reading settings ---------- */
  var Prefs = (function(){
    var KEY = "ll_prefs", FIELDS = ["theme", "custom", "font", "size", "lh", "width", "margin", "justify", "hyphens", "flow", "soften", "auto", "autoDay", "autoNight", "nightFrom", "nightTo", "spread", "wake"];
    var loading = false;
    function save(){
      if (loading) return;
      var o = {};
      FIELDS.forEach(function(f){ o[f] = state[f]; });
      try { localStorage.setItem(KEY, JSON.stringify(o)); } catch(_){}
    }
    function load(){
      var o = null;
      try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch(_){}
      if (!o || typeof o !== "object") return;
      loading = true;
      FIELDS.forEach(function(f){
        if (o[f] === undefined || o[f] === null) return;
        if (f === "custom"){ if (typeof o.custom === "object") state.custom = Object.assign({}, state.custom, o.custom); return; }
        if (typeof state[f] === "number" && typeof o[f] !== "number") return;
        state[f] = o[f];
      });
      if (!THEMES[state.theme] && state.theme !== "custom") state.theme = "day";
      if (!/^(off|system|time)$/.test(state.auto)) state.auto = "off";
      if (!THEMES[state.autoDay] && state.autoDay !== "custom") state.autoDay = "day";
      if (!THEMES[state.autoNight] && state.autoNight !== "custom") state.autoNight = "dusk";
      if (!/^\d\d:\d\d$/.test(state.nightFrom)) state.nightFrom = "21:00";
      if (!/^\d\d:\d\d$/.test(state.nightTo)) state.nightTo = "07:00";
      if (!FONTS[state.font]) state.font = "serif";
      state.size = Math.max(14, Math.min(28, state.size)); state.lh = Math.max(1.3, Math.min(2.1, state.lh));
      state.width = Math.max(320, Math.min(960, state.width)); state.margin = Math.max(0, Math.min(64, state.margin || 0));
      if (state.flow !== "pages") state.flow = "scroll";
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
  function currentTheme(){
    if (state.theme === "custom"){
      var c = state.custom;
      var ink = c.autoInk ? deriveInk(c.bg) : c.ink;
      return {
        bg:c.bg, ink:ink, accent:c.accent,
        panel: mix(c.bg, ink, 0.05),
        line:  mix(c.bg, ink, 0.15),
        muted: mix(ink, c.bg, 0.42)
      };
    }
    return THEMES[state.theme];
  }

  /* ---------- theme + type ---------- */
  function buildThemeChips(){
    var html = "";
    CYCLE.forEach(function(k){
      html += '<button class="chip" data-theme="' + k + '"><i style="background:' + THEMES[k].accent + '"></i>' + THEMES[k].name + "</button>";
    });
    html += '<button class="chip" data-theme="custom"><i id="customDot" style="background:' + state.custom.accent + '"></i>Custom</button>';
    $("#themeChips").innerHTML = html;
  }
  function buildCustomUI(){
    $("#bgSwatches").innerHTML = BG_SWATCHES.map(function(c){
      return '<button class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Background ' + c + '"></button>';
    }).join("");
    $("#accSwatches").innerHTML = ACC_SWATCHES.map(function(c){
      return '<button class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Accent ' + c + '"></button>';
    }).join("");
  }
  function syncCustomUI(){
    var c = state.custom;
    var hs = hexToHsl(c.bg);
    $("#cHue").value = hs[0]; $("#vHue").textContent = hs[0] + "°";
    $("#cLit").value = hs[2]; $("#vLit").textContent = hs[2] + " %";
    $("#autoInk").checked = c.autoInk;
    $("#inkRow").style.display = c.autoInk ? "none" : "flex";
    $("#cInk").value = c.autoInk ? deriveInk(c.bg) : c.ink;
    $("#cAcc").value = c.accent;
    document.querySelectorAll("#bgSwatches .sw").forEach(function(s){
      s.classList.toggle("on", s.dataset.c.toLowerCase() === c.bg.toLowerCase());
    });
    document.querySelectorAll("#accSwatches .sw").forEach(function(s){
      s.classList.toggle("on", s.dataset.c.toLowerCase() === c.accent.toLowerCase());
    });
  }
  function applyTheme(){
    var t = currentTheme();
    var r = document.documentElement.style;
    r.setProperty("--bg", t.bg);      r.setProperty("--ink", t.ink);
    r.setProperty("--muted", t.muted);r.setProperty("--panel", t.panel);
    r.setProperty("--line", t.line);  r.setProperty("--accent", t.accent);
    document.documentElement.style.colorScheme = isDarkColor(t.bg) ? "dark" : "light";
    document.body.classList.toggle("soften", state.soften && isDarkColor(t.bg));
    document.querySelectorAll("#themeChips .chip").forEach(function(ch){
      ch.classList.toggle("on", ch.dataset.theme === state.theme);
    });
    var dot = $("#customDot");
    if (dot) dot.style.background = state.custom.accent;
    $("#customRow").classList.toggle("show", state.theme === "custom");
    /* live preview of the custom combo */
    var ct = state.theme === "custom" ? t : currentTheme();
    var pv = $("#cPrev");
    pv.style.background = state.theme === "custom" ? t.bg : "transparent";
    pv.style.color = t.ink;
    pv.style.borderColor = t.line;
    $("#cPrevAcc").style.color = t.accent;
    Prefs.save();
  }
  /* ---------- automatic theme: system setting or a night schedule ---------- */
  var AutoTheme = (function(){
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null, timer = null;
    function minutes(t){ var m = /^(\d\d):(\d\d)$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
    function isNight(){
      if (state.auto === "system") return !!(mq && mq.matches);
      if (state.auto === "time"){
        var d = new Date(), now = d.getHours() * 60 + d.getMinutes(), a = minutes(state.nightFrom), b = minutes(state.nightTo);
        return a <= b ? (now >= a && now < b) : (now >= a || now < b);
      }
      return null;
    }
    function wanted(){ var n = isNight(); return n === null ? null : (n ? state.autoNight : state.autoDay); }
    function apply(){
      var t = wanted();
      if (t && t !== state.theme){ state.theme = t; applyTheme(); }
      syncUI();
    }
    function syncUI(){
      document.querySelectorAll("#autoChips .chip").forEach(function(ch){ ch.classList.toggle("on", ch.dataset.auto === state.auto); });
      $("#autoRow").style.display = state.auto === "off" ? "none" : "block";
      $("#autoTimes").style.display = state.auto === "time" ? "flex" : "none";
      var opts = CYCLE.map(function(k){ return '<option value="' + k + '">' + THEMES[k].name + '</option>'; }).join("") + '<option value="custom">Custom</option>';
      if ($("#autoDay").innerHTML !== opts){ $("#autoDay").innerHTML = opts; $("#autoNight").innerHTML = opts; }
      $("#autoDay").value = state.autoDay; $("#autoNight").value = state.autoNight;
      $("#nightFrom").value = state.nightFrom; $("#nightTo").value = state.nightTo;
      var n = isNight();
      $("#autoHint").textContent = n === null ? "" : (n ? "It\u2019s night now \u2014 using the night theme." : "It\u2019s day now \u2014 using the day theme.") +
        (state.auto === "system" ? " Follows your device\u2019s light / dark setting." : "") + " Picking a theme above changes the " + (n ? "night" : "day") + " theme.";
    }
    /* the user picked a theme by hand: keep auto on, but remember it for the current period */
    function userPicked(theme){
      var n = isNight();
      if (n === null) return;
      if (n) state.autoNight = theme; else state.autoDay = theme;
      syncUI(); Prefs.save();
    }
    if (mq){ (mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply)); }
    timer = setInterval(function(){ if (state.auto === "time") apply(); }, 30000);
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") apply(); });
    $("#autoChips").addEventListener("click", function(e){
      var ch = e.target.closest(".chip"); if (!ch) return;
      state.auto = ch.dataset.auto; Prefs.save(); apply();
    });
    $("#autoDay").addEventListener("change", function(e){ state.autoDay = e.target.value; Prefs.save(); apply(); });
    $("#autoNight").addEventListener("change", function(e){ state.autoNight = e.target.value; Prefs.save(); apply(); });
    $("#nightFrom").addEventListener("change", function(e){ state.nightFrom = e.target.value || "21:00"; Prefs.save(); apply(); });
    $("#nightTo").addEventListener("change", function(e){ state.nightTo = e.target.value || "07:00"; Prefs.save(); apply(); });
    return { apply: apply, userPicked: userPicked, isNight: isNight, syncUI: syncUI };
  })();

  /* ---------- keep the screen on while a document is open ---------- */
  var Wake = (function(){
    var lock = null, wanted = false;
    function request(){
      if (!wanted || !state.wake || !("wakeLock" in navigator) || document.visibilityState !== "visible" || lock) return;
      navigator.wakeLock.request("screen").then(function(l){ lock = l; l.addEventListener("release", function(){ lock = null; }); }).catch(function(){});
    }
    function release(){ if (lock){ var l = lock; lock = null; l.release().catch(function(){}); } }
    function set(v){ wanted = v; if (v) request(); else release(); }
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") request(); });
    $("#cWake").addEventListener("change", function(e){ state.wake = e.target.checked; Prefs.save(); if (state.wake) request(); else release(); });
    return { set: set, active: function(){ return !!lock; } };
  })();

  function applyType(){
    var r = document.documentElement.style;
    r.setProperty("--fsN", String(state.size));
    r.setProperty("--lh", String(state.lh));
    r.setProperty("--w", state.width + "px");
    r.setProperty("--reader-font", FONTS[state.font] || FONTS.serif);
    r.setProperty("--margin", (state.margin || 0) + "px");
    document.querySelectorAll("#fontChips .chip").forEach(function(ch){
      ch.classList.toggle("on", ch.dataset.font === state.font);
    });
    $("#doc").classList.toggle("justify", !!state.justify);
    $("#doc").classList.toggle("hyphens", !!state.hyphens);
    $("#cJustify").checked = !!state.justify;
    $("#cHyphens").checked = !!state.hyphens;
    $("#rSize").value = state.size; $("#rLh").value = state.lh; $("#rW").value = state.width; $("#rM").value = state.margin || 0;
    $("#vSize").textContent = state.size + " px";
    $("#vLh").textContent   = state.lh.toFixed(2);
    $("#vW").textContent    = state.width + " px";
    $("#vM").textContent    = (state.margin || 0) + " px";
    if (state.mode === "doc" && state.flow === "pages"){
      layoutDocPages();
      gotoPage(state.page);
    }
    Prefs.save();
  }

  /* ---------- view switching ---------- */
  function show(mode){
    state.mode = mode;
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
    $("#textGroup").classList.toggle("dim", mode === "pdf");
    $("#textHint").textContent = mode === "pdf"
      ? "A PDF is open — these apply to text documents. Use Zoom below for PDFs."
      : "Applies to text documents (EPUB, DOCX, TXT, Markdown, HTML).";
  }
  function status(msg){ $("#status").textContent = msg; show("status"); }
  $("#status").setAttribute("role", "status"); $("#status").setAttribute("aria-live", "polite");

  /* ---------- paged reading ---------- */
  function pagedActive(){
    return state.flow === "pages" && (state.mode === "doc" || state.mode === "pdf");
  }
  function headVar(){ var head = document.querySelector("header"); if (head) document.documentElement.style.setProperty("--headH", head.offsetHeight + "px"); }
  window.addEventListener("resize", headVar);
  function availHeight(){
    headVar();
    var head = document.querySelector("header");
    var headH = document.body.classList.contains("immersive") ? 0 : head.offsetHeight;
    var pagerH = $("#pager").offsetHeight || 56;
    document.documentElement.style.setProperty("--pagerH", pagerH + "px");
    var ttsEl = $("#tts"), ttsH = ttsEl && ttsEl.classList.contains("on") ? ttsEl.offsetHeight : 0;
    return Math.max(160, window.innerHeight - headH - pagerH - ttsH - 26);
  }
  function spreadOn(){ return state.spread !== false && window.innerWidth >= 1000; }
  function layoutDocPages(){
    var view = $("#docView"), doc = $("#doc");
    view.style.height = availHeight() + "px";
    state.perPage = spreadOn() ? 2 : 1;
    document.body.classList.toggle("spread", state.perPage === 2);
    state.colw = state.perPage === 2 ? Math.floor((view.clientWidth - state.gap) / 2) : view.clientWidth;
    doc.style.columnWidth = state.colw + "px";
    doc.style.columnGap = state.gap + "px";
    var cols = Math.max(1, Math.ceil(doc.scrollWidth / (state.colw + state.gap)));
    state.totalPages = Math.max(1, Math.ceil(cols / state.perPage));
  }
  /* which page shows a given x offset inside the column strip */
  function pageOfOffset(x){ return Math.floor(x / (state.colw + state.gap) / (state.perPage || 1)); }
  function exitDocPages(){
    var view = $("#docView"), doc = $("#doc");
    document.body.classList.remove("spread");
    state.perPage = 1;
    view.style.height = "";
    doc.style.columnWidth = "";
    doc.style.columnGap = "";
    doc.style.transform = "";
  }
  function gotoPage(n){
    n = Math.max(0, Math.min(n, state.totalPages - 1));
    state.page = n;
    $("#doc").style.transform = "translateX(" + (-n * (state.perPage || 1) * (state.colw + state.gap)) + "px)";
    updatePager(); updateProgress();
    Library.notePosition();
  }
  function relayoutPaged(){
    if (state.mode === "doc" && state.flow === "pages"){
      layoutDocPages(); gotoPage(state.page);
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
    var frac = readFrac();
    state.flow = f;
    document.querySelectorAll("#flowChips .chip").forEach(function(ch){
      ch.classList.toggle("on", ch.dataset.flow === f);
    });
    Prefs.save();
    if (state.mode === "pdf" && state.pdfDoc && f === "pages")
      state.pdfPageNum = Math.round(frac * (state.pdfDoc.numPages - 1)) + 1;
    document.body.classList.remove("hidebar");
    reflow();
    if (state.mode === "doc" && f === "pages")
      gotoPage(Math.round(frac * (state.totalPages - 1)));
    if (f === "scroll")
      requestAnimationFrame(function(){
        var h = document.documentElement;
        window.scrollTo(0, frac * (h.scrollHeight - h.clientHeight));
      });
  }
  function turn(dir){
    if (!pagedActive()) return;
    if (state.mode === "doc"){ gotoPage(state.page + dir); }
    else {
      var step = state.perPage || 1;
      var n = state.pdfPageNum + dir * step;
      if (n < 1) n = 1;
      if (n > state.pdfDoc.numPages) return;
      if (n !== state.pdfPageNum){ state.pdfPageNum = n; renderPdfSingle(); }
    }
  }
  function updatePager(){
    var cur, total;
    if (state.mode === "doc"){ cur = state.page + 1; total = state.totalPages; }
    else if (state.pdfDoc){ cur = state.pdfPageNum; total = state.pdfDoc.numPages; if (state.perPage === 2 && state.flow === "pages" && cur < total) cur = cur + "\u2013" + (cur + 1); }
    else { cur = 1; total = 1; }
    $("#pgInfo").textContent = cur + " / " + total;
  }
  function updateProgress(){
    if (!pagedActive()) return;
    Progress.tick();
    var cur, total;
    if (state.mode === "doc"){ cur = state.page + 1; total = state.totalPages; }
    else { cur = state.pdfPageNum; total = state.pdfDoc ? state.pdfDoc.numPages : 1; }
    $("#progress").style.width = (total > 0 ? (cur / total) * 100 : 0) + "%";
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
  function openFile(file, opts){
    if (!file) return;
    opts = opts || {};
    try { document.dispatchEvent(new CustomEvent("ll:fileopened")); } catch(_){}
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    Library.onOpen(file, opts);
    $("#fname").textContent = file.name;
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
      console.error(err);
      state.opening = false;
      status("Couldn't open “" + file.name + "”. " + (err && err.message ? err.message : ""));
      Library.docReady();
    };

    try{
      if (ext === "pdf"){
        status("Opening PDF…");
        needPdf().then(function(){ return file.arrayBuffer(); }).then(function(buf){
          return pdfjsLib.getDocument({data: buf}).promise;
        }).then(function(doc){
          state.pdfDoc = doc;
          state.zoom = 1;
          $("#rZoom").value = 100; $("#vZoom").textContent = "100 %";
          show("pdf");
          reflow();
        }).catch(fail);

      } else if (ext === "docx"){
        status("Opening document…");
        Promise.all([need(["purify"]), docxToHtml(file)]).then(function(r){
          setDocHtml(r[1]);
        }).catch(fail);

      } else if (ext === "epub"){
        status("Opening book…");
        need(["jszip", "purify"]).then(function(){ return file.arrayBuffer(); }).then(function(buf){
          return openEpub(buf);
        }).then(function(book){
          if (book.title){
            $("#fname").textContent = book.title + (book.author ? " — " + book.author : "");
            Library.setTitle(book.title + (book.author ? " — " + book.author : ""));
            Tabs.setName(Library.currentId(), book.title + (book.author ? " — " + book.author : ""));
          }
          setDocHtml(book.html, {toc: book.toc, keepIds: true});
        }).catch(fail);

      } else if (ext === "doc" || ext === "rtf" || ext === "odt" || ext === "pages"){
        status("." + ext + " isn't supported yet — export it as PDF, EPUB or DOCX and open that instead.");

      } else if (ext === "md" || ext === "markdown"){
        need(["marked", "purify"]).then(function(){ return file.text(); }).then(function(txt){
          setDocHtml(marked.parse(txt));
        }).catch(fail);

      } else if (ext === "html" || ext === "htm"){
        status("Opening page…");
        need(["purify"]).then(function(){ return file.text(); }).then(function(txt){
          setDocHtml(readerHtml(txt));
        }).catch(fail);

      } else {
        file.text().then(function(txt){
          var wrap = document.createElement("div");
          wrap.className = "plain";
          wrap.textContent = txt;
          $("#doc").innerHTML = "";
          $("#doc").appendChild(wrap);
          show("doc");
          reflow();
          Library.docReady();
        }).catch(fail);
      }
    } catch(err){ fail(err); }
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
    if (el) revealElement(el);
  });
  /* scroll / page to a character offset in the text (see Anchor) */
  function revealOffset(off, opts){
    if (state.mode !== "doc") return false;
    var r = Anchor.rangeAt(off);
    if (!r) return false;
    var rect = r.getBoundingClientRect();
    if (state.flow === "pages"){
      var docRect = $("#doc").getBoundingClientRect();
      gotoPage(pageOfOffset(rect.left - docRect.left + 1));
    } else {
      var head = document.querySelector("header");
      var headH = document.body.classList.contains("immersive") ? 0 : head.offsetHeight;
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
      gotoPage(pageOfOffset(offset));
    } else {
      var head = document.querySelector("header");
      var y = el.getBoundingClientRect().top + window.scrollY - (head ? head.offsetHeight : 0) - 12;
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
      sc.onerror = function(){ delete scriptsLoaded[src]; reject(new Error("Couldn't load " + src)); };
      document.head.appendChild(sc);
    });
    return scriptsLoaded[src];
  }
  var epubUrls = [];
  function releaseEpubUrls(){
    epubUrls.forEach(function(u){ try { URL.revokeObjectURL(u); } catch(_){} });
    epubUrls = [];
  }
  function pathJoin(base, rel){
    if (/^[a-z]+:/i.test(rel)) return rel;
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
      if (zip.file("META-INF/encryption.xml")) throw new Error("This book is protected (DRM), so it can't be opened here.");
      var container = zip.file("META-INF/container.xml");
      if (!container) throw new Error("Not a valid EPUB (no container.xml).");
      return container.async("string").then(function(xml){
        var cdoc = new DOMParser().parseFromString(xml, "application/xml");
        var rf = cdoc.querySelector("rootfile");
        var opfPath = rf && (rf.getAttribute("full-path") || "");
        if (!opfPath || !zip.file(opfPath)) throw new Error("Not a valid EPUB (no package file).");
        return zip.file(opfPath).async("string").then(function(opfXml){ return parseOpf(zip, opfPath, opfXml); });
      });
    });
  }
  function parseOpf(zip, opfPath, opfXml){
    var opf = new DOMParser().parseFromString(opfXml, "application/xml");
    var q = function(sel, root){ return Array.prototype.slice.call((root || opf).getElementsByTagName(sel)); };
    var meta = function(name){ var el = q(name)[0] || q("dc:" + name)[0]; return el ? el.textContent.trim() : ""; };
    var title = meta("title"), author = meta("creator");
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
    if (!spine.length) throw new Error("This EPUB has no readable chapters.");

    /* stable anchor ids: one per file (+ its own ids inside) */
    var fileKey = {}; spine.forEach(function(sp, i){ fileKey[sp.href] = "ep" + i; });
    function anchorId(href, frag){ return (fileKey[href] || "ep-" + href.replace(/[^A-Za-z0-9]+/g, "-")) + (frag ? "-" + frag : ""); }

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
        a.setAttribute("href", "#" + anchorId(target, parts[1] || ""));
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
        return { html: html, title: title, author: author, toc: toc };
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
            out.push({ title: a.textContent.replace(/\s+/g, " ").trim(), id: anchorId(target, parts[1] || ""), level: level });
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
          out.push({ title: label ? label.textContent.replace(/\s+/g, " ").trim() : "", id: anchorId(target, parts[1] || ""), level: level });
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
  function renderPdfScroll(){
    var gen = ++renderGen;
    var doc = state.pdfDoc;
    var holder = $("#pdf");
    holder.style.height = "";
    holder.innerHTML = "";
    holder.classList.remove("spread");
    state.perPage = 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    doc.getPage(1).then(function(page){
      var vp1 = page.getViewport({scale:1});
      state.fitScale = Math.max(0.4, Math.min(contentWidth() / vp1.width, 2.5));
      var scale = state.fitScale * state.zoom;
      var i = 1;
      (function next(){
        if (gen !== renderGen || i > doc.numPages) return;
        doc.getPage(i).then(function(pg){
          if (gen !== renderGen) return;
          var vp = pg.getViewport({scale: scale * dpr});
          var canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = Math.floor(vp.width / dpr) + "px";
          holder.appendChild(canvas);
          canvas.dataset.page = i;
          return pg.render({canvasContext: canvas.getContext("2d"), viewport: vp}).promise;
        }).then(function(){
          if (gen === renderGen) Library.pdfPageReady(i);
          i++; next();
        }).catch(function(err){
          if (gen === renderGen) status("PDF rendering failed. " + (err && err.message ? err.message : ""));
        });
      })();
    }).catch(function(err){
      if (gen === renderGen) status("PDF rendering failed. " + (err && err.message ? err.message : ""));
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
        canvases.forEach(function(c){ holder.appendChild(c.canvas); });
        updatePager(); updateProgress();
        Library.pdfReady();
      });
    }).catch(function(err){
      if (gen === renderGen) status("PDF rendering failed. " + (err && err.message ? err.message : ""));
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
  var Anchor = {
    textNodes: function(root){
      var out = [], w = document.createTreeWalker(root || $("#doc"), NodeFilter.SHOW_TEXT);
      var n; while ((n = w.nextNode())) out.push(n);
      return out;
    },
    offsetOf: function(node, off){
      var nodes = Anchor.textNodes(), sum = 0;
      for (var i = 0; i < nodes.length; i++){
        if (nodes[i] === node) return sum + off;
        sum += nodes[i].length;
      }
      return null;
    },
    /* (node, offset) for a character offset; boundary offsets belong to the following node */
    point: function(off, preferEnd){
      var nodes = Anchor.textNodes(), sum = 0;
      for (var i = 0; i < nodes.length; i++){
        var len = nodes[i].length;
        if (off < sum + len || (preferEnd && off === sum + len) || (i === nodes.length - 1 && off <= sum + len)){
          if (!/\S/.test(nodes[i].textContent) && i < nodes.length - 1 && !preferEnd){ sum += len; continue; }
          return { node: nodes[i], offset: Math.max(0, Math.min(len, off - sum)) };
        }
        sum += len;
      }
      return null;
    },
    rangeAt: function(off){
      var p = Anchor.point(off);
      if (!p) return null;
      var r = document.createRange();
      var o = Math.min(p.offset, Math.max(0, p.node.length - 1));
      r.setStart(p.node, o); r.setEnd(p.node, Math.min(p.node.length, o + 1));
      return r;
    },
    rangeBetween: function(start, end){
      var a = Anchor.point(start), b = Anchor.point(end, true);
      if (!a || !b) return null;
      var r = document.createRange();
      r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
      return r;
    },
    textLength: function(){ return $("#doc").textContent.length; }
  };

  /* ---------- side panel: contents, marks, search share one drawer ---------- */
  var Side = (function(){
    var el = $("#side"), scrim = $("#sideScrim"), body = $("#sideBody"), foot = $("#sideFoot"), title = $("#sideTitle");
    var current = null, onClose = null, opener = null;
    function open(name, ttl, render, closeFn){
      current = name; onClose = closeFn || null;
      opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : $("#more");
      title.textContent = ttl;
      body.innerHTML = ""; foot.innerHTML = ""; foot.style.display = "none";
      render(body, foot);
      if (foot.children.length) foot.style.display = "flex";
      el.classList.add("open"); scrim.classList.add("on"); el.setAttribute("aria-hidden", "false");
      $("#moreMenu").classList.remove("open");
      /* move focus into the panel; the first control if there is one, else the heading */
      setTimeout(function(){
        var first = body.querySelector("input, [tabindex='0'], button");
        (first || $("#sideClose")).focus({ preventScroll: true });
      }, 60);
    }
    function close(){
      if (!current) return;
      var fn = onClose; current = null; onClose = null;
      el.classList.remove("open"); scrim.classList.remove("on"); el.setAttribute("aria-hidden", "true");
      if (fn) fn();
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      opener = null;
    }
    scrim.addEventListener("click", close);
    $("#sideClose").addEventListener("click", close);
    document.addEventListener("keydown", function(e){ if (e.key === "Escape" && current) close(); });
    return { open: open, close: close, is: function(name){ return current === name; }, body: body, foot: foot,
             refresh: function(name, render){ if (current === name){ body.innerHTML = ""; foot.innerHTML = ""; render(body, foot); foot.style.display = foot.children.length ? "flex" : "none"; } } };
  })();

  /* ---------- "more" menu: features register their entries here ---------- */
  var Menu = (function(){
    var items = [], btn = $("#more"), menu = $("#moreMenu");
    function add(item){ if (item.order === undefined) item.order = 100 + items.length; items.push(item); }
    function render(){
      menu.innerHTML = "";
      items.slice().sort(function(a, b){ return a.order - b.order; }).forEach(function(it){
        if (it.sep){ var d = document.createElement("div"); d.className = "sep"; menu.appendChild(d); return; }
        if (it.show && !it.show()) return;
        var b = document.createElement("button");
        b.type = "button"; b.setAttribute("role", "menuitem");
        b.innerHTML = '<span>' + (typeof it.label === "function" ? it.label() : it.label) + '</span>' + (it.key ? '<kbd>' + it.key + '</kbd>' : '');
        if (it.enabled && !it.enabled()) b.disabled = true;
        b.addEventListener("click", function(){ close(); it.run(); });
        menu.appendChild(b);
      });
      /* drop a trailing / doubled separator */
      var kids = Array.prototype.slice.call(menu.children);
      kids.forEach(function(k, i){ if (k.className === "sep" && (i === kids.length - 1 || i === 0 || (kids[i+1] && kids[i+1].className === "sep"))) k.remove(); });
    }
    function open(){ render(); menu.classList.add("open"); btn.setAttribute("aria-expanded", "true"); document.body.classList.remove("hidebar"); }
    function close(){ menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function(e){ e.stopPropagation(); if (menu.classList.contains("open")) close(); else open(); });
    document.addEventListener("click", function(e){ if (!e.target.closest("#moreWrap")) close(); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") close(); });
    return { add: add, close: close };
  })();

  var Library = (function(){
    var DB_NAME = "lamplight", DB_VERSION = 2;
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
        };
        req.onsuccess = function(){ resolve(req.result); };
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
    }).catch(function(err){ console.warn("library unavailable", err); });

    /* ---- position capture ---- */
    function headerHeight(){
      var head = document.querySelector("header");
      return document.body.classList.contains("immersive") ? 0 : (head ? head.offsetHeight : 0);
    }
    var charOffsetOf = Anchor.offsetOf, rangeAtOffset = Anchor.rangeAt;
    function topCharOffset(){
      var docEl = $("#doc");
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
      return null;
    }
    function currentPdfPage(){
      if (state.flow === "pages") return state.pdfPageNum;
      /* the page that fills the upper part of the screen (a sliver of the previous one doesn't count) */
      var head = headerHeight(), line = head + (window.innerHeight - head) * 0.4, canvases = $("#pdf").querySelectorAll("canvas");
      for (var i = 0; i < canvases.length; i++){
        if (canvases[i].getBoundingClientRect().bottom > line) return +canvases[i].dataset.page || (i + 1);
      }
      return state.pdfPageNum || 1;
    }
    function capture(){
      if (!current || (state.mode !== "doc" && state.mode !== "pdf")) return null;
      var pos = { id: current, mode: state.mode, flow: state.flow, frac: readFrac(), updated: Date.now() };
      if (state.mode === "doc"){
        pos.off = topCharOffset();
        pos.total = $("#doc").textContent.length;
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
        } else if (ready.pdfPages[n]){
          pending = null;
          var c = $("#pdf").querySelector('canvas[data-page="' + n + '"]');
          if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - headerHeight() - 6));
        }
      } else if (!state.opening && (state.mode === "status" || state.mode === "empty")){
        /* opening failed — nothing to restore */
        pending = null;
      }
    }

    /* ---- hooks called by the reader ---- */
    function onOpen(file, opts){
      current = null; pending = null; titleQueue = null; ready = { doc: false, pdfPages: {} };
      clearTimeout(saveTimer);
      Marks.setDoc(null);
      loaded.then(function(){ return idFor(file); }).then(function(id){
        current = id;
        Marks.setDoc(id, file.name);
        Tabs.noteOpen(id, file.name, file);
        var pos = positions[id];
        if (pos && !opts.fresh){ pending = pos; tryRestore(); }
        var existing = books.filter(function(b){ return b.id === id; })[0];
        var rec = existing || { id: id, name: file.name, type: typeOf(file.name), size: file.size, added: Date.now(), blob: file };
        rec.opened = Date.now();
        if (titleQueue){ rec.title = titleQueue; titleQueue = null; }
        if (!existing) books.unshift(rec); else { books.splice(books.indexOf(existing), 1); books.unshift(rec); }
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
      });
    }
    function setTitle(title){
      if (!title) return;
      if (!current){ titleQueue = title; return; }
      var b = books.filter(function(x){ return x.id === current; })[0];
      if (b && b.title !== title){ b.title = title; tx("books", "readwrite", function(st){ st.put(b); }).catch(function(){}); render(); }
    }
    function docReady(){ ready.doc = true; ready.pdfPages = {}; tryRestore(); Marks.docReady(); }
    function pdfReady(){ tryRestore(); }
    function pdfPageReady(n){ ready.pdfPages[n] = true; tryRestore(); }

    /* ---- the list on the start screen ---- */
    function ago(t){
      var d = Date.now() - t, m = Math.round(d / 60000);
      if (m < 2) return "just now";
      if (m < 60) return m + " min ago";
      var h = Math.round(m / 60);
      if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
      var days = Math.round(h / 24);
      if (days === 1) return "yesterday";
      if (days < 30) return days + " days ago";
      return new Date(t).toLocaleDateString();
    }
    function escapeHtml(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function render(){
      var list = $("#libList");
      if (!list) return;
      var lib = $("#library");
      lib.classList.toggle("show", state.mode === "empty" && books.length > 0);
      list.innerHTML = books.slice(0, 60).map(function(b){
        var pos = positions[b.id], pct = pos ? pos.pct : 0;
        return '<div class="lib-item" role="button" tabindex="0" data-id="' + escapeHtml(b.id) + '" title="' + escapeHtml(b.name) + '">' +
          '<span class="lib-type">' + escapeHtml(b.type) + '</span>' +
          '<span><div class="lib-name">' + escapeHtml(b.title || b.name) + '</div>' +
          '<div class="lib-meta"><span class="lib-bar"><i style="width:' + pct + '%"></i></span><span>' + (pct ? pct + "%" : "new") + ' · ' + ago(b.opened) + '</span></div></span>' +
          '<button class="lib-x" data-x="' + escapeHtml(b.id) + '" title="Remove from library" aria-label="Remove">×</button>' +
          '</div>';
      }).join("");
    }
    $("#libList").addEventListener("click", function(e){
      var x = e.target.closest(".lib-x");
      if (x){ e.stopPropagation(); remove(x.dataset.x); return; }
      var it = e.target.closest(".lib-item");
      if (it) openId(it.dataset.id);
    });
    $("#libList").addEventListener("keydown", function(e){
      var it = e.target.closest(".lib-item");
      if (it && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); openId(it.dataset.id); }
    });
    $("#libClear").addEventListener("click", function(){
      if (!books.length || !confirm("Remove all " + books.length + " files and reading positions from this device?")) return;
      books = []; positions = {};
      tx("books", "readwrite", function(st){ st.clear(); }).catch(function(){});
      tx("positions", "readwrite", function(st){ st.clear(); }).catch(function(){});
      tx("marks", "readwrite", function(st){ st.clear(); }).catch(function(){});
      render(); show("empty");
    });
    function openId(id){
      var b = books.filter(function(x){ return x.id === id; })[0];
      if (!b || !b.blob) return;
      var f = b.blob;
      if (!(f instanceof File)){ try { f = new File([b.blob], b.name, { type: b.blob.type }); } catch(_){ f = b.blob; f.name = b.name; } }
      openFile(f, { fromLibrary: true });
    }
    function remove(id){
      books = books.filter(function(x){ return x.id !== id; });
      delete positions[id];
      Marks.forget(id);
      Tabs.drop(id);
      tx("books", "readwrite", function(st){ st.delete(id); }).catch(function(){});
      tx("positions", "readwrite", function(st){ st.delete(id); }).catch(function(){});
      if (current === id) current = null;
      render();
      if (!books.length) show("empty");
    }
    function home(){
      flush();
      if (state.mode === "doc" || state.mode === "pdf"){
        document.body.classList.remove("hidebar", "immersive");
        window.scrollTo(0, 0);
      }
      $("#sheet").classList.remove("open");
      $("#fname").textContent = "";
      document.title = "lamplight — reader";
      show("empty");
      render();
    }

    return { tx: tx, headerHeight: headerHeight, topCharOffset: topCharOffset, currentPdfPage: currentPdfPage, idFor: idFor, openId: openId,
             books: function(){ return books; }, remember: remember,
             onOpen: onOpen, docReady: docReady, pdfReady: pdfReady, pdfPageReady: pdfPageReady, notePosition: notePosition,
             flush: flush, home: home, count: function(){ return books.length; }, setTitle: setTitle, render: render,
             ready: loaded, currentId: function(){ return current; }, positionFor: function(id){ return positions[id]; },
             _debug: function(){ return { pending: pending, ready: ready, current: current }; } };
  })();

  /* ============================================================
     Marks — highlights, bookmarks and notes, per document, exportable
     ============================================================ */
  var Marks = (function(){
    var docId = null, docName = "", list = [], loaded = false, rendered = false, loadGen = 0;
    var COLORS = ["accent", "sun", "leaf", "rose"];
    var pop = $("#markPop"), popKey = null;

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
    }
    function wrap(m){
      var nodes = Anchor.textNodes(), sum = 0;
      for (var i = 0; i < nodes.length; i++){
        var n = nodes[i], len = n.length, a = Math.max(0, m.start - sum), b = Math.min(len, m.end - sum);
        sum += len;
        if (b <= a || !/\S/.test(n.textContent.slice(a, b))) continue;
        var target = n;
        if (b < len) target.splitText(b);
        if (a > 0) target = target.splitText(a);
        var mk = document.createElement("mark");
        mk.className = "ll-mark" + (m.note ? " noted" : "");
        mk.dataset.key = m.key; if (m.color && m.color !== "accent") mk.dataset.color = m.color;
        target.parentNode.insertBefore(mk, target); mk.appendChild(target);
      }
    }
    function apply(){
      if (state.mode !== "doc") return;
      unwrapAll();
      list.forEach(function(m){ if (m.kind === "highlight" && typeof m.start === "number") wrap(m); });
      rendered = true;
      if (window.Search) Search.refresh();
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
      save(m); apply(); refreshPanel();
      return m;
    }
    function selectionOffsets(){
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0);
      function pt(container, offset, isEnd){
        if (container.nodeType === 3) return Anchor.offsetOf(container, offset);
        var kids = container.childNodes, node = isEnd ? kids[offset - 1] : kids[offset];
        if (!node) return isEnd ? null : null;
        var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), t = null, last = null;
        while ((t = w.nextNode())){ if (!isEnd) return Anchor.offsetOf(t, 0); last = t; }
        return last ? Anchor.offsetOf(last, last.length) : null;
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
        if (list.some(function(x){ return x.kind === "bookmark" && x.pdfPage === m.pdfPage; })) { toast("Already bookmarked"); return null; }
      } else {
        var off = Library.topCharOffset();
        if (off === null){ toast("Couldn't find the spot"); return null; }
        m.start = off; m.end = off;
        var r = Anchor.rangeBetween(off, Math.min(Anchor.textLength(), off + 160));
        var words = (r ? r.toString() : "").replace(/\s+/g, " ").trim().split(" ").slice(0, 9).join(" ");
        m.label = words ? "\u201C" + words + "\u2026\u201D" : Math.round(readFrac() * 100) + "%";
        if (list.some(function(x){ return x.kind === "bookmark" && Math.abs((x.start || 0) - off) < 40; })) { toast("Already bookmarked"); return null; }
      }
      m.pct = pctOf(m);
      list.push(m); list.sort(function(a, b){ return sortKey(a) - sortKey(b); });
      save(m); refreshPanel();
      toast("Bookmarked");
      return m;
    }
    function remove(m){
      list = list.filter(function(x){ return x !== m; });
      del(m); if (m.kind === "highlight") apply(); refreshPanel(); hidePop();
    }
    function setNote(m, note){ m.note = note || ""; m.updated = Date.now(); save(m); if (m.kind === "highlight") apply(); refreshPanel(); }
    function setColor(m, color){ m.color = color; save(m); apply(); refreshPanel(); }
    function reveal(m){
      Side.close();
      if (m.pdfPage && state.mode === "pdf"){
        if (state.flow === "pages"){ state.pdfPageNum = m.pdfPage; renderPdfSingle(); }
        else { var c = $("#pdf").querySelector('canvas[data-page="' + m.pdfPage + '"]'); if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 6)); }
      } else if (typeof m.start === "number") revealOffset(m.start);
    }

    /* ---- small toast ---- */
    var toastEl = null, toastTimer = null;
    function toast(msg){
      if (!toastEl){ toastEl = document.createElement("div"); toastEl.id = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
      toastEl.textContent = msg; toastEl.classList.add("on");
      clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toastEl.classList.remove("on"); }, 1800);
    }

    /* ---- popover on a highlight ---- */
    function hidePop(){ pop.classList.remove("on"); popKey = null; }
    function showPop(mk){
      var m = list.filter(function(x){ return x.key === mk.dataset.key; })[0];
      if (!m) return;
      popKey = m.key;
      pop.innerHTML = '<button data-act="note">' + (m.note ? "Edit note" : "Note") + '</button>' +
        COLORS.map(function(c){ return '<button class="dot ' + c + '" data-color="' + c + '" title="' + c + '" aria-label="Colour ' + c + '"></button>'; }).join("") +
        '<button data-act="remove">Remove</button>';
      pop.classList.add("on");
      var r = mk.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      var x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
      var y = r.top - ph - 8; if (y < 8) y = r.bottom + 8;
      pop.style.left = x + "px"; pop.style.top = y + "px";
    }
    pop.addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      var m = list.filter(function(x){ return x.key === popKey; })[0]; if (!m) return;
      if (b.dataset.color){ setColor(m, b.dataset.color); hidePop(); }
      else if (b.dataset.act === "remove") remove(m);
      else if (b.dataset.act === "note"){ hidePop(); openPanel(m.key); }
    });
    $("#doc").addEventListener("click", function(e){
      var mk = e.target.closest && e.target.closest("mark.ll-mark");
      if (!mk){ hidePop(); return; }
      e.stopImmediatePropagation(); e.preventDefault();
      if (popKey === mk.dataset.key) hidePop(); else showPop(mk);
    }, true);
    document.addEventListener("click", function(e){ if (!e.target.closest("#markPop") && !e.target.closest("mark.ll-mark")) hidePop(); });
    window.addEventListener("scroll", hidePop, { passive: true });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") hidePop(); });

    /* ---- panel ---- */
    function refreshPanel(){ if (Side.is("marks")) Side.refresh("marks", renderPanel); }
    var editKey = null;
    function renderPanel(body, foot){
      if (!list.length){
        body.innerHTML = '<div class="empty-note">No bookmarks or highlights yet.<br>' +
          (state.mode === "pdf" ? 'Use \u201CBookmark here\u201D in the \u22EF menu to mark a page.' :
           'Select text and choose Highlight, or hold a sentence and tap Highlight. \u201CBookmark here\u201D in the \u22EF menu marks your spot.') + '</div>';
        return;
      }
      var h = "";
      list.forEach(function(m){
        var pct = pctOf(m);
        h += '<div class="mark-item" data-key="' + esc(m.key) + '">' +
          '<div class="mark-kind">' + (m.kind === "bookmark" ? "Bookmark" : "Highlight") + '<span>' + (m.pdfPage ? "page " + m.pdfPage : pct + "%") + '</span></div>';
        if (m.kind === "bookmark") h += '<div class="mark-text">' + esc(m.label || "") + '</div>';
        else h += '<div class="mark-text q" data-color="' + esc(m.color || "accent") + '">' + esc(m.text || "") + '</div>';
        if (editKey === m.key) h += '<textarea data-note="' + esc(m.key) + '" placeholder="Your note\u2026">' + esc(m.note || "") + '</textarea>';
        else h += '<div class="mark-note">' + esc(m.note || "") + '</div>';
        h += '<div class="mark-acts">' +
          (editKey === m.key ? '<button data-act="savenote">Save note</button><button data-act="cancel">Cancel</button>'
                             : '<button data-act="note">' + (m.note ? "Edit note" : "Add note") + '</button>') +
          '<button data-act="del">Delete</button></div></div>';
      });
      body.innerHTML = h;
      var ta = body.querySelector("textarea"); if (ta){ ta.focus(); ta.selectionStart = ta.value.length; }
      foot.innerHTML = '<button class="chip" data-exp="md">Export Markdown</button><button class="chip" data-exp="json">Export JSON</button><button class="chip" data-exp="copy">Copy as text</button>';
    }
    function openPanel(focusKey){
      editKey = focusKey || null;
      Side.open("marks", "Bookmarks & notes", renderPanel, function(){ editKey = null; });
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("marks")) return;
      var item = e.target.closest(".mark-item"); if (!item) return;
      var m = list.filter(function(x){ return x.key === item.dataset.key; })[0]; if (!m) return;
      var b = e.target.closest("button");
      if (!b){ if (!e.target.closest("textarea")) reveal(m); return; }
      var act = b.dataset.act;
      if (act === "del"){ remove(m); }
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
      var out = ["# " + ($("#fname").textContent || docName), "", "_Exported from Lamplight on " + new Date().toLocaleString() + "_", ""];
      var bms = list.filter(function(m){ return m.kind === "bookmark"; }), his = list.filter(function(m){ return m.kind === "highlight"; });
      if (bms.length){
        out.push("## Bookmarks", "");
        bms.forEach(function(m){ out.push("- " + (m.pdfPage ? "Page " + m.pdfPage : pctOf(m) + "%") + " \u2014 " + (m.label || "") + (m.note ? "  \n  " + m.note.replace(/\n/g, "  \n  ") : "")); });
        out.push("");
      }
      if (his.length){
        out.push("## Highlights", "");
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
    function download(name, text, type){
      var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);
    }
    function exportMarks(fmt){
      if (fmt === "md") download(baseName() + "-notes.md", toMarkdown(), "text/markdown");
      else if (fmt === "json") download(baseName() + "-notes.json", toJSON(), "application/json");
      else if (navigator.clipboard) navigator.clipboard.writeText(toMarkdown()).then(function(){ toast("Copied"); }, function(){ toast("Couldn\u2019t copy"); });
    }

    Menu.add({ order: 30, label: "Bookmark here", key: "B", run: addBookmark, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    Menu.add({ order: 31, label: function(){ return "Bookmarks & notes" + (list.length ? " (" + list.length + ")" : ""); }, key: "N", run: function(){ openPanel(); }, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });

    return { setDoc: setDoc, docReady: docReady, apply: apply, forget: forget, addHighlight: addHighlight, highlightSelection: highlightSelection,
             selectionOffsets: selectionOffsets, addBookmark: addBookmark, openPanel: openPanel, toast: toast, list: function(){ return list; },
             toMarkdown: toMarkdown, toJSON: toJSON };
  })();

  /* ============================================================
     Table of contents — PDF outline, EPUB nav, or headings
     ============================================================ */
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
        var c = $("#pdf").querySelector('canvas[data-page="' + n + '"]');
        if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 6));
        else Marks.toast("Page " + n + " is still rendering");
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
      var head = Library.headerHeight();
      var line = state.flow === "pages" ? null : head + (window.innerHeight - head) * 0.35;
      entries.forEach(function(e, i){
        var r = e.el.getBoundingClientRect();
        if (state.flow === "pages"){
          var docRect = $("#doc").getBoundingClientRect();
          var col = pageOfOffset(r.left - docRect.left + 1);
          if (col <= state.page) cur = i;
        } else if (r.top <= line) cur = i;
      });
      return cur;
    }
    function renderList(body, entries){
      if (!entries.length){
        body.innerHTML = '<div class="empty-note">' + (state.mode === "pdf" ? "This PDF has no outline." : "No headings found in this document.") + '</div>';
        return;
      }
      var cur = currentIndex(entries);
      body.innerHTML = entries.map(function(e, i){
        return '<div class="toc-item' + (i === cur ? ' cur' : '') + '" data-i="' + i + '" data-level="' + e.level + '" role="button" tabindex="0">' +
          '<span class="toc-t">' + esc(e.title) + '</span>' + (e.page ? '<span class="toc-p">' + e.page + '</span>' : '') + '</div>';
      }).join("");
      var c = body.querySelector(".toc-item.cur"); if (c) c.scrollIntoView({ block: "center" });
      body.onclick = function(ev){
        var it = ev.target.closest(".toc-item"); if (!it) return;
        var e = entries[+it.dataset.i]; if (!e) return;
        Side.close();
        if (e.el) revealElement(e.el); else if (e.page) goPdfPage(e.page);
      };
      body.onkeydown = function(ev){ if (ev.key === "Enter" || ev.key === " "){ var it = ev.target.closest(".toc-item"); if (it){ ev.preventDefault(); it.click(); } } };
    }
    function render(body, foot){
      if (state.mode === "pdf"){
        body.innerHTML = '<div class="empty-note">Reading the outline\u2026</div>';
        foot.innerHTML = '<label class="toc-goto">Go to page <input type="number" id="tocGoto" min="1" max="' + state.pdfDoc.numPages + '" value="' + Library.currentPdfPage() + '"> of ' + state.pdfDoc.numPages + '</label>';
        foot.querySelector("#tocGoto").addEventListener("keydown", function(e){ if (e.key === "Enter"){ Side.close(); goPdfPage(+e.target.value); } });
        foot.querySelector("#tocGoto").addEventListener("change", function(e){ goPdfPage(+e.target.value); });
        var doc = state.pdfDoc;
        pdfEntries().then(function(entries){ if (Side.is("toc") && state.pdfDoc === doc) renderList(body, entries); });
      } else {
        renderList(body, docEntries());
      }
    }
    function openPanel(){ Side.open("toc", "Contents", render); }
    Menu.add({ order: 10, label: "Contents", key: "C", run: openPanel, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { openPanel: openPanel, entries: docEntries, pdfEntries: pdfEntries, goPdfPage: goPdfPage };
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
    function sectionTitleFor(off){
      var hs = $("#doc").querySelectorAll("h1, h2, h3");
      var best = null;
      for (var i = 0; i < hs.length; i++){
        var first = null, w = document.createTreeWalker(hs[i], NodeFilter.SHOW_TEXT); first = w.nextNode();
        var o = first ? Anchor.offsetOf(first, 0) : null;
        if (o !== null && o <= off) best = hs[i]; else if (o !== null && o > off) break;
      }
      return best ? best.textContent.replace(/\s+/g, " ").trim() : "";
    }
    function paint(){
      if (!hasHL) return;
      CSS.highlights.delete("ll-find"); CSS.highlights.delete("ll-find-cur");
      if (state.mode !== "doc" || !results.length) return;
      var all = [], curR = null;
      results.forEach(function(r, i){
        var range = Anchor.rangeBetween(r.start, r.end);
        if (!range) return;
        if (i === cur) curR = range; else all.push(range);
      });
      CSS.highlights.set("ll-find", new (Function.prototype.bind.apply(Highlight, [null].concat(all))));
      if (curR) CSS.highlights.set("ll-find-cur", new Highlight(curR));
    }
    function clearPaint(){
      if (hasHL){ CSS.highlights.delete("ll-find"); CSS.highlights.delete("ll-find-cur"); }
    }
    function runDoc(q){
      var text = Anchor.textNodes().map(function(n){ return n.textContent; }).join("");
      var re = rx(q), m, out = [];
      while ((m = re.exec(text)) && out.length < 500){
        out.push({ start: m.index, end: m.index + m[0].length, html: snippet(text, m.index, m.index + m[0].length) });
        if (!m[0].length) re.lastIndex++;
      }
      out.forEach(function(r){ r.where = sectionTitleFor(r.start); });
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
              out.push({ page: i, html: snippet(t, m.index, m.index + m[0].length), where: "Page " + i });
              if (!m[0].length) re.lastIndex++;
            }
            if (i % 10 === 0 && statusEl) statusEl.textContent = "Searching\u2026 page " + i + " of " + doc.numPages + (out.length ? " \u00B7 " + out.length + " so far" : "");
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
      if (statusEl) statusEl.textContent = "Searching\u2026";
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
      if (!query || query.length < 2){ statusEl.textContent = ""; listEl.innerHTML = '<div class="empty-note">Type at least two letters.</div>'; return; }
      statusEl.textContent = results.length ? (results.length >= 500 ? "500+ matches" : results.length + (results.length === 1 ? " match" : " matches")) + (cur >= 0 ? " \u00B7 " + (cur + 1) + " of " + results.length : "") : "No matches";
      listEl.innerHTML = results.map(function(r, i){
        return '<div class="find-item' + (i === cur ? ' cur' : '') + '" data-i="' + i + '" role="button" tabindex="0">' + (r.where ? '<span class="find-where">' + esc(r.where) + '</span>' : '') + r.html + '</div>';
      }).join("");
    }
    function go(i, keepPanel){
      if (!results.length) return;
      cur = (i + results.length) % results.length;
      var r = results[cur];
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
      body.innerHTML = '<div class="find-row"><input type="search" id="findInput" aria-label="Find in this document" placeholder="Find in this ' + (state.mode === "pdf" ? "PDF" : "document") + '\u2026" autocomplete="off" spellcheck="false">' +
        '<button class="ctl" id="findPrev" title="Previous match" aria-label="Previous match">\u2039</button><button class="ctl" id="findNext" title="Next match" aria-label="Next match">\u203A</button></div>' +
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
      Side.open("find", "Search", render, function(){ /* keep matches painted until the next document */ });
    }
    function reset(){ query = ""; results = []; cur = -1; clearPaint(); }
    function refresh(){ if (results.length && state.mode === "doc") paint(); }
    document.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F") && (state.mode === "doc" || state.mode === "pdf")){
        e.preventDefault(); openPanel();
      }
    });
    Menu.add({ order: 20, label: "Search", key: "/", run: openPanel, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { openPanel: openPanel, reset: reset, refresh: refresh, go: go, results: function(){ return results; } };
  })();

  /* ============================================================
     Read aloud — Web Speech API, sentence by sentence
     ============================================================ */
  var Speak = (function(){
    var supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    var bar = $("#tts"), playBtn = $("#ttsPlay"), rateEl = $("#ttsRate"), rateV = $("#ttsRateV"), voiceSel = $("#ttsVoice");
    var units = [], idx = -1, playing = false, active = false, utter = null, gen = 0, pdfPage = 0, pdfUnitsDoc = null;
    var rate = parseFloat(localStorage.getItem("ll_tts_rate") || "1") || 1;
    var voiceName = localStorage.getItem("ll_tts_voice") || "";
    var hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
    rateEl.value = rate; rateV.textContent = rate.toFixed(1) + "\u00D7";

    function voices(){ return supported ? speechSynthesis.getVoices() : []; }
    function fillVoices(){
      var vs = voices();
      var lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
      vs = vs.slice().sort(function(a, b){
        var al = a.lang.slice(0, 2).toLowerCase() === lang ? 0 : 1, bl = b.lang.slice(0, 2).toLowerCase() === lang ? 0 : 1;
        if (al !== bl) return al - bl;
        if (a.localService !== b.localService) return a.localService ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      voiceSel.innerHTML = vs.map(function(v){
        return '<option value="' + v.name.replace(/"/g, "&quot;") + '"' + (v.name === voiceName ? ' selected' : '') + '>' + v.name.replace(/</g, "&lt;") + (v.localService ? "" : " (online)") + '</option>';
      }).join("") || '<option value="">Default voice</option>';
    }
    if (supported){ fillVoices(); speechSynthesis.addEventListener("voiceschanged", fillVoices); }
    function currentVoice(){
      var vs = voices(), name = voiceSel.value || voiceName;
      return vs.filter(function(v){ return v.name === name; })[0] || null;
    }

    /* ---- sentence units ---- */
    var SENT = /[^.!?\u2026]+[.!?\u2026]*["\u201d\u2019)]?\s*/g;
    function splitLong(text, base, out){
      /* keep utterances short: some engines cut off after ~15 seconds */
      if (text.length <= 220){ out.push({ start: base, end: base + text.length, text: text }); return; }
      var i = 0;
      while (i < text.length){
        var j = Math.min(text.length, i + 200);
        if (j < text.length){ var k = text.lastIndexOf(" ", j); if (k > i + 60) j = k; }
        out.push({ start: base + i, end: base + j, text: text.slice(i, j) });
        i = j;
      }
    }
    function unitsFromText(text, base, out){
      /* paragraphs (blank lines) then sentences; offsets are relative to base */
      var re = /\n[ \t]*\n/g, last = 0, m;
      var paras = [];
      while ((m = re.exec(text))){ paras.push([last, m.index]); last = m.index + m[0].length; }
      paras.push([last, text.length]);
      paras.forEach(function(p){
        var seg = text.slice(p[0], p[1]);
        SENT.lastIndex = 0;
        var sm;
        while ((sm = SENT.exec(seg))){
          var t = sm[0], lead = t.length - t.replace(/^\s+/, "").length, trail = t.length - t.replace(/\s+$/, "").length;
          var core = t.slice(lead, t.length - trail);
          if (!/[A-Za-z0-9\u00C0-\u024F]/.test(core)) continue;
          splitLong(core.replace(/\s+/g, " "), base + p[0] + sm.index + lead, out);
          if (!t.length) SENT.lastIndex++;
        }
      });
    }
    function buildDocUnits(){
      var doc = $("#doc"), out = [];
      var SEL = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, pre, figcaption, div.plain";
      var blocks = Array.prototype.slice.call(doc.querySelectorAll(SEL)).filter(function(b){ return !b.querySelector(SEL); });
      if (!blocks.length) blocks = [doc];
      var nodes = Anchor.textNodes(), offsetOfNode = new Map(), sum = 0;
      nodes.forEach(function(n){ offsetOfNode.set(n, sum); sum += n.length; });
      blocks.forEach(function(b){
        var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), n, first = null, text = "";
        while ((n = w.nextNode())){ if (!first) first = n; text += n.textContent; }
        if (!first || !text.trim()) return;
        var base = offsetOfNode.get(first);
        if (base === undefined) return;
        unitsFromText(text, base, out);
      });
      return out;
    }

    /* ---- painting + revealing ---- */
    function paint(u){
      if (!hasHL) return;
      CSS.highlights.delete("ll-speak");
      if (!u || state.mode !== "doc") return;
      var r = Anchor.rangeBetween(u.start, u.end);
      if (r) CSS.highlights.set("ll-speak", new Highlight(r));
    }
    function ensureVisible(u){
      if (state.mode !== "doc") return;
      var r = Anchor.rangeAt(u.start); if (!r) return;
      var rect = r.getBoundingClientRect();
      if (state.flow === "pages"){
        var v = $("#docView").getBoundingClientRect();
        if (rect.left < v.left - 2 || rect.left > v.right) revealOffset(u.start);
      } else {
        var head = Library.headerHeight(), bottom = window.innerHeight - (bar.classList.contains("on") ? bar.offsetHeight : 0);
        if (rect.top < head + 4 || rect.bottom > bottom - 10) revealOffset(u.start, { center: true });
      }
    }

    /* ---- speaking ---- */
    function speakCurrent(){
      if (!units.length || idx < 0 || idx >= units.length){ finish(); return; }
      var u = units[idx], myGen = ++gen;
      try { speechSynthesis.cancel(); } catch(_){}
      paint(u); ensureVisible(u);
      if (state.mode === "pdf" && u.page && Library.currentPdfPage() !== u.page) Toc.goPdfPage(u.page);
      utter = new SpeechSynthesisUtterance(u.text);
      utter.rate = rate;
      var v = currentVoice(); if (v){ utter.voice = v; utter.lang = v.lang; }
      utter.onend = function(){ if (myGen !== gen || !playing) return; idx++; if (idx < units.length) speakCurrent(); else finish(); };
      utter.onerror = function(e){
        if (myGen !== gen) return;
        if (e.error === "interrupted" || e.error === "canceled") return;
        Marks.toast("Speech stopped (" + (e.error || "error") + ")");
        pause();
      };
      /* Chrome needs a fresh call after cancel() on some platforms */
      setTimeout(function(){ if (myGen === gen && playing) speechSynthesis.speak(utter); }, 0);
    }
    function play(){
      if (!units.length) return;
      playing = true; playBtn.textContent = "\u275A\u275A"; playBtn.setAttribute("aria-label", "Pause");
      speakCurrent();
    }
    function pause(){
      playing = false; gen++;
      try { speechSynthesis.cancel(); } catch(_){}
      playBtn.textContent = "\u25B6"; playBtn.setAttribute("aria-label", "Play");
    }
    function finish(){ pause(); paint(null); idx = Math.max(0, units.length - 1); }
    function stop(){
      pause(); paint(null); active = false; units = []; idx = -1;
      bar.classList.remove("on");
      document.body.classList.remove("tts-on");
      if (state.flow === "pages") relayoutPaged();
    }
    function startFrom(offset){
      if (!supported){ Marks.toast("Read aloud isn\u2019t available in this browser"); return; }
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      active = true; bar.classList.add("on"); fillVoices();
      document.body.classList.add("tts-on");
      document.documentElement.style.setProperty("--ttsH", bar.offsetHeight + "px");
      if (state.flow === "pages") relayoutPaged();
      if (state.mode === "doc"){
        units = buildDocUnits();
        var off = typeof offset === "number" ? offset : (Library.topCharOffset() || 0);
        idx = 0;
        for (var i = 0; i < units.length; i++){ if (units[i].end > off){ idx = i; break; } }
        if (!units.length){ Marks.toast("Nothing to read"); stop(); return; }
        play();
      } else {
        var page = Library.currentPdfPage();
        loadPdfUnits(page).then(function(){ if (!units.length){ Marks.toast("No text on this page"); stop(); return; } idx = 0; play(); });
      }
    }
    function loadPdfUnits(page){
      var doc = state.pdfDoc;
      units = [];
      var pages = [];
      for (var p = page; p <= doc.numPages; p++) pages.push(p);
      /* load the first page now, the rest while reading */
      return PdfText.get(page).then(function(t){
        unitsFromText(t, 0, units); units.forEach(function(u){ u.page = page; });
        pdfUnitsDoc = doc;
        var next = page + 1;
        (function more(){
          if (next > doc.numPages || state.pdfDoc !== doc || !active) return;
          var pg = next++;
          PdfText.get(pg).then(function(tt){
            if (state.pdfDoc !== doc || !active) return;
            var add = []; unitsFromText(tt, 0, add); add.forEach(function(u){ u.page = pg; });
            units = units.concat(add);
            setTimeout(more, 50);
          });
        })();
      });
    }

    playBtn.addEventListener("click", function(){ if (playing) pause(); else play(); });
    $("#ttsStop").addEventListener("click", stop);
    $("#ttsPrev").addEventListener("click", function(){ if (!units.length) return; idx = Math.max(0, idx - 1); if (playing) speakCurrent(); else { paint(units[idx]); ensureVisible(units[idx]); } });
    $("#ttsNext").addEventListener("click", function(){ if (!units.length) return; idx = Math.min(units.length - 1, idx + 1); if (playing) speakCurrent(); else { paint(units[idx]); ensureVisible(units[idx]); } });
    rateEl.addEventListener("input", function(){
      rate = +rateEl.value; rateV.textContent = rate.toFixed(1) + "\u00D7"; localStorage.setItem("ll_tts_rate", String(rate));
      if (playing) speakCurrent();
    });
    voiceSel.addEventListener("change", function(){ voiceName = voiceSel.value; localStorage.setItem("ll_tts_voice", voiceName); if (playing) speakCurrent(); });
    window.addEventListener("pagehide", function(){ if (supported) try { speechSynthesis.cancel(); } catch(_){} });

    Menu.add({ order: 40, label: function(){ return active ? "Stop reading aloud" : "Read aloud"; }, key: "R", run: function(){ if (active) stop(); else startFrom(); },
               show: function(){ return state.mode === "doc" || state.mode === "pdf"; }, enabled: function(){ return supported; } });
    return { start: startFrom, stop: stop, pause: pause, play: play, isActive: function(){ return active; }, isPlaying: function(){ return playing; },
             units: function(){ return units; }, index: function(){ return idx; }, buildDocUnits: buildDocUnits, supported: supported };
  })();

  /* ============================================================
     Reading progress + time left, from your measured reading speed
     ============================================================ */
  var Progress = (function(){
    var el = $("#progressInfo"), hideTimer = null;
    var wpm = parseFloat(localStorage.getItem("ll_wpm") || "0") || 0;    /* words per minute (text) */
    var ppm = parseFloat(localStorage.getItem("ll_ppm") || "0") || 0;    /* pages per minute (pdf) */
    var PRIOR_WPM = 230, PRIOR_PPM = 0.5, sample = { words: 0, ms: 0, pages: 0, pms: 0 };
    var docWords = 0, docLen = 0, lastFrac = null, lastT = 0, lastTick = 0, docKey = null;
    function countWords(){
      var t = $("#doc").textContent;
      docLen = t.length;
      docWords = (t.match(/\S+/g) || []).length;
    }
    function currentWpm(){
      /* blend a prior with what has been measured; measurements dominate after a few hundred words */
      var measured = sample.ms > 20000 ? sample.words / (sample.ms / 60000) : null;
      var base = wpm || PRIOR_WPM;
      if (measured === null) return base;
      var w = Math.min(1, sample.words / 1500);
      return base * (1 - w) + measured * w;
    }
    function currentPpm(){
      var measured = sample.pms > 20000 ? sample.pages / (sample.pms / 60000) : null;
      var base = ppm || PRIOR_PPM;
      if (measured === null) return base;
      var w = Math.min(1, sample.pages / 15);
      return base * (1 - w) + measured * w;
    }
    function fmt(min){
      if (!isFinite(min) || min < 0) return "";
      if (min < 1) return "under a minute left";
      if (min < 60) return Math.round(min) + " min left";
      var h = Math.floor(min / 60), m = Math.round(min % 60);
      return h + " h" + (m ? " " + m + " min" : "") + " left";
    }
    function show(text){
      el.textContent = text; el.classList.add("on");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function(){ el.classList.remove("on"); }, 2600);
    }
    function tick(){
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      var now = Date.now();
      if (now - lastTick < 250) return;
      lastTick = now;
      var key = (Library.currentId() || "") + ":" + state.mode;
      if (key !== docKey){ docKey = key; lastFrac = null; if (state.mode === "doc") countWords(); }
      var frac = Math.max(0, Math.min(1, readFrac()));
      var text;
      if (state.mode === "doc"){
        if (docLen !== $("#doc").textContent.length) countWords();
        if (lastFrac !== null){
          var dt = now - lastT, dw = (frac - lastFrac) * docWords;
          /* count only steady forward reading: small steps, no long pauses */
          if (dt > 0 && dt < 45000 && dw > 0 && dw < 400 && document.visibilityState === "visible"){ sample.words += dw; sample.ms += dt; }
        }
        var left = (1 - frac) * docWords / currentWpm();
        text = Math.round(frac * 100) + "%" + (docWords > 80 ? " \u00B7 " + fmt(left) : "");
      } else {
        var pages = state.pdfDoc ? state.pdfDoc.numPages : 1, page = Library.currentPdfPage();
        if (lastFrac !== null){
          var dt2 = now - lastT, dp = (frac - lastFrac) * (pages - 1);
          if (dt2 > 0 && dt2 < 120000 && dp > 0 && dp < 3 && document.visibilityState === "visible"){ sample.pages += dp; sample.pms += dt2; }
        }
        var leftP = (pages - page) / currentPpm();
        text = "p. " + page + " / " + pages + (pages > 3 ? " \u00B7 " + fmt(leftP) : "");
      }
      lastFrac = frac; lastT = now;
      show(text);
      maybeStore();
    }
    var storeTimer = null;
    function maybeStore(){
      clearTimeout(storeTimer);
      storeTimer = setTimeout(function(){
        if (sample.ms > 60000 && sample.words > 300){ wpm = currentWpm(); localStorage.setItem("ll_wpm", wpm.toFixed(0)); }
        if (sample.pms > 60000 && sample.pages > 3){ ppm = currentPpm(); localStorage.setItem("ll_ppm", ppm.toFixed(2)); }
      }, 1500);
    }
    return { tick: tick, wpm: currentWpm, ppm: currentPpm, sample: function(){ return sample; }, docWords: function(){ return docWords; } };
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
    function toggle(){ set(!on); if (on) Marks.toast(coarse ? "Drag the handle to move the ruler" : "The ruler follows your mouse"); }
    document.addEventListener("mousemove", function(e){ if (on && !coarse){ y = e.clientY; place(); } });
    var dragging = false;
    grip.addEventListener("touchstart", function(){ dragging = true; }, { passive: true });
    grip.addEventListener("touchmove", function(e){ if (dragging && e.touches.length){ y = e.touches[0].clientY; place(); } }, { passive: true });
    grip.addEventListener("touchend", function(){ dragging = false; });
    grip.addEventListener("mousedown", function(e){ dragging = true; e.preventDefault(); });
    document.addEventListener("mouseup", function(){ dragging = false; });
    window.addEventListener("resize", place);
    Menu.add({ order: 50, label: function(){ return on ? "Hide reading ruler" : "Reading ruler"; }, key: "L", run: toggle, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { toggle: toggle, set: set, isOn: function(){ return on; }, place: place };
  })();

  /* ============================================================
     Auto-scroll (scroll flow) / timed page turns (pages flow)
     ============================================================ */
  var Auto = (function(){
    var bar = $("#autoBar"), speedEl = $("#autoSpeed"), playBtn = $("#autoPlay");
    var on = false, paused = false, mult = parseFloat(localStorage.getItem("ll_autoscroll") || "1") || 1, raf = null, lastT = 0, acc = 0, pageTimer = null;
    function pxPerSec(){
      /* base speed from the measured reading rate: words per second × height per word */
      var lineH = state.size * state.lh;
      var colW = Math.min(state.width, $("#docView").clientWidth || state.width);
      var wordsPerLine = Math.max(4, colW / (state.size * 0.5) / 6);   /* ~6 characters per word incl. the space */
      return (Progress.wpm() / 60) / wordsPerLine * lineH * mult;
    }
    function label(){ speedEl.textContent = mult.toFixed(1) + "\u00D7"; }
    function step(t){
      if (!on || paused) return;
      if (lastT){ acc += pxPerSec() * (t - lastT) / 1000; }
      lastT = t;
      if (acc >= 1){
        var d = Math.floor(acc); acc -= d;
        var h = document.documentElement, before = h.scrollTop;
        window.scrollBy(0, d);
        if (h.scrollTop === before && before + h.clientHeight >= h.scrollHeight - 2){ stop(); Marks.toast("End of document"); return; }
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
        if (atEnd){ stop(); Marks.toast("End of document"); return; }
        turn(1); schedulePage();
      }, secs * 1000 / mult);
    }
    function run(){
      cancelAnimationFrame(raf); lastT = 0; acc = 0;
      if (state.flow === "pages") schedulePage(); else raf = requestAnimationFrame(step);
    }
    function start(){
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      on = true; paused = false; bar.classList.add("on"); label(); playBtn.textContent = "\u275A\u275A"; playBtn.setAttribute("aria-label", "Pause");
      run();
    }
    function stop(){ on = false; paused = false; cancelAnimationFrame(raf); clearTimeout(pageTimer); bar.classList.remove("on"); }
    function pause(){ paused = true; cancelAnimationFrame(raf); clearTimeout(pageTimer); playBtn.textContent = "\u25B6"; playBtn.setAttribute("aria-label", "Resume"); }
    function resume(){ paused = false; playBtn.textContent = "\u275A\u275A"; playBtn.setAttribute("aria-label", "Pause"); run(); }
    playBtn.addEventListener("click", function(){ if (paused) resume(); else pause(); });
    $("#autoStop").addEventListener("click", stop);
    $("#autoSlower").addEventListener("click", function(){ mult = Math.max(0.3, +(mult - 0.1).toFixed(1)); label(); localStorage.setItem("ll_autoscroll", String(mult)); if (on && !paused) run(); });
    $("#autoFaster").addEventListener("click", function(){ mult = Math.min(4, +(mult + 0.1).toFixed(1)); label(); localStorage.setItem("ll_autoscroll", String(mult)); if (on && !paused) run(); });
    /* a wheel or touch pauses so the reader can take over */
    window.addEventListener("wheel", function(){ if (on && !paused) pause(); }, { passive: true });
    document.addEventListener("touchstart", function(e){ if (on && !paused && !e.target.closest("#autoBar")) pause(); }, { passive: true });
    document.addEventListener("visibilitychange", function(){ if (on && document.visibilityState === "hidden") pause(); });
    Menu.add({ order: 51, label: function(){ return on ? "Stop auto-scroll" : "Auto-scroll"; }, key: "A", run: function(){ if (on) stop(); else start(); }, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });
    return { start: start, stop: stop, pause: pause, resume: resume, isOn: function(){ return on; }, isPaused: function(){ return paused; }, pxPerSec: pxPerSec, mult: function(){ return mult; } };
  })();

  Menu.add({ order: 90, sep: true });
  Menu.add({ order: 91, label: "Library", run: function(){ Library.home(); }, show: function(){ return state.mode === "doc" || state.mode === "pdf"; } });

  /* ============================================================
     Tabs — several open documents; switching re-renders from the library copy
     and resumes at the saved position
     ============================================================ */
  var Tabs = (function(){
    var KEY = "ll_tabs", tabs = [], activeId = null, strip = $("#tabs");
    try { tabs = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(tabs)) tabs = []; } catch(_){ tabs = []; }
    tabs = tabs.filter(function(t){ return t && t.id && t.name; }).map(function(t){ return { id: t.id, name: t.name, file: null }; });
    function save(){ try { localStorage.setItem(KEY, JSON.stringify(tabs.map(function(t){ return { id: t.id, name: t.name }; }))); } catch(_){} }
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function render(){
      strip.classList.toggle("on", tabs.length >= 2);
      strip.innerHTML = tabs.map(function(t){
        return '<div class="tab' + (t.id === activeId ? ' on' : '') + '" role="tab" tabindex="0" aria-selected="' + (t.id === activeId) + '" data-id="' + esc(t.id) + '" title="' + esc(t.name) + '">' +
          '<span class="tab-name">' + esc(t.name) + '</span><button class="tab-x" data-x="' + esc(t.id) + '" aria-label="Close ' + esc(t.name) + '">\u00D7</button></div>';
      }).join("");
      var on = strip.querySelector(".tab.on"); if (on) on.scrollIntoView({ inline: "nearest", block: "nearest" });
      if (state.flow === "pages" && (state.mode === "doc" || state.mode === "pdf")) relayoutPaged();
    }
    function noteOpen(id, name, file){
      var t = tabs.filter(function(x){ return x.id === id; })[0];
      if (!t){ t = { id: id, name: name, file: file }; tabs.push(t); }
      else { t.file = file || t.file; if (name) t.name = name; }
      activeId = id; save(); render();
    }
    function setName(id, name){ var t = tabs.filter(function(x){ return x.id === id; })[0]; if (t && name){ t.name = name; save(); render(); } }
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
      var wasActive = tabs[i].id === activeId;
      tabs.splice(i, 1); save();
      if (wasActive){
        if (tabs.length){ activate(tabs[Math.min(i, tabs.length - 1)].id); }
        else { activeId = null; Library.home(); }
      }
      render();
    }
    function drop(id){ var i = tabs.findIndex(function(x){ return x.id === id; }); if (i >= 0){ tabs.splice(i, 1); save(); render(); } }
    /* add files without opening them (multi-select / multi-drop) */
    function addFiles(files){
      Array.prototype.forEach.call(files, function(f){
        Library.idFor(f).then(function(id){
          if (!tabs.some(function(x){ return x.id === id; })){ tabs.push({ id: id, name: f.name, file: f }); save(); render(); }
          /* make sure it is in the library too */
          Library.remember(f, id);
        });
      });
    }
    strip.addEventListener("click", function(e){
      var x = e.target.closest(".tab-x"); if (x){ e.stopPropagation(); close(x.dataset.x); return; }
      var t = e.target.closest(".tab"); if (t) activate(t.dataset.id);
    });
    strip.addEventListener("keydown", function(e){
      var t = e.target.closest(".tab"); if (!t) return;
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); activate(t.dataset.id); }
      if (e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); close(t.dataset.id); }
    });
    document.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab" && tabs.length > 1){
        e.preventDefault();
        var i = tabs.findIndex(function(x){ return x.id === activeId; });
        var n = (i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
        activate(tabs[n].id);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W") && activeId && (state.mode === "doc" || state.mode === "pdf")){
        e.preventDefault(); close(activeId);
      }
    });
    render();
    return { noteOpen: noteOpen, activate: activate, close: close, drop: drop, addFiles: addFiles, setName: setName, list: function(){ return tabs; }, active: function(){ return activeId; }, render: render };
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
  $("#fileInput").addEventListener("change", function(e){
    openFiles(e.target.files);
    e.target.value = "";
  });

  document.addEventListener("dragover", function(e){
    e.preventDefault();
    $("#empty").classList.add("drag");
  });
  document.addEventListener("dragleave", function(){ $("#empty").classList.remove("drag"); });
  document.addEventListener("drop", function(e){
    e.preventDefault();
    $("#empty").classList.remove("drag");
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
            openFile(new File([txt], (params.get("title") || "Shared text") + ".txt", { type: "text/plain" }));
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
  $("#lamp").addEventListener("click", function(){
    var idx = CYCLE.indexOf(state.theme);
    state.theme = CYCLE[(idx + 1) % CYCLE.length];
    applyTheme(); AutoTheme.userPicked(state.theme);
  });
  $("#gear").addEventListener("click", function(){
    document.body.classList.remove("hidebar");
    var open = $("#sheet").classList.toggle("open");
    $("#gear").setAttribute("aria-expanded", open ? "true" : "false");
    $("#sheet").setAttribute("aria-hidden", open ? "false" : "true");
  });

  $("#themeChips").addEventListener("click", function(e){
    var ch = e.target.closest(".chip");
    if (!ch) return;
    state.theme = ch.dataset.theme;
    if (state.theme === "custom") syncCustomUI();
    applyTheme(); AutoTheme.userPicked(state.theme);
  });

  /* custom theme controls */
  $("#bgSwatches").addEventListener("click", function(e){
    var s = e.target.closest(".sw");
    if (!s) return;
    state.custom.bg = s.dataset.c;
    state.theme = "custom";
    syncCustomUI(); applyTheme();
  });
  function bgFromSliders(){
    var h = +$("#cHue").value, l = +$("#cLit").value;
    var s = l > 55 ? 14 : 22;
    state.custom.bg = hslToHex(h, s, l);
    state.theme = "custom";
    $("#vHue").textContent = h + "°";
    $("#vLit").textContent = l + " %";
    document.querySelectorAll("#bgSwatches .sw").forEach(function(x){ x.classList.remove("on"); });
    applyTheme();
  }
  $("#cHue").addEventListener("input", bgFromSliders);
  $("#cLit").addEventListener("input", bgFromSliders);
  $("#autoInk").addEventListener("change", function(e){
    state.custom.autoInk = e.target.checked;
    if (!e.target.checked) state.custom.ink = $("#cInk").value;
    state.theme = "custom";
    syncCustomUI(); applyTheme();
  });
  $("#cInk").addEventListener("input", function(e){
    state.custom.ink = e.target.value;
    state.custom.autoInk = false;
    state.theme = "custom";
    applyTheme();
  });
  $("#accSwatches").addEventListener("click", function(e){
    var s = e.target.closest(".sw");
    if (!s) return;
    state.custom.accent = s.dataset.c;
    state.theme = "custom";
    syncCustomUI(); applyTheme();
  });
  $("#cAcc").addEventListener("input", function(e){
    state.custom.accent = e.target.value;
    state.theme = "custom";
    syncCustomUI(); applyTheme();
  });

  $("#flowChips").addEventListener("click", function(e){
    var ch = e.target.closest(".chip");
    if (ch) setFlow(ch.dataset.flow);
  });
  document.querySelectorAll("#fontChips .chip").forEach(function(ch){
    ch.addEventListener("click", function(){
      state.font = ch.dataset.font;
      applyType();
    });
  });
  $("#rSize").addEventListener("input", function(e){ state.size = +e.target.value; applyType(); });
  $("#rLh").addEventListener("input",  function(e){ state.lh   = +e.target.value; applyType(); });
  $("#rW").addEventListener("input",   function(e){ state.width= +e.target.value; applyType(); });
  $("#rM").addEventListener("input",   function(e){ state.margin = +e.target.value; applyType(); });
  $("#cJustify").addEventListener("change", function(e){ state.justify = e.target.checked; applyType(); });
  $("#cHyphens").addEventListener("change", function(e){ state.hyphens = e.target.checked; applyType(); });
  $("#cSpread").addEventListener("change", function(e){ state.spread = e.target.checked; Prefs.save(); relayoutPaged(); });

  $("#rZoom").addEventListener("input", function(e){
    state.zoom = (+e.target.value) / 100;
    $("#vZoom").textContent = e.target.value + " %";
    queueRerender();
  });
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

  function tapNav(e){
    if (!pagedActive()) return;
    if (e.target.closest("a")) return;
    var sel = window.getSelection();
    if (sel && sel.toString()) return;
    var r = e.currentTarget.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    if (x < 0.35) turn(-1);
    else if (x > 0.65) turn(1);
    else {
      document.body.classList.toggle("immersive");
      $("#sheet").classList.remove("open");
      relayoutPaged();
    }
  }
  $("#docView").addEventListener("click", tapNav);
  $("#pdf").addEventListener("click", tapNav);

  var touchX = null, touchY = null;
  document.addEventListener("touchstart", function(e){
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, {passive:true});
  document.addEventListener("touchend", function(e){
    if (touchX === null || !pagedActive()) { touchX = null; return; }
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) turn(dx < 0 ? 1 : -1);
  }, {passive:true});

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ $("#sheet").classList.remove("open"); $("#gear").setAttribute("aria-expanded", "false"); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (!pagedActive()) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " "){ e.preventDefault(); turn(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); turn(-1); }
    else if (e.key === "Home"){ e.preventDefault(); if (state.mode === "doc") gotoPage(0); else { state.pdfPageNum = 1; renderPdfSingle(); } }
    else if (e.key === "End"){ e.preventDefault(); if (state.mode === "doc") gotoPage(state.totalPages - 1); else { state.pdfPageNum = state.pdfDoc.numPages; renderPdfSingle(); } }
  });

  /* ---------- keyboard shortcuts (single keys, when nothing is being typed) ---------- */
  var Keys = (function(){
    var list = [];
    function add(key, label, run, when){ list.push({ key: key, label: label, run: run, when: when }); }
    function typing(e){ return /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable; }
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    add("o", "Open a file", function(){ $("#fileInput").click(); });
    add("s", "Reading settings", function(){ $("#gear").click(); });
    add("t", "Next theme", function(){ $("#lamp").click(); });
    add("+", "Larger text / zoom in", function(){ bump(1); }, docOpen);
    add("-", "Smaller text / zoom out", function(){ bump(-1); }, docOpen);
    add("p", "Switch scroll / pages", function(){ setFlow(state.flow === "pages" ? "scroll" : "pages"); }, docOpen);
    add("/", "Search in the document", function(){ Search.openPanel(); }, docOpen);
    add("c", "Contents", function(){ Toc.openPanel(); }, docOpen);
    add("b", "Bookmark here", function(){ Marks.addBookmark(); }, docOpen);
    add("n", "Bookmarks & notes", function(){ Marks.openPanel(); }, docOpen);
    add("r", "Read aloud (start / stop)", function(){ if (Speak.isActive()) Speak.stop(); else Speak.start(); }, docOpen);
    add("l", "Reading ruler", function(){ Ruler.toggle(); }, docOpen);
    add("a", "Auto-scroll (start / stop)", function(){ if (Auto.isOn()) Auto.stop(); else Auto.start(); }, docOpen);
    add("h", "Library / home", function(){ Library.home(); }, docOpen);
    add("?", "Keyboard shortcuts", function(){ openHelp(); });
    var extra = [
      ["\u2190 \u2192, PgUp/PgDn, Space", "Turn pages (Pages flow)"], ["Home / End", "First / last page (Pages flow)"],
      ["Ctrl/\u2318+F", "Search"], ["Ctrl/\u2318+Tab", "Next tab"], ["Ctrl/\u2318+W", "Close tab"], ["Enter / Shift+Enter", "Next / previous match (in search)"],
      ["Esc", "Close panels and cards"], ["Right-click a sentence", "Explain it (desktop)"], ["Hold a sentence", "Explain it (touch)"]
    ];
    function openHelp(){
      Side.open("keys", "Keyboard shortcuts", function(body){
        var h = '<div class="keys">';
        list.forEach(function(k){ h += '<div class="key-row"><kbd>' + k.key.replace("<", "&lt;") + '</kbd><span>' + k.label + '</span></div>'; });
        extra.forEach(function(x){ h += '<div class="key-row"><kbd>' + x[0] + '</kbd><span>' + x[1] + '</span></div>'; });
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
    Menu.add({ order: 80, label: "Keyboard shortcuts", key: "?", run: openHelp, show: function(){ return window.matchMedia ? !window.matchMedia("(pointer: coarse)").matches : true; } });
    return { openHelp: openHelp, list: function(){ return list; } };
  })();

  var rz = null;
  window.addEventListener("resize", function(){
    clearTimeout(rz);
    rz = setTimeout(function(){
      if (state.mode === "doc" && state.flow === "pages"){ layoutDocPages(); gotoPage(state.page); }
      else if (state.mode === "pdf" && state.pdfDoc){ renderPdf(); }
    }, 350);
  });

  /* scroll: progress bar + auto-hiding top bar.
     Down past a bit -> bar hides. Up a decent amount (or near the top) -> bar returns. */
  var lastY = 0, upAcc = 0;
  window.addEventListener("scroll", function(){
    if (document.body.classList.contains("paged")) return;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    $("#progress").style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    Progress.tick();

    if (state.mode !== "doc" && state.mode !== "pdf") return;
    Library.notePosition();
    var y = h.scrollTop;
    var dy = y - lastY;
    lastY = y;
    if ($("#sheet").classList.contains("open") || y < 90){
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
    var ICON_BOOK = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2H2z"/><path d="M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2H22z"/></svg>';
    var ICON_STAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.1 5.6L20 10.5l-5.9 1.9L12 18l-2.1-5.6L4 10.5l5.9-1.9z"/></svg>';
    var LS_MODE = "ll_dictmode";   // "tap" | "hold" | "off"
    var LS_KEY  = "ll_apikey";
    var AI_MODEL = "claude-sonnet-5";
    var dictMode = localStorage.getItem(LS_MODE) || "tap";

    /* ---------- styles ---------- */
    var css = document.createElement("style");
    css.textContent = [
      /* on touch screens the app's own tap / hold gestures replace native selection */
      "@media (pointer: coarse){",
      "  #doc.nosel, #doc.nosel *{",
      "    -webkit-user-select:none; user-select:none; -webkit-touch-callout:none;",
      "  }",
      "}",
      ".ll-hit{background:var(--accent); color:var(--bg); border-radius:3px;}",
      "#dictScrim{",
      "  position:fixed; inset:0; z-index:59; background:transparent; display:none;",
      "}",
      "#dictScrim.on{display:block;}",
      "#dictCard{",
      "  position:fixed; left:0; right:0; bottom:0; z-index:60;",
      "  background:var(--panel); color:var(--ink);",
      "  border-top:1px solid var(--line);",
      "  border-radius:16px 16px 0 0;",
      "  box-shadow:0 -10px 40px rgba(0,0,0,.28);",
      "  transform:translateY(110%); visibility:hidden;",
      "  transition:transform .24s ease, visibility 0s linear .24s;",
      "  max-height:62vh; overflow-y:auto; overscroll-behavior:contain;",
      "  padding:0 0 max(16px, env(safe-area-inset-bottom));",
      "  font-family:var(--ui-font);",
      "}",
      "#dictCard.open{transform:none; visibility:visible; transition:transform .24s ease, visibility 0s;}",
      "#dictCard .grab{",
      "  width:40px; height:4px; border-radius:999px; background:var(--line);",
      "  margin:9px auto 4px;",
      "}",
      "#dictCard .inner{max-width:1100px; margin:0 auto; padding:6px 18px 4px;}",
      "#dictCard .head{display:flex; align-items:flex-start; gap:12px;}",
      "#dictCard .mark{",
      "  flex:none; width:38px; height:38px; border-radius:50%;",
      "  display:flex; align-items:center; justify-content:center;",
      "  background:color-mix(in srgb, var(--accent) 22%, transparent);",
      "  color:var(--accent); font-size:1.188rem; margin-top:2px;",
      "}",
      "#dictCard .hw{flex:1; min-width:0;}",
      "#dictCard .term{",
      "  font-family:var(--reader-font); font-size:1.25rem; line-height:1.25;",
      "  word-break:break-word;",
      "}",
      "#dictCard .ipa{color:var(--muted); font-size:0.9375rem; font-weight:400;}",
      "#dictCard .x{",
      "  flex:none; border:0; background:transparent; color:var(--muted);",
      "  font-size:1.375rem; line-height:1; padding:4px 2px 4px 8px; cursor:pointer;",
      "}",
      "#dictCard .senses{margin:10px 0 2px; display:grid; gap:9px;}",
      "#dictCard .sense{font-size:0.9375rem; line-height:1.5;}",
      "#dictCard .pos{",
      "  color:var(--accent); font-style:italic; margin-right:7px;",
      "}",
      "#dictCard .syn{",
      "  display:block; margin-top:3px; font-size:0.7812rem; color:var(--muted);",
      "}",
      "#dictCard .quote{",
      "  font-family:var(--reader-font); font-size:0.9688rem; line-height:1.55;",
      "  padding:10px 12px; margin:4px 0 12px;",
      "  border-left:3px solid var(--accent);",
      "  background:color-mix(in srgb, var(--accent) 8%, transparent);",
      "  border-radius:0 8px 8px 0;",
      "}",
      "#dictCard .note{color:var(--muted); font-size:0.7812rem; padding:2px 0 6px;}",
      "#dictCard .sec{",
      "  font-size:0.6875rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;",
      "  color:var(--muted); margin:14px 0 6px;",
      "}",
      "#dictCard .sec:first-child{margin-top:4px;}",
      "#dictCard .brk{display:grid; gap:7px; margin-top:2px;}",
      "#dictCard .brk div{font-size:0.875rem; line-height:1.45;}",
      "#dictCard .brk b{font-weight:600;}",
      "#dictCard .brk i{color:var(--muted); font-style:italic;}",
      "#dictCard .clause{",
      "  padding:9px 11px; margin:0 0 8px; border:1px solid var(--line); border-radius:10px;",
      "}",
      "#dictCard .clause .ctext{font-family:var(--reader-font); font-size:0.9375rem; line-height:1.45;}",
      "#dictCard .clause .ckind{",
      "  display:inline-block; font-size:0.6875rem; color:var(--accent); font-weight:600;",
      "  letter-spacing:.04em; margin:0 0 4px;",
      "}",
      "#dictCard .roles{display:flex; flex-wrap:wrap; gap:5px 6px; margin-top:7px;}",
      "#dictCard .role{",
      "  font-size:0.7812rem; line-height:1.35; padding:4px 8px; border-radius:8px;",
      "  background:color-mix(in srgb, var(--ink) 6%, transparent);",
      "}",
      "#dictCard .role b{",
      "  display:block; font-size:0.625rem; font-weight:700; letter-spacing:.08em;",
      "  text-transform:uppercase; color:var(--muted); margin-bottom:1px;",
      "}",
      "#dictCard .tense{font-size:0.7812rem; color:var(--muted); margin-top:7px; line-height:1.4;}",
      "#dictCard .tense b{color:var(--ink); font-weight:600;}",
      "#dictCard .plain{",
      "  font-family:var(--reader-font); font-size:0.9688rem; line-height:1.55;",
      "  padding:8px 0 2px;",
      "}",
      "#dictCard .ai{font-size:0.9375rem; line-height:1.55; white-space:pre-wrap; padding:2px 0 4px;}",
      "#dictCard .acts{display:flex; gap:8px; flex-wrap:wrap; margin:8px 0 2px;}",
      "#dictCard .act{",
      "  padding:7px 13px; border-radius:999px; border:1px solid var(--line);",
      "  background:transparent; color:var(--ink); font-size:0.8125rem; cursor:pointer;",
      "}",
      "#dictCard .act.go{background:var(--accent); border-color:var(--accent); color:var(--panel);}",
      "#dictPill{",
      "  position:fixed; z-index:58; display:none; gap:2px; padding:3px; border-radius:999px;",
      "  border:1px solid var(--accent); background:var(--accent); color:var(--panel);",
      "  font-family:var(--ui-font); font-size:0.8125rem; font-weight:600;",
      "  box-shadow:0 4px 16px rgba(0,0,0,.25);",
      "}",
      "#dictPill.on{display:flex;}",
      "#dictPill button{border:0; background:transparent; color:inherit; font:inherit; padding:5px 11px; border-radius:999px; cursor:pointer;}",
      "#dictPill button:hover{background:rgba(0,0,0,.16);}",
      "@media (min-width:820px){",
      "  #dictCard{left:auto; right:22px; bottom:22px; width:440px;",
      "    border-radius:16px; border:1px solid var(--line); max-height:70vh;}",
      "}"
    ].join("\n");
    document.head.appendChild(css);

    /* ---------- card markup ---------- */
    var scrim = document.createElement("div"); scrim.id = "dictScrim";
    var card  = document.createElement("div"); card.id  = "dictCard";
    card.innerHTML = '<div class="grab"></div><div class="inner"></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(card);
    var inner = card.querySelector(".inner");
    var pill = document.createElement("div"); pill.id = "dictPill";
    pill.innerHTML = '<button type="button" data-act="lookup">Explain</button><button type="button" data-act="mark">Highlight</button>';
    document.body.appendChild(pill);

    var openedAt = 0, cardOpener = null;
    card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false"); card.setAttribute("aria-label", "Dictionary"); card.tabIndex = -1;
    function openCard(){
      openedAt = Date.now(); scrim.classList.add("on"); card.classList.add("open"); hidePill();
      if (!cardOpener) cardOpener = document.activeElement;
      setTimeout(function(){ if (card.classList.contains("open")) card.focus({ preventScroll: true }); }, 60);
    }
    function closeCard(){
      var wasOpen = card.classList.contains("open");
      scrim.classList.remove("on"); card.classList.remove("open");
      clearHit();
      if (wasOpen && cardOpener && cardOpener.focus && document.contains(cardOpener) && cardOpener !== document.body) cardOpener.focus({ preventScroll: true });
      cardOpener = null;
    }
    /* the click that some browsers synthesise when a long-press finger lifts must not close the card */
    scrim.addEventListener("click", function(){ if (Date.now() - openedAt > 400) closeCard(); });
    card.querySelector(".grab").addEventListener("click", closeCard);
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape") closeCard();
    });

    /* ---------- highlight the tapped word ---------- */
    var hitEl = null;
    function clearHit(){
      if (!hitEl) return;
      var p = hitEl.parentNode;
      if (p){ p.replaceChild(document.createTextNode(hitEl.textContent), hitEl); p.normalize(); }
      hitEl = null;
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
        .catch(function(){ return {}; })
        .then(function(part){ DB[i] = part; return part; });
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

    function renderWord(term, res){
      var h = '<div class="head">' +
              '<div class="mark">' + ICON_BOOK + '</div><div class="hw">';
      if (res){
        h += '<div class="term">' + esc(res.word);
        if (res.entry.i) h += ' <span class="ipa">' + esc(res.entry.i) + '</span>';
        h += '</div></div>' +
             '<button class="x" aria-label="Close">×</button></div>';
        h += '<div class="senses">';
        res.entry.m.slice(0,6).forEach(function(m){
          h += '<div class="sense">';
          if (m.p) h += '<span class="pos">' + esc(m.p) + '</span> ';
          h += esc(m.d);
          if (m.s && m.s.length) h += '<span class="syn">also: ' + esc(m.s.join(", ")) + '</span>';
          h += '</div>';
        });
        h += '</div>';
        if (res.online) h += '<div class="note">Looked up online — not in the offline dictionary.</div>';
      } else {
        h += '<div class="term">' + esc(term) + '</div></div>' +
             '<button class="x" aria-label="Close">×</button></div>' +
             '<div class="note">No definition found' +
             (navigator.onLine ? '' : ' — you’re offline, so only the built-in dictionary was searched') +
             '.</div>';
      }
      inner.innerHTML = h;
      inner.querySelector(".x").addEventListener("click", closeCard);
    }

    function defineWord(term){
      inner.innerHTML = '<div class="note">Looking up “' + esc(term) + '”…' +
        (dictReady() ? '' : '<br>Getting the dictionary ready — this only happens once.') + '</div>';
      openCard();
      lookupLocal(term).then(function(res){
        if (res){ renderWord(term, res); return; }
        if (!navigator.onLine){ renderWord(term, null); return; }
        var lw = term.toLowerCase();
        var base = IRREG[lw] || lw;
        return lookupOnline(base).then(function(r2){
          if (r2) { renderWord(term, r2); return; }
          if (base === lw) { renderWord(term, null); return; }
          return lookupOnline(lw).then(function(r3){ renderWord(term, r3); });
        });
      });
    }

    /* ---------- sentence explaining (offline, rule-based — see llExplain) ---------- */
    var currentSentence = null, currentSpan = null;

    function kindLabel(c){
      var first = "";
      if (c.kind === "sub") return (c.label || "clause") + (c.sub ? " — “" + c.sub.toLowerCase() + "”" : "");
      if (c.kind === "rel") return c.label ? "describes “" + c.label + "”" : "describing clause";
      if (c.kind === "wh") return "“" + c.label + "” clause — the thing that…";
      if (c.conj) return "joined with “" + c.conj + "” (" + c.label + ")";
      first = c.question ? "question" : c.imperative ? "instruction" : "main clause";
      if (c.participial || (c.tense && /participle/.test(c.tense.name))) first = "added detail";
      return first;
    }
    function role(label, val){
      return '<span class="role"><b>' + esc(label) + '</b>' + esc(val) + '</span>';
    }
    function renderExplain(r){
      var h = '<div class="sec">Explain</div>';
      if (!r.clauses.length){
        h += '<div class="note">Nothing to break down here.</div>';
        return h;
      }
      if (r.clauses.length > 1) h += '<div class="note">' + r.clauses.length + ' parts</div>';
      r.clauses.forEach(function(c){
        h += '<div class="clause"><span class="ckind">' + esc(kindLabel(c)) + '</span>' +
             '<div class="ctext">' + esc(c.text) + '</div>';
        var roles = "";
        if (c.subject){
          var sl = c.passive ? "who / what (receives the action)" : c.existential ? "what there is" : "who / what";
          var sv = c.subject + (c.inherited ? " (same as before)" : c.inheritedNext ? " (same as the next part)" : c.relHead ? " (= " + c.relHead + ")" : "");
          roles += role(sl, sv);
        }
        if (c.verb) roles += role(c.passive ? "what happens to it" : "did what", c.verb + (c.negative ? " (negative)" : ""));
        if (c.indirect) roles += role("to whom", c.indirect);
        if (c.object) roles += role("what / whom", c.object);
        if (c.complement) roles += role("is what", c.complement);
        if (c.agent) roles += role("done by", c.agent);
        c.extras.forEach(function(x){ roles += role(x.label, x.text); });
        if (roles) h += '<div class="roles">' + roles + '</div>';
        if (c.tense) h += '<div class="tense">Tense: <b>' + esc(c.tense.name) + '</b> — ' + esc(c.tense.note) + '</div>';
        h += '</div>';
      });
      if (r.expressions.length){
        h += '<div class="sec">Expressions</div><div class="brk">';
        r.expressions.forEach(function(e){
          var senses = e.entry.m.slice(0, 3).map(function(m){
            var d = window.llExplain.cleanDef(m.d, m.p) || m.d;
            return esc(d) + (m.s && m.s.length ? ' <i>(' + esc(m.s.slice(0, 3).join(", ")) + ')</i>' : '');
          });
          h += '<div><b>' + esc(e.phrase) + '</b> <i>' + esc(e.kind) + '</i> — ' + senses.join(' · ') + '</div>';
        });
        h += '</div>';
      }
      if (r.plain && r.plain.replace(/\W/g, "").toLowerCase() !== currentSentence.replace(/\W/g, "").toLowerCase()){
        h += '<div class="sec">In plainer words</div><div class="plain">' + esc(r.plain) + '</div>';
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
      var h = '<div class="sec">Key words</div><div class="brk">';
      list.forEach(function(x){
        h += '<div><b>' + esc(x.w) + '</b>' + (x.m.p ? ' <i>' + esc(x.m.p) + '</i>' : '') + ' — ' + esc(x.m.d) + '</div>';
      });
      return h + '</div>';
    }

    function explainSentence(sentence, span){
      sentence = String(sentence || "").replace(/\s+/g, " ").trim();
      if (!sentence) return;
      currentSentence = sentence;
      currentSpan = (span && typeof span.start === "number" && typeof span.end === "number" && span.end > span.start) ? span : null;
      var h = '<div class="head"><div class="mark">' + ICON_STAR + '</div><div class="hw">' +
              '<div class="term">' + (/\s/.test(sentence) ? 'This sentence' : 'This word') + '</div></div>' +
              '<button class="x" aria-label="Close">×</button></div>' +
              '<div class="quote">' + esc(sentence) + '</div>' +
              (currentSpan ? '<div class="acts" id="dictMarkActs"><button class="act" data-m="hl">Highlight</button><button class="act" data-m="note">Note…</button><button class="act" data-m="read">Read from here</button></div>' : '') +
              '<div id="dictAi"></div>' +
              '<div id="dictExpl"><div class="note">Reading it…' +
              (dictReady() ? '' : '<br>Getting the dictionary ready — this only happens once.') + '</div></div>';
      inner.innerHTML = h;
      inner.querySelector(".x").addEventListener("click", closeCard);
      var ma = inner.querySelector("#dictMarkActs");
      if (ma) ma.addEventListener("click", function(e){
        var b = e.target.closest("button"); if (!b || !window.__ll || !window.__ll.Marks) return;
        if (b.dataset.m === "read"){ closeCard(); window.__ll.Speak.start(currentSpan.start); return; }
        var m = window.__ll.Marks.addHighlight(currentSpan.start, currentSpan.end);
        closeCard();
        if (m && b.dataset.m === "note") window.__ll.Marks.openPanel(m.key);
        else if (m) window.__ll.Marks.toast("Highlighted");
      });
      openCard();
      renderAiButton(sentence);

      var box = inner.querySelector("#dictExpl");
      /* chunks for every word in the sentence (plus irregular base forms, which can start with another letter) */
      var words = (sentence.toLowerCase().match(/[a-z\u00C0-\u024F'\u2019-]+/g) || []).map(function(w){ return w.replace(/[\u2019]/g, "'"); });
      var extra = [];
      words.forEach(function(w){ if (IRREG[w]) extra.push(IRREG[w]); variants(w).forEach(function(v){ extra.push(v); }); });
      Promise.all([withWords(words.concat(extra)), window.__ll.need(["explain"])]).then(function(){
        if (currentSentence !== sentence) return;
        var r = window.llExplain.explain(sentence, find, window.llExplain.rank);
        box.innerHTML = renderExplain(r) + renderKeywords(r) +
          (navigator.onLine ? '' : '<div class="note">Offline — explained with the built-in dictionary only.</div>');
      }).catch(function(err){
        console.error(err);
        box.innerHTML = '<div class="note">Couldn’t analyse this sentence.</div>';
      });
    }

    /* ---------- optional: explain with AI (online + your own key) ---------- */
    function renderAiButton(sentence){
      var aiBox = inner.querySelector("#dictAi");
      if (!aiBox) return;
      if (!navigator.onLine){ aiBox.innerHTML = ""; return; }
      aiBox.innerHTML = '<div class="acts"><button class="act go" id="dictAiBtn">Explain with AI</button></div>';
      aiBox.querySelector("#dictAiBtn").addEventListener("click", function(){
        var key = localStorage.getItem(LS_KEY) || "";
        if (!key){ if (!askForKey(true)) return; key = localStorage.getItem(LS_KEY) || ""; if (!key) return; }
        explainWithAI(sentence, key, aiBox);
      });
    }
    function explainWithAI(sentence, apiKey, aiBox){
      aiBox.innerHTML = '<div class="note">Asking Claude…</div>';
      var prompt = "Explain this sentence from a book in plain English, in 2-3 short sentences: what it means, " +
        "and what it implies about the people, the situation or the mood. If it contains an idiom or unusual phrase, " +
        "say what it means. No preamble.\n\n" + sentence;
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 350,
          messages: [{ role: "user", content: prompt }]
        })
      })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
      .then(function(res){
        if (currentSentence !== sentence) return;
        var j = res.j;
        if (!res.ok){
          var msg = (j && j.error && j.error.message) || "the request failed";
          throw new Error(msg);
        }
        var txt = (j.content || []).map(function(c){ return c.text || ""; }).join("").trim();
        if (!txt) throw new Error("empty reply");
        aiBox.innerHTML = '<div class="sec">Explained by Claude</div><div class="ai"></div>';
        aiBox.querySelector(".ai").textContent = txt;
      })
      .catch(function(err){
        if (currentSentence !== sentence) return;
        aiBox.innerHTML = '<div class="note">Couldn’t get an explanation (' + esc(err && err.message ? err.message : "no connection") + ').</div>' +
          '<div class="acts"><button class="act" id="dictAiRetry">Try again</button><button class="act" id="dictAiKey">Change key</button></div>';
        aiBox.querySelector("#dictAiRetry").addEventListener("click", function(){ explainWithAI(sentence, localStorage.getItem(LS_KEY) || "", aiBox); });
        aiBox.querySelector("#dictAiKey").addEventListener("click", function(){ if (askForKey(true)) explainWithAI(sentence, localStorage.getItem(LS_KEY) || "", aiBox); });
      });
    }
    window.addEventListener("online", function(){ if (currentSentence && card.classList.contains("open")) renderAiButton(currentSentence); });
    window.addEventListener("offline", function(){ var b = inner.querySelector("#dictAiBtn"); if (b) b.parentNode.removeChild(b); });

    function askForKey(keepOpen){
      var k = prompt("Paste an Anthropic API key to enable “Explain with AI”.\n\nIt is stored only on this device and is sent only to api.anthropic.com when you press the button. Leave blank to remove it.", localStorage.getItem(LS_KEY) || "");
      if (k === null) return false;
      k = k.trim();
      if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY);
      if (!keepOpen) closeCard();
      return !!k;
    }

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
      if (!r) return null;
      var n = r.startContainer;
      if (n.nodeType !== 3) return null;
      if (!n.parentNode || !n.parentNode.closest || !n.parentNode.closest("#doc")) return null;
      var t = n.textContent, i = Math.min(r.startOffset, t.length - 1);
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
          var base = first ? window.__ll.Anchor.offsetOf(first, 0) : null;
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

    function inMiddleBand(x){
      if (!document.body.classList.contains("paged")) return true;
      var r = doc.getBoundingClientRect();
      var f = (x - r.left) / r.width;
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
      doc.addEventListener("touchstart", function(e){
        if (dictMode === "off" || e.touches.length > 1) return;
        tStart = Date.now(); moved = false; held = false;
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
        if (!inMiddleBand(e.clientX)) return;
        var w = wordAt(e.clientX, e.clientY);
        if (!w) return;
        e.stopPropagation();
        markHit(w.node, w.s, w.e);
        defineWord(w.word);
      }, true);

      /* desktop: long-press equivalent is a right-click (on a selection, or on the sentence under the pointer) */
      doc.addEventListener("contextmenu", function(e){
        if (dictMode === "off") return;
        var sel = selectionText();
        if (sel){ e.preventDefault(); lookupText(sel, window.Marks_selectionOffsets ? window.Marks_selectionOffsets() : null); return; }
        var s = sentenceAt(e.clientX, e.clientY);
        if (s){ e.preventDefault(); explainSentence(s.text, s); }
      });
    }

    /* selected text (mouse drag, or the native handles when the dictionary is off):
       a small floating button offers to define one word or explain a longer selection */
    function lookupText(s, off){
      var words = s.split(/\s+/).filter(Boolean);
      if (words.length === 1) defineWord(words[0].replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ]+$/g, "") || words[0]);
      else explainSentence(s, off);
    }
    function hidePill(){ pill.classList.remove("on"); }
    function updatePill(){
      var s = selectionText();
      if (!s || card.classList.contains("open")){ hidePill(); return; }
      var words = s.split(/\s+/).length;
      pill.querySelector("[data-act=lookup]").textContent = words > 1 ? "Explain" : "Define";
      var rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)){ hidePill(); return; }
      pill.classList.add("on");
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
      g.className = "group";
      g.innerHTML =
        '<div class="label">Dictionary</div>' +
        '<div class="chips" id="dictChips">' +
          '<button class="chip" data-dm="tap">Tap a word</button>' +
          '<button class="chip" data-dm="hold">Hold only</button>' +
          '<button class="chip" data-dm="off">Off</button>' +
        '</div>' +
        '<div class="hint">' +
          'Tap a word for its meaning. Hold on a sentence (or select text) to have it explained — clauses, who did what, tense, idioms and a plainer rewrite, all offline. ' +
          '<a href="#" id="dictKeyLink" style="color:var(--accent)">Anthropic API key for “Explain with AI”…</a>' +
        '</div>';
      sheet.appendChild(g);
      function syncChips(){
        g.querySelectorAll("#dictChips .chip").forEach(function(c){
          c.classList.toggle("on", c.dataset.dm === dictMode);
        });
      }
      g.querySelectorAll("#dictChips .chip").forEach(function(c){
        c.addEventListener("click", function(){
          dictMode = c.dataset.dm;
          localStorage.setItem(LS_MODE, dictMode);
          syncChips(); applyMode();
        });
      });
      g.querySelector("#dictKeyLink").addEventListener("click", function(e){
        e.preventDefault(); askForKey(true);
      });
      syncChips();
    }

    /* re-apply after a new file is opened (doc innerHTML is replaced) */
    var mo = new MutationObserver(applyMode);
    if (doc) mo.observe(doc, { childList: true });

    /* for tests and other modules */
    window.llDict = { explainSentence: explainSentence, defineWord: defineWord, lookupLocal: lookupLocal, withWords: withWords, find: find, loaded: function(){ return Object.keys(DB).map(Number); } };
  })();

  /* exposed for tests and other scripts (not a public API) */
  window.__ll = { need: need, Updates: Updates, state: state, Library: Library, Marks: Marks, Toc: Toc, Search: Search, Speak: Speak, Progress: Progress, Ruler: Ruler, Auto: Auto, AutoTheme: AutoTheme, Wake: Wake, Tabs: Tabs, Anchor: Anchor, Side: Side, openFile: openFile, openFiles: openFiles, show: show, revealOffset: revealOffset };
  window.Search = Search;
  window.Marks_highlightSelection = function(){ var m = Marks.highlightSelection(); if (m) Marks.toast("Highlighted"); };
  window.Marks_selectionOffsets = Marks.selectionOffsets;

  /* ---------- boot ---------- */
  Prefs.load();
  /* first run on a device that asks for more contrast: start with the high-contrast theme */
  if (!localStorage.getItem("ll_prefs") && window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches){
    state.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "hidark" : "hicon";
  }
  headVar();
  buildThemeChips();
  buildCustomUI();
  syncCustomUI();
  $("#softenPdf").checked = !!state.soften;
  document.querySelectorAll("#flowChips .chip").forEach(function(ch){
    ch.classList.toggle("on", ch.dataset.flow === state.flow);
  });
  applyTheme();
  applyType();
  $("#cSpread").checked = state.spread !== false;
  $("#cWake").checked = state.wake !== false;
  AutoTheme.apply();
  show("empty");
  Launch.boot();

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
      toastEl.innerHTML = '<span>A new version of Lamplight is ready.</span><button type="button" id="updateReload">Reload</button><button type="button" id="updateLater" aria-label="Later">\u00D7</button>';
      document.body.appendChild(toastEl);
      toastEl.querySelector("#updateReload").addEventListener("click", function(){
        wantReload = true;
        if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        else location.reload();
      });
      toastEl.querySelector("#updateLater").addEventListener("click", function(){ toastEl.remove(); toastEl = null; });
    }
    function watch(worker){
      if (!worker) return;
      worker.addEventListener("statechange", function(){
        if (worker.state === "installed" && navigator.serviceWorker.controller) toast();
      });
    }
    function register(){
      if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
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
    return { register: register, hasToast: function(){ return !!toastEl; } };
  })();
  Updates.register();

  /* ask the browser to keep our storage (library, positions, notes) out of automatic eviction */
  if (navigator.storage && navigator.storage.persist){
    var askPersist = function(){
      if (localStorage.getItem("ll_persist") === "granted") return;
      navigator.storage.persisted().then(function(p){
        if (p){ localStorage.setItem("ll_persist", "granted"); return; }
        return navigator.storage.persist().then(function(ok){ localStorage.setItem("ll_persist", ok ? "granted" : "denied"); });
      }).catch(function(){});
    };
    /* best asked once something is worth keeping: the first time a file is opened */
    document.addEventListener("ll:fileopened", askPersist, { once: true });
  }
})();
