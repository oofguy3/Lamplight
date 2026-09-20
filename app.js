
(function(){
  "use strict";
  var $ = function(s){ return document.querySelector(s); };
  /* localStorage can throw (Safari with all cookies blocked, some private modes); treat it as optional */
  var Store = {
    get: function(k){ try { return localStorage.getItem(k); } catch(_){ return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch(_){} },
    remove: function(k){ try { localStorage.removeItem(k); } catch(_){} }
  };

  /* parsers are separate files, fetched the first time a file type needs them
     (and precached by the service worker so that still works offline) */
  var LIBS = {
    pdf:     ["./vendor/pdf.min.js"],   /* parsing runs in vendor/pdf.worker.min.js, a real Web Worker (see needPdf) */
    mammoth: ["./vendor/mammoth.min.js"],
    marked:  ["./vendor/marked.min.js"],
    purify:  ["./vendor/purify.min.js"],
    jszip:   ["./vendor/jszip.min.js"],
    explain: ["./explain.js"],
    morph:   ["./morph.js"]
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

  /* Built-in themes. Every pair the reader meets (text, secondary text and accent on the page
     and on the panel) is at least 4.5:1 — tests/themes.js audits this table. */
  var THEMES = {
    /* light */
    day:   {name:"Day",    bg:"#EDEDE6", ink:"#1F2323", muted:"#646B68", panel:"#F5F5EF", line:"#D8D9CF", accent:"#2F6D5B"},
    sepia: {name:"Sepia",  bg:"#E9DDC5", ink:"#40331F", muted:"#6E5F42", panel:"#F0E7D2", line:"#D6C7A4", accent:"#86551A"},
    mist:  {name:"Mist",   bg:"#E7EBEE", ink:"#25303A", muted:"#5D6A76", panel:"#F0F3F5", line:"#D1D9DF", accent:"#3C6E93"},
    rose:  {name:"Rose",   bg:"#F4E7E3", ink:"#44302D", muted:"#7C625A", panel:"#F9EFEC", line:"#E3CFC9", accent:"#A8495A"},
    paper:     {name:"Paper",     bg:"#FAFAF7", ink:"#141414", muted:"#5C5C58", panel:"#FFFFFF", line:"#E1E1DA", accent:"#BE2A24"},
    parchment: {name:"Parchment", bg:"#F1E4C6", ink:"#2C2114", muted:"#67563A", panel:"#F7ECD4", line:"#DCCBA3", accent:"#8B2F2A"},
    linen:     {name:"Linen",     bg:"#F3EFE6", ink:"#2B2A26", muted:"#65625A", panel:"#FAF8F1", line:"#DDD8CB", accent:"#5A6828"},
    sage:      {name:"Sage",      bg:"#E3EADD", ink:"#1F2A22", muted:"#556358", panel:"#EDF2E8", line:"#CAD5C3", accent:"#A2502E"},
    lavender:  {name:"Lavender",  bg:"#ECE7F4", ink:"#29233A", muted:"#605876", panel:"#F4F1FA", line:"#D6CFE4", accent:"#6A4DB5"},
    sky:       {name:"Sky",       bg:"#E2EDF7", ink:"#17293A", muted:"#4F6274", panel:"#EEF5FB", line:"#C7D8E7", accent:"#2068A8"},
    peach:     {name:"Peach",     bg:"#FBE7DA", ink:"#3B2A21", muted:"#765A4D", panel:"#FDF1E8", line:"#EBD1C0", accent:"#146C72"},
    newsprint: {name:"Newsprint", bg:"#E3E2DC", ink:"#2B2B2B", muted:"#5E5E5B", panel:"#EBEAE5", line:"#CDCCC5", accent:"#A82424"},
    mint:      {name:"Mint",      bg:"#DEF2E8", ink:"#153128", muted:"#48685C", panel:"#EAF7F0", line:"#C1DFD1", accent:"#0D7566"},
    /* dark */
    dusk:  {name:"Dusk",   bg:"#14161B", ink:"#D6D3C8", muted:"#8E9088", panel:"#1B1E25", line:"#2A2E37", accent:"#D8A24A"},
    forest:{name:"Forest", bg:"#101711", ink:"#CDD8C6", muted:"#83907E", panel:"#161F17", line:"#263223", accent:"#7FB069"},
    ocean: {name:"Ocean",  bg:"#0D141E", ink:"#CBD5E1", muted:"#7E8CA0", panel:"#131C29", line:"#223042", accent:"#5C9CD6"},
    plum:  {name:"Plum",   bg:"#17101F", ink:"#D8CDE3", muted:"#91849F", panel:"#1E1628", line:"#2F2440", accent:"#A97FD6"},
    ink:   {name:"Ink",    bg:"#050506", ink:"#C7C3B6", muted:"#7F7C72", panel:"#0E0E11", line:"#1E1E23", accent:"#C08D3F"},
    midnight:  {name:"Midnight",  bg:"#0B1126", ink:"#D8DDEE", muted:"#8F9AB9", panel:"#111A36", line:"#20294B", accent:"#9DB4FF"},
    graphite:  {name:"Graphite",  bg:"#1E1F22", ink:"#D8D8D5", muted:"#9A9A96", panel:"#26272B", line:"#36373C", accent:"#74D0B8"},
    ember:     {name:"Ember",     bg:"#1A1210", ink:"#EBDACD", muted:"#A68F80", panel:"#221815", line:"#3B2A22", accent:"#F2812E"},
    moss:      {name:"Moss",      bg:"#161A10", ink:"#D7DBC2", muted:"#949B7F", panel:"#1D2215", line:"#303826", accent:"#B7C86A"},
    cocoa:     {name:"Cocoa",     bg:"#1B1411", ink:"#E9DBCF", muted:"#A6958A", panel:"#241B17", line:"#3A2D27", accent:"#D8A067"},
    slate:     {name:"Slate",     bg:"#1C2229", ink:"#D5DBE1", muted:"#8F9BA7", panel:"#242B33", line:"#353E48", accent:"#EF8C76"},
    /* dim: for reading in the dark without a black screen */
    candle:    {name:"Candle",    bg:"#2A1D14", ink:"#F0DDB4", muted:"#B39F80", panel:"#33251A", line:"#4C3A2A", accent:"#E9C46A"},
    /* phosphor screens and pure black */
    terminal:  {name:"Terminal",  bg:"#050805", ink:"#3FE86F", muted:"#2FA354", panel:"#0A110A", line:"#183018", accent:"#D9FF6E"},
    amber:     {name:"Amber",     bg:"#0F0A03", ink:"#FFB000", muted:"#B98319", panel:"#17100A", line:"#302311", accent:"#FFDF70"},
    noir:      {name:"Noir",      bg:"#000000", ink:"#C6C6C6", muted:"#8E8E8E", panel:"#0B0B0B", line:"#242424", accent:"#EDEDED"},
    /* high contrast: pure white / black with a strong accent, for low vision or bright sunlight */
    hicon: {name:"Contrast",      bg:"#FFFFFF", ink:"#000000", muted:"#3A3A3A", panel:"#FFFFFF", line:"#000000", accent:"#0033CC"},
    hidark:{name:"Contrast dark", bg:"#000000", ink:"#FFFFFF", muted:"#D0D0D0", panel:"#000000", line:"#FFFFFF", accent:"#FFD400"}
  };
  /* the chips and the day / night lists show the built-ins in three groups; the lamp cycles
     them in the same order: lights, then darks, then high contrast */
  var HICON = ["hicon", "hidark"];
  function themeGroups(){
    var light = [], dark = [];
    Object.keys(THEMES).forEach(function(k){ if (HICON.indexOf(k) < 0) (isDarkColor(THEMES[k].bg) ? dark : light).push(k); });
    return [{ id: "light", name: "Light", ids: light }, { id: "dark", name: "Dark", ids: dark }, { id: "hicon", name: "High contrast", ids: HICON }];
  }
  var CYCLE = themeGroups().reduce(function(all, g){ return all.concat(g.ids); }, []);
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
     entries have no files. The old ids (serif, sans, mono, hyper) keep their stacks. */
  var FONTS = {
    /* easy reading */
    dyslexic:    { name: "OpenDyslexic", group: "easy", stack: "'OpenDyslexic', " + STACKS.sans, note: "weighted letter bottoms and wide spacing help letters stay put",
                   files: [fontFile("opendyslexic-latin-400-normal", "400"), fontFile("opendyslexic-latin-700-normal", "700"), fontFile("opendyslexic-latin-400-italic", "400", "italic"), fontFile("opendyslexic-latin-700-italic", "700", "italic")] },
    lexend:      { name: "Lexend", group: "easy", stack: "'Lexend', " + STACKS.sans, note: "wide, even shapes shown to raise reading speed",
                   files: [fontFile("lexend-latin-wght-normal", "100 900")] },
    hyper:       { name: "Atkinson Hyperlegible", group: "easy", stack: "'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", note: "designed for low vision readers" },   /* its @font-face rules are in app.css */
    andika:      { name: "Andika", group: "easy", stack: "'Andika', " + STACKS.sans, note: "clear letterforms for beginning readers",
                   files: [fontFile("andika-latin-400-normal", "400"), fontFile("andika-latin-700-normal", "700"), fontFile("andika-latin-400-italic", "400", "italic")] },
    /* serif */
    serif:       { name: "Georgia", group: "serif", stack: STACKS.serif, note: "the classic screen serif, on nearly every device" },
    palatino:    { name: "Palatino", group: "serif", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', serif", note: "a calligraphic book face, where the device has it" },
    times:       { name: "Times", group: "serif", stack: "'Times New Roman', Times, 'Nimbus Roman', serif", note: "the newspaper serif everyone knows" },
    literata:    { name: "Literata", group: "serif", stack: "'Literata', " + STACKS.serif, note: "made for e-reading",
                   files: [fontFile("literata-latin-wght-normal", "200 900"), fontFile("literata-latin-wght-italic", "200 900", "italic")] },
    sourceserif: { name: "Source Serif", family: "Source Serif 4", group: "serif", stack: "'Source Serif 4', " + STACKS.serif, note: "a sturdy, open text serif",
                   files: [fontFile("source-serif-4-latin-wght-normal", "200 900"), fontFile("source-serif-4-latin-wght-italic", "200 900", "italic")] },
    lora:        { name: "Lora", group: "serif", stack: "'Lora', " + STACKS.serif, note: "brushed curves with a modern feel",
                   files: [fontFile("lora-latin-wght-normal", "400 700"), fontFile("lora-latin-wght-italic", "400 700", "italic")] },
    merriweather:{ name: "Merriweather", group: "serif", stack: "'Merriweather', " + STACKS.serif, note: "large x-height, pleasant on screens",
                   files: [fontFile("merriweather-latin-wght-normal", "300 900"), fontFile("merriweather-latin-wght-italic", "300 900", "italic")] },
    garamond:    { name: "EB Garamond", group: "serif", stack: "'EB Garamond', " + STACKS.serif, note: "a faithful old-style Garamond",
                   files: [fontFile("eb-garamond-latin-wght-normal", "400 800"), fontFile("eb-garamond-latin-wght-italic", "400 800", "italic")] },
    crimson:     { name: "Crimson Pro", group: "serif", stack: "'Crimson Pro', " + STACKS.serif, note: "an old-style face in the spirit of printed books",
                   files: [fontFile("crimson-pro-latin-wght-normal", "200 900"), fontFile("crimson-pro-latin-wght-italic", "200 900", "italic")] },
    baskerville: { name: "Libre Baskerville", group: "serif", stack: "'Libre Baskerville', " + STACKS.serif, note: "a Baskerville tuned for reading on screens",
                   files: [fontFile("libre-baskerville-latin-400-normal", "400"), fontFile("libre-baskerville-latin-700-normal", "700"), fontFile("libre-baskerville-latin-400-italic", "400", "italic")] },
    bitter:      { name: "Bitter", group: "serif", stack: "'Bitter', " + STACKS.serif, note: "a slab serif, solid at any size",
                   files: [fontFile("bitter-latin-wght-normal", "100 900")] },
    /* sans */
    sans:        { name: "System sans", group: "sans", stack: STACKS.sans, note: "whatever your device uses for its own text" },
    helvetica:   { name: "Helvetica / Arial", group: "sans", stack: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif", note: "neutral and familiar" },
    verdana:     { name: "Verdana", group: "sans", stack: "Verdana, 'DejaVu Sans', Geneva, sans-serif", note: "wide and generous, made for small screens" },
    inter:       { name: "Inter", group: "sans", stack: "'Inter', " + STACKS.sans, note: "a clean interface sans with tall letters",
                   files: [fontFile("inter-latin-wght-normal", "100 900")] },
    plex:        { name: "IBM Plex Sans", group: "sans", stack: "'IBM Plex Sans', " + STACKS.sans, note: "a warm, even sans with a slight edge",
                   files: [fontFile("ibm-plex-sans-latin-wght-normal", "100 700"), fontFile("ibm-plex-sans-latin-wght-italic", "100 700", "italic")] },
    nunito:      { name: "Nunito", group: "sans", stack: "'Nunito', " + STACKS.sans, note: "rounded and soft on the eye",
                   files: [fontFile("nunito-latin-wght-normal", "200 1000")] },
    /* mono */
    mono:        { name: "System mono", group: "mono", stack: STACKS.mono, note: "fixed width, for code and plain text" },
    jetbrains:   { name: "JetBrains Mono", group: "mono", stack: "'JetBrains Mono', " + STACKS.mono, note: "a tall, open monospace made for long reads",
                   files: [fontFile("jetbrains-mono-latin-wght-normal", "100 800")] },
    plexmono:    { name: "IBM Plex Mono", group: "mono", stack: "'IBM Plex Mono', " + STACKS.mono, note: "a typewriter-flavoured monospace",
                   files: [fontFile("ibm-plex-mono-latin-400-normal", "400"), fontFile("ibm-plex-mono-latin-700-normal", "700")] }
  };
  var FONT_GROUPS = [{ id: "easy", name: "Easy reading" }, { id: "serif", name: "Serif" }, { id: "sans", name: "Sans" }, { id: "mono", name: "Mono" }];
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
    auto:"off", autoDay:"day", autoNight:"dusk", nightFrom:"21:00", nightTo:"07:00", spread:true, wake:true, perPage:1,
    zoom:1, soften:true,
    flow:"scroll", page:0, totalPages:1, pdfPageNum:1,
    mode:"empty", pdfDoc:null, fitScale:1, colw:0, gap:48, toc:null
  };
  var renderGen = 0;

  /* ---------- remembered reading settings ---------- */
  var Prefs = (function(){
    var KEY = "ll_prefs", FIELDS = ["theme", "custom", "customs", "font", "size", "lh", "width", "margin", "justify", "hyphens", "flow", "soften", "auto", "autoDay", "autoNight", "nightFrom", "nightTo", "spread", "wake"];
    var loading = false;
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
        var t = { id: c.id, name: c.name.trim().slice(0, 60) || "Custom", bg: bg, ink: ink || deriveInk(bg), autoInk: c.autoInk !== false || !ink, accent: accent };
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
      if (bg && accent) theme = "c:" + addCustom({ name: "My theme", bg: bg, ink: ink || deriveInk(bg), autoInk: c.autoInk !== false || !ink, accent: accent }).id;
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
     the text unless the user picked them; the hairline always is */
  function customColors(c){
    var ink = c.autoInk ? deriveInk(c.bg) : c.ink;
    return {
      name: c.name, bg: c.bg, ink: ink, accent: c.accent,
      panel: c.panel || mix(c.bg, ink, 0.05),
      line:  mix(c.bg, ink, 0.15),
      muted: c.muted || deriveMuted(ink, c.bg)
    };
  }
  /* secondary text: the text mixed towards the background, but no further than still reads on it */
  function deriveMuted(ink, bg){
    for (var t = 0.42; t > 0; t -= 0.03){ var m = mix(ink, bg, t); if (contrast(m, bg) >= 4.5) return m; }
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
    for (i = 1; ; i++) if (names.indexOf("Custom " + i) < 0) return "Custom " + i;
  }

  /* ---------- theme + type ---------- */
  /* a chip's swatch: the theme's page colour with its accent as the lamp in the middle */
  function swatchHtml(t){ return '<i style="--sw-bg:' + t.bg + ';--sw-acc:' + t.accent + '" aria-hidden="true"></i>'; }
  function chipHtml(theme, t){ return '<button class="chip" data-theme="' + theme + '">' + swatchHtml(t) + escapeHtml(t.name) + '</button>'; }
  function buildThemeChips(){
    var html = "";
    themeGroups().forEach(function(g){
      html += '<div class="chip-group" role="group" aria-labelledby="tg-' + g.id + '"><div class="chip-group-label" id="tg-' + g.id + '">' + g.name + '</div><div class="chips">' +
        g.ids.map(function(k){ return chipHtml(k, THEMES[k]); }).join("") + '</div></div>';
    });
    html += '<div class="chip-group" role="group" aria-labelledby="tg-custom"><div class="chip-group-label" id="tg-custom">Custom</div><div class="chips">' +
      state.customs.map(function(c){ return chipHtml("c:" + c.id, customColors(c)); }).join("") +
      '<button class="chip chip-new" data-new="1" title="Start a custom theme from the colours on screen">New…</button></div></div>';
    $("#themeChips").innerHTML = html;
  }
  function buildCustomUI(){
    $("#bgSwatches").innerHTML = BG_SWATCHES.map(function(c){
      return '<button class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Background ' + c + '" aria-pressed="false"></button>';
    }).join("");
    $("#accSwatches").innerHTML = ACC_SWATCHES.map(function(c){
      return '<button class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Accent ' + c + '" aria-pressed="false"></button>';
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
    { id: "accent",      what: "accent",         fg: "accent", on: "bg" },
    { id: "accentPanel", what: "accent",         fg: "accent", on: "panel" }
  ];
  function grade(r){ return r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "Low"; }
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
    if (!low.length) return METER.every(function(m){ return contrast(t[m.fg], t[m.on]) >= 7; }) ? "All text is comfortably readable." : "All text is readable.";
    var names = [], dir = lighterWins(t.bg) ? "lighter" : "darker";
    low.forEach(function(m){ if (names.indexOf(m.what) < 0) names.push(m.what); });
    var list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0];
    var where = low.every(function(m){ return m.on === "panel"; }) ? "the panel" : "this background";
    var fix = names.length > 1 ? dir + " colours" : (names[0] === "accent" ? "a " + dir + " accent" : dir + " " + names[0]);
    return list.charAt(0).toUpperCase() + list.slice(1) + (names.length > 1 ? " are" : " is") + " hard to read on " + where + " — try " + fix + ".";
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
    if (contrast(t.muted, t.bg) < 4.5){ c.muted = fixColor(t.muted, [t.bg]); t = customColors(c); }
    if (contrast(t.accent, t.bg) < 4.5 || contrast(t.accent, t.panel) < 4.5) c.accent = fixColor(t.accent, [t.bg, t.panel]);
    syncCustomUI(); applyTheme();
  }
  function applyTheme(){
    var t = currentTheme(), custom = customById(state.theme);
    var r = document.documentElement.style;
    r.setProperty("--bg", t.bg);      r.setProperty("--ink", t.ink);
    r.setProperty("--muted", t.muted);r.setProperty("--panel", t.panel);
    r.setProperty("--line", t.line);  r.setProperty("--accent", t.accent);
    document.documentElement.style.colorScheme = isDarkColor(t.bg) ? "dark" : "light";
    document.body.classList.toggle("soften", state.soften && isDarkColor(t.bg));
    /* the installed app's title bar takes the panel colour */
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.panel);
    document.querySelectorAll("#themeChips .chip[data-theme]").forEach(function(ch){
      var on = ch.dataset.theme === state.theme;
      ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
      if (on && custom){ var sw = ch.querySelector("i"); sw.style.setProperty("--sw-bg", t.bg); sw.style.setProperty("--sw-acc", t.accent); }
    });
    $("#customRow").classList.toggle("show", !!custom);
    if (custom) previewCustom(t);
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
      var opts = themeGroups().map(function(g){
        return '<optgroup label="' + g.name + '">' + g.ids.map(function(k){ return '<option value="' + k + '">' + THEMES[k].name + '</option>'; }).join("") + '</optgroup>';
      }).join("");
      if (state.customs.length) opts += '<optgroup label="Custom">' + state.customs.map(function(c){ return '<option value="c:' + c.id + '">' + escapeHtml(c.name) + '</option>'; }).join("") + '</optgroup>';
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
    var r = document.documentElement.style, font = FONTS[state.font] || FONTS.serif;
    r.setProperty("--fsN", String(state.size));
    r.setProperty("--lh", String(state.lh));
    r.setProperty("--w", state.width + "px");
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
    $("#rSize").value = state.size; $("#rLh").value = state.lh; $("#rW").value = state.width; $("#rM").value = state.margin || 0;
    $("#vSize").textContent = state.size + " px";
    $("#vLh").textContent   = state.lh.toFixed(2);
    $("#vW").textContent    = state.width + " px";
    $("#vM").textContent    = (state.margin || 0) + " px";
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
        if (!again) Marks.toast(navigator.onLine ? "Couldn’t load this font" : "Font not available offline");
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
      var og = document.createElement("optgroup"); og.label = g.name;
      ids(g.id).forEach(function(id){ var o = document.createElement("option"); o.value = id; o.textContent = FONTS[id].name; og.appendChild(o); });
      sel.appendChild(og);
    });
    function syncUI(){
      var f = FONTS[state.font] || FONTS.serif;
      sel.value = state.font;
      sel.title = f.name + " — " + f.note;
      if (listEl) Array.prototype.forEach.call(listEl.querySelectorAll(".font-item"), function(b){ b.setAttribute("aria-pressed", b.dataset.font === state.font ? "true" : "false"); });
    }

    /* the browse panel: every family by group, each name set in the face itself */
    function item(id){
      var f = FONTS[id];
      return '<button class="font-item" data-font="' + id + '" aria-pressed="' + (id === state.font) + '">' +
        '<span class="font-name" style="font-family:' + f.stack.replace(/"/g, "&quot;") + '">' + f.name + '</span>' +
        '<span class="font-note">' + f.note + '</span></button>';
    }
    function render(body){
      var h = '<div class="font-list">';
      FONT_GROUPS.forEach(function(g){
        h += '<div class="font-set" role="group" aria-labelledby="fontGroup-' + g.id + '"><div class="font-group" id="fontGroup-' + g.id + '">' + g.name + '</div>';
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
    function openPanel(){ Side.open("fonts", "Fonts", render, closed); }

    /* for tests and other modules */
    window.llFonts = { load: load, loaded: loaded, use: use, openPanel: openPanel, catalogue: FONTS, groups: FONT_GROUPS };
    return { use: use, load: load, loaded: loaded, syncUI: syncUI, openPanel: openPanel };
  })();

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
    if (window.llStats) window.llStats.onMode(mode);
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
    var headH = document.body.classList.contains("immersive") || document.body.classList.contains("zen") ? 0 : head.offsetHeight;
    var pagerH = document.body.classList.contains("zen") ? 0 : ($("#pager").offsetHeight || 56);
    document.documentElement.style.setProperty("--pagerH", pagerH + "px");
    var ttsEl = $("#tts"), ttsH = ttsEl && ttsEl.classList.contains("on") ? ttsEl.offsetHeight : 0;
    return Math.max(160, window.innerHeight - headH - pagerH - ttsH - 26);
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
  /* show page n. `anchor` is the character the caller navigated to (a resume position, a
     heading, a search hit, the place kept through a re-layout); without one the page's own
     first character becomes the anchor. Re-layouts land on the page holding the anchor. */
  function gotoPage(n, animate, anchor){
    n = Math.max(0, Math.min(n, state.totalPages - 1));
    var was = state.page;
    state.page = n;
    var view = $("#docView"), left = n * (state.perPage || 1) * state.stride;
    var smooth = animate && !(reduceMotion && reduceMotion.matches) && Math.abs(n - was) === 1;
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
  function pageTopOffset(){
    if (state.mode !== "doc" || state.flow !== "pages" || !state.stride) return null;
    var nodes = Anchor.textNodes();
    if (!nodes.length) return null;
    var left = $("#doc").getBoundingClientRect().left, want = state.page * (state.perPage || 1), r = document.createRange();
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
    var frac = readFrac();
    var off = state.mode === "doc" ? (state.flow === "pages" ? pageTopOffset() : Library.topCharOffset()) : null;
    state.flow = f;
    document.querySelectorAll("#flowChips .chip").forEach(function(ch){
      ch.classList.toggle("on", ch.dataset.flow === f);
    });
    Prefs.save();
    if (state.mode === "pdf" && state.pdfDoc && f === "pages")
      state.pdfPageNum = Math.round(frac * (state.pdfDoc.numPages - 1)) + 1;
    document.body.classList.remove("hidebar");
    reflow();
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
    if (state.mode === "doc"){ gotoPage(state.page + dir, true); }
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
      if (!live()) return;
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
          if (!live()){ try { doc.destroy(); } catch(_){} return; }
          state.pdfDoc = doc;
          state.zoom = 1;
          $("#rZoom").value = 100; $("#vZoom").textContent = "100 %";
          show("pdf");
          reflow();
        }).catch(fail);

      } else if (ext === "docx"){
        status("Opening document…");
        Promise.all([need(["purify"]), docxToHtml(file)]).then(function(r){
          if (!live()) return;
          setDocHtml(r[1]);
        }).catch(fail);

      } else if (ext === "epub"){
        status("Opening book…");
        need(["jszip", "purify"]).then(function(){ return file.arrayBuffer(); }).then(function(buf){
          return openEpub(buf);
        }).then(function(book){
          if (!live()){ releaseEpubUrls(); return; }
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
          if (!live()) return;
          setDocHtml(marked.parse(txt));
        }).catch(fail);

      } else if (ext === "html" || ext === "htm"){
        status("Opening page…");
        need(["purify"]).then(function(){ return file.text(); }).then(function(txt){
          if (!live()) return;
          setDocHtml(readerHtml(txt));
        }).catch(fail);

      } else {
        file.text().then(function(txt){
          if (!live()) return;
          var wrap = document.createElement("div");
          wrap.className = "plain";
          wrap.textContent = txt;
          $("#doc").innerHTML = "";
          $("#doc").appendChild(wrap);
          Anchor.invalidate();
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
    if (el) revealElement(el);
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
        wrap.setAttribute("aria-label", "Page " + i);
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
    /* Escape closes only the topmost layer: the key stops here once it has closed a panel, so the
       settings sheet and the menu, whose listeners come after this one, keep their state; the
       dictionary card, which sits over the panel, takes the key first in the capture phase */
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape" && current){ e.preventDefault(); e.stopImmediatePropagation(); close(); }
    });
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
    /* everything stuck to the top of the window: the bar, plus the settings sheet while it is open */
    function headerHeight(){
      if (document.body.classList.contains("immersive")) return 0;
      var head = document.querySelector("header"), sheet = $("#sheet");
      return (head ? head.offsetHeight : 0) + (sheet && sheet.classList.contains("open") ? sheet.offsetHeight : 0);
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
      Tabs.clear();
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
      abandonOpen();
      Speak.stop(); Auto.stop(); Ruler.set(false); Zen.exit(); Side.close();
      if (state.mode === "doc" || state.mode === "pdf"){
        document.body.classList.remove("hidebar", "immersive");
        window.scrollTo(0, 0);
      }
      setSheet(false);
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
      del(m); if (m.kind === "highlight") unwrapOne(m); refreshPanel(); hidePop();
    }
    function setNote(m, note){ m.note = note || ""; m.updated = Date.now(); save(m); if (m.kind === "highlight") restyle(m); refreshPanel(); }
    function setColor(m, color){ m.color = color; save(m); restyle(m); refreshPanel(); }
    function reveal(m){
      Side.close();
      if (m.pdfPage && state.mode === "pdf"){
        if (state.flow === "pages"){ state.pdfPageNum = m.pdfPage; renderPdfSingle(); }
        else { var c = $("#pdf").querySelector('.pdf-page[data-page="' + m.pdfPage + '"]'); if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - Library.headerHeight() - 6)); }
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
      shown = entries;
    }
    /* one delegated pair of listeners on the shared panel body, live only while contents is open */
    var shown = null;
    Side.body.addEventListener("click", function(ev){
      if (!Side.is("toc") || !shown) return;
      var it = ev.target.closest(".toc-item"); if (!it) return;
      var e = shown[+it.dataset.i]; if (!e) return;
      Side.close();
      if (e.el) revealElement(e.el); else if (e.page) goPdfPage(e.page);
    });
    Side.body.addEventListener("keydown", function(ev){
      if (!Side.is("toc") || (ev.key !== "Enter" && ev.key !== " ")) return;
      var it = ev.target.closest(".toc-item"); if (it){ ev.preventDefault(); it.click(); }
    });
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
    function openPanel(){ Side.open("toc", "Contents", render, function(){ shown = null; }); }
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
    return { openPanel: openPanel, reset: reset, refresh: refresh, clearPaint: clearPaint, go: go, results: function(){ return results; } };
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
    var FIND_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="6.8" cy="6.8" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>';
    var cache = null, gen = 0, statusEl = null;
    function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
    function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
    function fmtN(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    function one(n){ return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ""); }

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
          status("Reading page " + i + " of " + doc.numPages + "…");
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
      if (n < 1) return "before grade 1 · about age 5–6";
      if (n >= 17) return "beyond grade 16 · postgraduate reading";
      if (n >= 13) return "grade " + n + " · university level";
      return "grade " + n + " · about age " + (n + 5) + "–" + (n + 6);
    }
    function ttrLabel(r){ return r < 0.40 ? "Simple" : r < 0.48 ? "Moderate" : r < 0.56 ? "Rich" : "Very rich"; }
    function readingTime(words){
      var min = words / Math.max(60, Progress.wpm());
      if (min < 1) return "under a minute";
      if (min < 59.5) return "about " + Math.round(min) + " min";
      var h = Math.floor(min / 60), m = Math.round(min % 60);
      if (m === 60){ h++; m = 0; }
      return "about " + h + " h" + (m ? " " + m + " min" : "");
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
      return { name: (b && (b.title || b.name)) || $("#fname").textContent || "This document",
               type: b ? b.type : (state.mode === "pdf" ? "PDF" : "") };
    }
    function keyNow(){
      return (Library.currentId() || "") + ":" + state.mode + ":" + (state.mode === "pdf" ? (state.pdfDoc ? state.pdfDoc.numPages : 0) : $("#doc").textContent.length);
    }
    function header(st){
      var d = docLabel();
      return '<div class="about-doc"><span class="about-name">' + esc(d.name) + '</span>' +
        (d.type ? '<span class="about-fmt">' + esc(d.type) + '</span>' : '') +
        (st && st.note ? '<span class="about-part">' + esc(st.note) + '</span>' : '') + '</div>';
    }
    function tile(value, label, cls){ return '<div class="about-tile' + (cls ? ' ' + cls : '') + '"><b>' + value + '</b><span>' + label + '</span></div>'; }
    function wordRow(x){
      return '<div class="about-row"><button type="button" class="about-word" data-w="' + esc(x.w) + '">' +
        '<span class="w">' + esc(x.w) + '</span><span class="n">×' + x.n + '</span><span class="r">' + TIER[x.tier] + '</span></button>' +
        '<button type="button" class="about-find" data-find="' + esc(x.w) + '" title="Find in the text" aria-label="Find “' + esc(x.w) + '” in the text">' + FIND_ICON + '</button></div>';
    }
    function draw(st){
      var body = Side.body, foot = Side.foot, h = header(st);
      statusEl = null;
      if (!st.words){
        body.innerHTML = h + '<div class="empty-note">Nothing to count yet.</div>';
        foot.innerHTML = ""; foot.style.display = "none";
        return;
      }
      var bd = band(st.flesch), share = Math.round(st.dialogue / st.words * 100);
      h += '<h2 class="about-h">At a glance</h2><div class="about-grid">' +
        tile(fmtN(st.words), "Words") + tile(fmtN(st.unique), "Unique words") + tile(fmtN(st.sentences), "Sentences") +
        tile(esc(readingTime(st.words)), "Reading time at your speed", "full") +
        tile(one(st.avgSentence), "Words per sentence") + tile(one(st.avgWord), "Letters per word") +
        (share > 0 ? tile(share + "%", "Dialogue") : "") + '</div>';
      h += '<h2 class="about-h">Reading level</h2><div class="about-level">' +
        '<div class="about-score"><b>' + st.flesch + '</b><span>' + bd[1] + '</span><small>Flesch reading ease</small></div>' +
        '<div class="about-scale" aria-hidden="true"><i style="left:' + st.flesch + '%"></i></div>' +
        '<div class="about-ends" aria-hidden="true"><span>harder</span><span>easier</span></div>' +
        '<p class="about-note">' + esc(bd[2]) + '</p>' +
        '<p class="about-note muted">Flesch–Kincaid: ' + gradeText(st.grade) + '<br>Coleman–Liau, as a second opinion: ' + gradeText(st.cli) + '</p></div>';
      h += '<h2 class="about-h">Vocabulary</h2><div class="about-grid">' +
        tile(ttrLabel(st.ttr), "Vocabulary richness (" + st.ttr.toFixed(2) + ")", "wide") + tile(fmtN(st.hapax), "Words used only once") + '</div>';
      h += '<h2 class="about-h">Hardest words</h2><div class="about-words" id="aboutWords"><div class="empty-note">Preparing…</div></div>';
      body.innerHTML = h;
      foot.innerHTML = '<button class="chip" data-about="copy">Copy</button>' +
        '<div class="about-foot-note">Counts are from the text as shown; numbers, headings and captions are included.</div>';
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
        box.innerHTML = list.length ? list.map(wordRow).join("") : '<div class="empty-note">No unusual words — everything here is everyday English.</div>';
      }, function(){
        var box = el(); if (box) box.innerHTML = '<div class="empty-note">Couldn’t load the word list.</div>';
      });
    }
    function compute(){
      var myGen = ++gen, key = keyNow(), mode = state.mode, pdf = state.pdfDoc, note = null;
      function live(){ return myGen === gen && Side.is("about") && state.mode === mode && (mode !== "pdf" || state.pdfDoc === pdf); }
      function status(msg){ if (live() && statusEl) statusEl.textContent = msg; }
      var src = mode === "pdf" && pdf
        ? pdfText(pdf, status, live).then(function(r){ if (r && r.capped) note = "first " + MAX_PDF_PAGES + " pages"; return r ? r.text : null; })
        : Promise.resolve(docText());
      src.then(function(text){
        if (text === null || !live()) return null;
        status("Counting words…");
        return analyse(text, { live: live, onProgress: function(n){ status("Counting words… " + fmtN(n) + " so far"); } });
      }).then(function(st){
        if (!st || !live()) return;
        st.note = note;
        cache = { key: key, stats: st };
        draw(st);
      }).catch(function(err){ console.warn("about: couldn’t read the text", err); status("Couldn’t read the text."); });
    }
    function render(body){
      var key = keyNow();
      if (cache && cache.key === key){ draw(cache.stats); return; }
      body.innerHTML = header() + '<div class="empty-note" id="aboutStatus" aria-live="polite">Reading the text…</div>';
      statusEl = body.querySelector("#aboutStatus");
      compute();
    }
    function openPanel(){
      if (!docOpen()) return;
      Side.open("about", "About this text", render, function(){ gen++; statusEl = null; });
    }
    /* a plain-text summary for the clipboard */
    function summary(st, name){
      var bd = band(st.flesch), share = Math.round(st.dialogue / Math.max(1, st.words) * 100), out = [];
      out.push("About “" + name + "”" + (st.note ? " (" + st.note + ")" : ""));
      out.push("Words: " + fmtN(st.words) + " · unique words: " + fmtN(st.unique) + " · sentences: " + fmtN(st.sentences));
      out.push("Reading time: " + readingTime(st.words) + " at " + Math.round(Progress.wpm()) + " words a minute");
      out.push("Average sentence: " + one(st.avgSentence) + " words · average word: " + one(st.avgWord) + " letters" + (share > 0 ? " · dialogue: " + share + "%" : ""));
      out.push("Reading level: Flesch reading ease " + st.flesch + " (" + bd[1] + ") — " + bd[2]);
      out.push("Flesch–Kincaid: " + gradeText(st.grade) + " · Coleman–Liau: " + gradeText(st.cli));
      out.push("Vocabulary richness: " + ttrLabel(st.ttr) + " (" + st.ttr.toFixed(2) + ") · words used only once: " + fmtN(st.hapax));
      if (st.hard && st.hard.length) out.push("Hardest words: " + st.hard.map(function(x){ return x.w + " (" + x.n + ")"; }).join(", "));
      return out.join("\n");
    }
    function copy(text){
      var done = function(){ Marks.toast("Copied"); }, fail = function(){ Marks.toast("Couldn’t copy"); };
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
    Menu.add({ order: 60, label: "About this text", key: "I", run: openPanel, show: docOpen });
    window.llAbout = { openPanel: openPanel, stats: analyse, syllables: syllables, sentences: sentencesIn, hardest: hardest, summary: summary };
    return { openPanel: openPanel, stats: analyse, syllables: syllables, hardest: hardest };
  })();

  /* ============================================================
     Read aloud — Web Speech API, sentence by sentence, with a narrator and a
     second voice for quoted speech, and a little expression read off the text
     ============================================================ */
  var Speak = (function(){
    var supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    var bar = $("#tts"), playBtn = $("#ttsPlay"), rateEl = $("#ttsRate"), rateV = $("#ttsRateV"), voiceSel = $("#ttsVoice");
    var womanBtn = $("#ttsWoman"), manBtn = $("#ttsMan"), voicesBtn = $("#ttsVoices");
    var units = [], idx = -1, playing = false, active = false, utter = null, gen = 0, pdfPage = 0, pdfUnitsDoc = null;
    var wait = null, sampleGen = 0, voiceKey = "";
    var rate = parseFloat(Store.get("ll_tts_rate") || "1") || 1;
    var voiceName = Store.get("ll_tts_voice") || "";
    var dialogueName = Store.get("ll_tts_dialogue") || "";     /* "" = auto (the other voice), "same", or a voice name */
    var expr = Store.get("ll_tts_expr") || "natural";           /* off | natural | dramatic */
    var pitchPref = clamp(parseFloat(Store.get("ll_tts_pitch") || "1") || 1, 0.7, 1.3);
    var hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
    if (!/^(off|natural|dramatic)$/.test(expr)) expr = "natural";
    rateEl.value = rate; rateV.textContent = rate.toFixed(1) + "×";
    function clamp(x, lo, hi){ return Math.min(hi, Math.max(lo, x)); }
    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

    /* ---- voices ---- */
    /* the API says nothing about gender, so guess it from the name: the words woman / man,
       then the first names Apple, Microsoft, Google, Amazon and espeak give their voices */
    function set(s){ var o = {}; s.split(" ").forEach(function(w){ if (w) o[w] = 1; }); return o; }
    var WOMEN = set("samantha karen moira tessa fiona victoria kate serena allison ava susan zira hazel heera aria jenny sara sonia libby emma olivia amy joanna kendra kimberly salli ivy nicole raveena aditi zoe flo martha shelley nicky sandy grandma kathy princess vicki catherine natasha matilda isha veena sangeeta anna alice ellen laura paulina monica luciana joana yuna kyoko ting-ting mei-jia sin-ji lekha milena amelie audrey aurelie chantal marie carmit damayanti ioana melina alva nora satu zosia zuzana mariska kanya yelda helena petra federica paola angelica marisol laila o-ren yu-shu linda hedda katja hortense julie elsa haruka ayumi sayaka heami huihui yaoyao hanhan yating tracy irina maria gadis kalpana hoda vlasta heidi helle sabina daria ewa");
    var MEN = set("daniel alex fred david george mark ryan guy christopher eric steffan thomas brian matthew joey justin kevin russell aaron arthur gordon lee oliver reed rishi rocko tom bruce junior ralph albert eddy grandpa evan nathan jamie jorge diego juan carlos luca xander yannick maged majed tarik otoya hattori nicolas markus viktor jordi li-mu yuri james richard sean stefan conrad paul pablo raul cosimo ichiro kangkang zhiwei danny pavel adam frank andika hemant naayf ivan filip lado szabolcs jakub karsten jon bengt pattara tolga rizwan ravi");
    function voiceGender(v){
      var name = typeof v === "string" ? v : (v && v.name) || "", low = name.toLowerCase();
      if (/\b(female|woman)\b/.test(low)) return "f";
      if (/\b(male|man)\b/.test(low)) return "m";
      var ts = low.split(/[\s,.()+_\/\\:\[\]"']+/), i;
      for (i = 0; i < ts.length; i++){
        if (WOMEN[ts[i]] || /^(f|female)\d$/.test(ts[i])) return "f";     /* espeak variants: en+f3 */
        if (MEN[ts[i]] || /^(m|male)\d$/.test(ts[i])) return "m";
      }
      if (/^google\s/.test(low)) return "f";     /* Chrome's Google voices are women except "UK English Male" */
      return "";
    }
    function voices(){ return supported ? speechSynthesis.getVoices() : []; }
    function docLang(){ return (document.documentElement.lang || "en").slice(0, 2).toLowerCase(); }
    function langOf(v){ return (v.lang || "").slice(0, 2).toLowerCase(); }
    /* the document's language first, local voices before online ones, then by name */
    function sortedVoices(){
      var lang = docLang();
      return voices().slice().sort(function(a, b){
        var al = langOf(a) === lang ? 0 : 1, bl = langOf(b) === lang ? 0 : 1;
        if (al !== bl) return al - bl;
        if (!a.localService !== !b.localService) return a.localService ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    function gendered(g){ return sortedVoices().filter(function(v){ return voiceGender(v) === g; }); }
    /* the best voice of a gender: language match, local first; strict = only that language */
    function bestVoice(g, lang, notName, strict){
      var vs = gendered(g).filter(function(v){ return v.name !== notName; });
      if (lang){ var same = vs.filter(function(v){ return langOf(v) === lang; }); if (same.length || strict) vs = same; }
      return vs[0] || null;
    }
    function voiceOptions(vs, selected){
      var groups = { f: [], m: [], "": [] };
      vs.forEach(function(v){ groups[voiceGender(v)].push(v); });
      return [["f", "Women"], ["m", "Men"], ["", "Other"]].map(function(g){
        if (!groups[g[0]].length) return "";
        return '<optgroup label="' + g[1] + '">' + groups[g[0]].map(function(v){
          return '<option value="' + esc(v.name) + '"' + (v.name === selected ? ' selected' : '') + '>' + esc(v.name) + (v.localService ? "" : " (online)") + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
    }
    function currentVoice(){
      var vs = voices(), name = voiceSel.value || voiceName;
      return vs.filter(function(v){ return v.name === name; })[0] || null;
    }
    /* the voice for quoted speech: the one chosen, the narrator, or (auto) the other gender in
       the narrator's language; failing that the narrator's own voice pitched a little away */
    function dialogueVoice(narr){
      narr = narr || currentVoice();
      if (dialogueName === "same") return { voice: narr, pitchOffset: 0 };
      var chosen = dialogueName ? voices().filter(function(v){ return v.name === dialogueName; })[0] : null;
      if (chosen) return { voice: chosen, pitchOffset: 0 };
      var g = narr ? voiceGender(narr) : "", lang = narr ? langOf(narr) : docLang(), not = narr ? narr.name : "";
      var other = g === "f" ? bestVoice("m", lang, not, true) : g === "m" ? bestVoice("f", lang, not, true)
                : (bestVoice("m", lang, not, true) || bestVoice("f", lang, not, true));
      if (other) return { voice: other, pitchOffset: 0 };
      return { voice: narr, pitchOffset: g === "m" ? 0.15 : -0.15 };
    }
    function syncSexButtons(){
      var g = voiceGender(currentVoice());
      [[womanBtn, "f"], [manBtn, "m"]].forEach(function(p){
        p[0].classList.toggle("on", g === p[1]); p[0].setAttribute("aria-pressed", g === p[1] ? "true" : "false");
      });
    }
    function fillVoices(){
      var vs = sortedVoices(), key = vs.map(function(v){ return v.name; }).join("\n");
      voiceSel.innerHTML = voiceOptions(vs, voiceName) || '<option value="">Default voice</option>';
      womanBtn.hidden = !bestVoice("f"); manBtn.hidden = !bestVoice("m");
      syncSexButtons();
      /* voices can arrive late; redraw the panel when the list really changed */
      if (key !== voiceKey){ voiceKey = key; if (Side.is("voices")) Side.refresh("voices", renderPanel); }
    }
    if (supported){ fillVoices(); speechSynthesis.addEventListener("voiceschanged", fillVoices); }
    function setVoice(name){
      voiceName = name; Store.set("ll_tts_voice", name);
      voiceSel.value = name;
      var narr = $("#ttsNarr"); if (narr) narr.value = name;
      syncSexButtons(); syncHint();
      if (playing) speakCurrent();
    }
    /* ♀ / ♂: the best voice of that gender; pressed again, the next one */
    function pickGender(g){
      var list = gendered(g); if (!list.length) return;
      var cur = currentVoice(), i = cur ? list.indexOf(cur) : -1;
      var lang = docLang(), same = list.filter(function(v){ return langOf(v) === lang; });
      if (i < 0 && same.length) list = same;
      setVoice(list[(i + 1) % list.length].name);
    }

    /* ---- sentence units ---- */
    var SENT = /[^.!?…]+[.!?…]*["”’)»]?\s*/g;
    var CLOSER = { "“": "”", "«": "»", "\"": "\"", "‘": "’" };
    function splitLong(text, base, out, meta){
      /* keep utterances short: some engines cut off after ~15 seconds */
      if (text.length <= 220){ out.push(Object.assign({ start: base, end: base + text.length, text: text }, meta || {})); return; }
      var i = 0;
      while (i < text.length){
        var j = Math.min(text.length, i + 200);
        if (j < text.length){ var k = text.lastIndexOf(" ", j); if (k > i + 60) j = k; }
        out.push(Object.assign({ start: base + i, end: base + j, text: text.slice(i, j) }, meta || {}));
        i = j;
      }
    }
    /* where quoted speech runs in a paragraph, as [open, close] index pairs; a quote left open
       stays speech to the end of the paragraph. Curly and straight doubles, guillemets, and
       single curly quotes only when the opener follows a space and the closer precedes space or
       punctuation, so apostrophes are left alone. A quoted scrap under two characters isn't speech. */
    function quoteSpans(seg){
      var spans = [], open = -1, closer = "", i, c;
      for (i = 0; i < seg.length; i++){
        c = seg.charAt(i);
        if (open < 0){
          if (c === "“" || c === "«" || (c === "\"" && /\S/.test(seg.charAt(i + 1))) ||
              (c === "‘" && (i === 0 || /[\s(\[—–-]/.test(seg.charAt(i - 1))))){ open = i; closer = CLOSER[c]; }
        } else if (c === closer){
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
    function unitsFromText(text, base, out, meta){
      /* paragraphs (blank lines), then sentences, then the quoted speech cut out of each
         sentence as its own unit (dialogue: true, quote marks left out of the text). Offsets are
         relative to base and exact, so highlighting and "read from here" line up. */
      var re = /\n[ \t]*\n/g, last = 0, m;
      var paras = [];
      while ((m = re.exec(text))){ paras.push([last, m.index]); last = m.index + m[0].length; }
      paras.push([last, text.length]);
      paras.forEach(function(p){
        var seg = text.slice(p[0], p[1]), quotes = quoteSpans(seg), parens = parenSpans(seg), before = out.length;
        SENT.lastIndex = 0;
        var sm;
        while ((sm = SENT.exec(seg))){
          var t = sm[0], ss = sm.index + (t.length - t.replace(/^\s+/, "").length), se = sm.index + t.replace(/\s+$/, "").length;
          if (!t.length) SENT.lastIndex++;
          if (se <= ss) continue;
          var pieces = [], pos = ss;
          quotes.forEach(function(q){
            if (q[1] < ss || q[0] >= se) return;
            if (q[0] > pos) pieces.push([pos, Math.min(q[0], se), false]);
            pieces.push([Math.max(q[0] + 1, ss), Math.min(q[1], se), true]);
            pos = Math.min(q[1] + 1, se);
          });
          if (pos < se) pieces.push([pos, se, false]);
          pieces.forEach(function(pc){
            var piece = seg.slice(pc[0], pc[1]);
            var lead = piece.length - piece.replace(/^\s+/, "").length, trail = piece.length - piece.replace(/\s+$/, "").length;
            var core = piece.slice(lead, piece.length - trail);
            if (!/[A-Za-z0-9À-ɏ]/.test(core)) return;
            var a = pc[0] + lead, b = pc[1] - trail;
            var paren = parens.some(function(ps){ return ps[0] <= a && b <= ps[1] + 1; });
            splitLong(core.replace(/\s+/g, " "), base + p[0] + a, out, Object.assign({ dialogue: pc[2], paren: paren }, meta || {}));
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
      blocks.forEach(function(b){
        var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), n, first = null, text = "";
        while ((n = w.nextNode())){ if (!first) first = n; text += n.textContent; }
        if (!first || !text.trim()) return;
        var base = offsetOfNode.get(first);
        if (base === undefined) return;
        unitsFromText(text, base, out, { heading: /^H[1-4]$/.test(b.tagName) });
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
    function utterFor(u, prev, next){
      var x = express(u, { prev: prev, next: next, expr: expr });
      var narr = currentVoice(), v = narr, off = 0;
      if (u.dialogue){ var d = dialogueVoice(narr); v = d.voice; off = d.pitchOffset; }
      var ut = new SpeechSynthesisUtterance(u.text);
      ut.rate = clamp(rate * x.rate, 0.5, 2.5);
      ut.pitch = clamp(pitchPref + (x.pitch - 1) + off, 0.5, 1.6);
      ut.volume = clamp(x.volume, 0.4, 1);
      if (v){ ut.voice = v; ut.lang = v.lang; }
      return { utter: ut, pauseAfter: x.pauseAfter };
    }

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
        var head = Library.headerHeight(), bottom = window.innerHeight - (bar.classList.contains("on") ? bar.offsetHeight : 0);
        if (rect.top < head + 4 || rect.bottom > bottom - 10) revealOffset(u.start, { center: true });
      }
    }

    /* ---- speaking ---- */
    function speakCurrent(){
      if (!units.length || idx < 0 || idx >= units.length){ finish(); return; }
      var u = units[idx], myGen = ++gen;
      clearTimeout(wait); sampleGen++;
      try { speechSynthesis.cancel(); } catch(_){}
      paint(u); ensureVisible(u);
      if (state.mode === "pdf" && u.page && Library.currentPdfPage() !== u.page) Toc.goPdfPage(u.page);
      var s = utterFor(u, units[idx - 1], units[idx + 1]);
      utter = s.utter;
      utter.onend = function(){
        if (myGen !== gen || !playing) return;
        if (idx + 1 >= units.length){ finish(); return; }
        /* a breath between sentences, a longer one after a paragraph; Prev / Next cut it short */
        wait = setTimeout(function(){ if (myGen !== gen || !playing) return; idx++; speakCurrent(); }, s.pauseAfter);
      };
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
      playing = true; playBtn.textContent = "❚❚"; playBtn.setAttribute("aria-label", "Pause");
      speakCurrent();
    }
    function pause(){
      playing = false; gen++; sampleGen++; clearTimeout(wait);
      try { speechSynthesis.cancel(); } catch(_){}
      playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play");
    }
    function finish(){ pause(); paint(null); idx = Math.max(0, units.length - 1); }
    function stop(){
      pause(); paint(null); active = false; units = []; idx = -1;
      bar.classList.remove("on");
      document.body.classList.remove("tts-on");
      if (state.flow === "pages") relayoutPaged();
    }
    function measure(){ if (active) document.documentElement.style.setProperty("--ttsH", bar.offsetHeight + "px"); }
    function startFrom(offset){
      if (!supported){ Marks.toast("Read aloud isn’t available in this browser"); return; }
      if (state.mode !== "doc" && state.mode !== "pdf") return;
      active = true; bar.classList.add("on"); fillVoices();
      document.body.classList.add("tts-on");
      measure();
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

    /* ---- the voices panel ---- */
    function pitchLabel(){ return pitchPref.toFixed(2); }
    function hintText(){
      var narr = currentVoice();
      if (!narr || dialogueName) return dialogueName === "same" ? "Quoted speech is read in the narrator’s voice." : "";
      var d = dialogueVoice(narr), g = voiceGender(narr);
      if (d.voice && d.voice !== narr) return "Auto: " + d.voice.name + " reads the quoted speech.";
      return "Auto: no " + (g === "f" ? "man’s" : g === "m" ? "woman’s" : "second") + " voice for this language, so quoted speech is the narrator pitched " + (d.pitchOffset > 0 ? "higher" : "lower") + ".";
    }
    function syncHint(){ var h = $("#ttsDlgHint"); if (h) h.textContent = hintText(); }
    function exprChips(){
      return [["off", "Off"], ["natural", "Natural"], ["dramatic", "Dramatic"]].map(function(c){
        return '<button class="chip' + (expr === c[0] ? ' on' : '') + '" role="radio" aria-checked="' + (expr === c[0] ? "true" : "false") + '" data-expr="' + c[0] + '">' + c[1] + '</button>';
      }).join("");
    }
    function setExpr(v){
      if (!/^(off|natural|dramatic)$/.test(v)) return;
      expr = v; Store.set("ll_tts_expr", v);
      var chips = $("#ttsExpr");
      if (chips) Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function(c){
        var on = c.dataset.expr === v; c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
      });
      if (playing) speakCurrent();
    }
    function renderPanel(body, foot){
      var vs = sortedVoices();
      body.innerHTML = '<div class="tts-panel">' +
        '<div class="rowline"><label for="ttsNarr">Narrator</label><select id="ttsNarr" class="sel" tabindex="0">' + (voiceOptions(vs, voiceName) || '<option value="">Default voice</option>') + '</select></div>' +
        '<div class="rowline"><label for="ttsDlg">Dialogue</label><select id="ttsDlg" class="sel">' +
          '<option value=""' + (!dialogueName ? ' selected' : '') + '>Auto — the other voice</option>' +
          '<option value="same"' + (dialogueName === "same" ? ' selected' : '') + '>Same as narrator</option>' + voiceOptions(vs, dialogueName) + '</select></div>' +
        '<div class="hint" id="ttsDlgHint">' + esc(hintText()) + '</div>' +
        '<div class="rowline"><label id="ttsExprL">Expression</label><div class="chips" role="radiogroup" aria-labelledby="ttsExprL" id="ttsExpr">' + exprChips() + '</div></div>' +
        '<div class="hint">Natural follows the punctuation and the said-tags around speech; dramatic pushes harder.</div>' +
        '<div class="rowline"><label for="ttsPitch">Pitch</label><input type="range" id="ttsPitch" min="0.7" max="1.3" step="0.05" value="' + pitchPref + '"><span class="val" id="ttsPitchV">' + pitchLabel() + '</span></div>' +
        '</div>';
      foot.innerHTML = '<button class="chip" id="ttsSample">Hear a sample</button>';
      var narr = body.querySelector("#ttsNarr"), dlg = body.querySelector("#ttsDlg"), chips = body.querySelector("#ttsExpr");
      var pitchEl = body.querySelector("#ttsPitch"), pitchV = body.querySelector("#ttsPitchV");
      narr.addEventListener("change", function(){ setVoice(narr.value); });
      dlg.addEventListener("change", function(){ dialogueName = dlg.value; Store.set("ll_tts_dialogue", dialogueName); syncHint(); if (playing) speakCurrent(); });
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
        if (playing) speakCurrent();
      });
      foot.querySelector("#ttsSample").addEventListener("click", sample);
    }
    function openPanel(){ Side.open("voices", "Read-aloud voices", renderPanel); }

    playBtn.addEventListener("click", function(){ if (playing) pause(); else play(); });
    $("#ttsStop").addEventListener("click", stop);
    $("#ttsPrev").addEventListener("click", function(){ if (!units.length) return; idx = Math.max(0, idx - 1); if (playing) speakCurrent(); else { paint(units[idx]); ensureVisible(units[idx]); } });
    $("#ttsNext").addEventListener("click", function(){ if (!units.length) return; idx = Math.min(units.length - 1, idx + 1); if (playing) speakCurrent(); else { paint(units[idx]); ensureVisible(units[idx]); } });
    rateEl.addEventListener("input", function(){
      rate = +rateEl.value; rateV.textContent = rate.toFixed(1) + "×"; Store.set("ll_tts_rate", String(rate));
      if (playing) speakCurrent();
    });
    voiceSel.addEventListener("change", function(){ setVoice(voiceSel.value); });
    womanBtn.addEventListener("click", function(){ pickGender("f"); });
    manBtn.addEventListener("click", function(){ pickGender("m"); });
    voicesBtn.addEventListener("click", openPanel);
    window.addEventListener("resize", measure);
    window.addEventListener("pagehide", function(){ if (supported) try { speechSynthesis.cancel(); } catch(_){} });

    Menu.add({ order: 40, label: function(){ return active ? "Stop reading aloud" : "Read aloud"; }, key: "R", run: function(){ if (active) stop(); else startFrom(); },
               show: function(){ return state.mode === "doc" || state.mode === "pdf"; }, enabled: function(){ return supported; } });
    /* test hook: the pure pieces, and what the panel would choose */
    window.llSpeak = {
      voiceGender: voiceGender, express: express, dialogueVoice: dialogueVoice, bestVoice: bestVoice, sortedVoices: sortedVoices,
      plan: function(text){ var out = []; unitsFromText(String(text || ""), 0, out); return out; },
      settings: function(){ return { voice: voiceName, dialogue: dialogueName, expr: expr, pitch: pitchPref, rate: rate }; },
      openPanel: openPanel, sample: sample
    };
    return { start: startFrom, stop: stop, pause: pause, play: play, isActive: function(){ return active; }, isPlaying: function(){ return playing; },
             units: function(){ return units; }, index: function(){ return idx; }, buildDocUnits: buildDocUnits, openVoices: openPanel, supported: supported };
  })();

  /* ============================================================
     Reading progress + time left, from your measured reading speed
     ============================================================ */
  var Progress = (function(){
    var el = $("#progressInfo"), hideTimer = null;
    var wpm = parseFloat(Store.get("ll_wpm") || "0") || 0;    /* words per minute (text) */
    var ppm = parseFloat(Store.get("ll_ppm") || "0") || 0;    /* pages per minute (pdf) */
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
          if (dt > 0 && dt < 45000 && dw > 0 && dw < 400 && document.visibilityState === "visible"){ sample.words += dw; sample.ms += dt; Stats.noteWords(dw); }
        }
        var left = (1 - frac) * docWords / currentWpm();
        text = Math.round(frac * 100) + "%" + (docWords > 80 ? " \u00B7 " + fmt(left) : "");
      } else {
        var pages = state.pdfDoc ? state.pdfDoc.numPages : 1, page = Library.currentPdfPage();
        if (lastFrac !== null){
          var dt2 = now - lastT, dp = (frac - lastFrac) * (pages - 1);
          if (dt2 > 0 && dt2 < 120000 && dp > 0 && dp < 3 && document.visibilityState === "visible"){ sample.pages += dp; sample.pms += dt2; Stats.notePages(dp); }
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
        if (sample.ms > 60000 && sample.words > 300){ wpm = currentWpm(); Store.set("ll_wpm", wpm.toFixed(0)); }
        if (sample.pms > 60000 && sample.pages > 3){ ppm = currentPpm(); Store.set("ll_ppm", ppm.toFixed(2)); }
      }, 1500);
    }
    return { tick: tick, wpm: currentWpm, ppm: currentPpm, sample: function(){ return sample; }, docWords: function(){ return docWords; } };
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
    function fresh(){ return { v: 1, goal: 10, days: {}, books: {}, best: { streak: 0, day: "" }, notified: "" }; }
    function num(x){ return typeof x === "number" && isFinite(x) && x > 0 ? x : 0; }
    function load(){
      var o = null, out = fresh();
      try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
      if (!o || typeof o !== "object") return out;
      if (GOALS.indexOf(o.goal) >= 0) out.goal = o.goal;
      Object.keys(o.days && typeof o.days === "object" ? o.days : {}).forEach(function(k){
        var d = o.days[k];
        if (!/^\d{4}-\d\d-\d\d$/.test(k) || !d || typeof d !== "object") return;
        out.days[k] = { ms: num(d.ms), words: num(d.words), pages: num(d.pages), docs: Array.isArray(d.docs) ? d.docs.filter(function(x){ return typeof x === "string"; }) : [] };
      });
      Object.keys(o.books && typeof o.books === "object" ? o.books : {}).forEach(function(k){
        var b = o.books[k];
        if (b && typeof b === "object") out.books[k] = { ms: num(b.ms), words: num(b.words), pages: num(b.pages), opened: Math.round(num(b.opened)), finished: !!b.finished };
      });
      if (o.best && typeof o.best === "object") out.best = { streak: Math.round(num(o.best.streak)), day: typeof o.best.day === "string" ? o.best.day : "" };
      if (typeof o.notified === "string") out.notified = o.notified;
      return out;
    }
    /* words and pages arrive in fractions; they are rounded on the way out, never in memory */
    function tidy(k, v){ return k === "words" ? Math.round(v) : k === "pages" ? Math.round(v * 10) / 10 : v; }
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
    function day(key){ return data.days[key] || (data.days[key] = { ms: 0, words: 0, pages: 0, docs: [] }); }
    function book(id){ return data.books[id] || (data.books[id] = { ms: 0, words: 0, pages: 0, opened: 0, finished: false }); }
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
    function noteFinished(b){ if (b && !b.finished && readFrac() >= 0.98){ b.finished = true; touch(); } }
    /* forward reading, as Progress measures it */
    function noteWords(dw){ var b = noteDoc(); if (!b) return; day(todayKey()).words += dw; b.words += dw; lastActive = Date.now(); noteFinished(b); touch(); }
    function notePages(dp){ var b = noteDoc(); if (!b) return; day(todayKey()).pages += dp; b.pages += dp; lastActive = Date.now(); noteFinished(b); touch(); }

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
      if (met(k) && data.notified !== k){ data.notified = k; touch(); Marks.toast("Daily goal reached — " + streak() + "-day streak"); }
    }

    /* ---- active time: 15 s slices while a document is open, the page is visible, and the reader did something in the last 3 minutes
       (read-aloud and auto-scroll count as doing something all the while) ---- */
    function active(){ lastActive = Date.now(); }
    ["scroll", "wheel", "keydown", "pointerdown", "touchstart"].forEach(function(ev){ window.addEventListener(ev, active, { passive: true, capture: true }); });
    if (window.MutationObserver) new MutationObserver(active).observe($("#pgInfo"), { childList: true, characterData: true, subtree: true });
    document.addEventListener("ll:fileopened", function(){ docKey = null; active(); renderWidget(); });
    function busy(){ return Speak.isPlaying() || (Auto.isOn() && !Auto.isPaused()); }
    function tick(){
      var now = Date.now();
      if (docOpen() && document.visibilityState === "visible" && (busy() || now - lastActive <= IDLE)){
        var b = noteDoc();
        day(todayKey()).ms += TICK;
        if (b){ b.ms += TICK; noteFinished(b); }
        touch();
        checkGoal();
      }
      renderWidget();
      refreshPanel();
    }
    updateBest();      /* history brought in from another device or an older goal */
    setInterval(tick, TICK);
    function onMode(mode){
      if (mode === "doc" || mode === "pdf"){ active(); if (!noteDoc()) setTimeout(noteDoc, 600); }
      else docKey = null;
      renderWidget();
    }

    /* ---- words ---- */
    function mins(ms){ return Math.floor(ms / 60000); }
    function dur(ms){ var m = mins(ms), h = Math.floor(m / 60); return h ? h + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min"; }
    function count(x){ return Math.round(x).toLocaleString(); }
    function plural(c, one, many){ return c + " " + (c === 1 ? one : many); }
    function dayLabel(key){ var d = dateOf(key); return WD[d.getDay()] + " " + d.getDate() + " " + MO[d.getMonth()]; }
    function dayTitle(key){ var d = data.days[key]; return dayLabel(key) + " — " + mins(d ? d.ms : 0) + " min"; }
    function weekStart(key){ return addDays(key, -((dateOf(key).getDay() + 6) % 7)); }
    function sum(from, n){ var ms = 0; for (var i = 0; i < n; i++){ var d = data.days[addDays(from, i)]; if (d) ms += d.ms; } return ms; }
    function hasReading(){ return Object.keys(data.days).some(function(k){ var d = data.days[k]; return d.ms > 0 || d.words > 0 || d.pages > 0; }); }
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
        if (s) parts.push(s + "-day streak");
        parts.push(mins(t ? t.ms : 0) + " min today");
        parts.push("goal " + data.goal + " min");
        html = '<button type="button" class="st-widget" title="Reading stats"><span>' + parts.join(" · ") + '</span>' + dots(7, true) + '</button>';
      }
      widget.classList.toggle("show", on);
      if (html !== widgetHtml){ widgetHtml = html; widget.innerHTML = html; }
    }
    if (widget) widget.addEventListener("click", function(e){ if (e.target.closest(".st-widget")) openPanel(); });

    /* ---- panel ---- */
    function row(k, v){ return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
    function renderPanel(body, foot){
      var k = todayKey(), t = data.days[k] || { ms: 0, words: 0, pages: 0 }, goalMs = data.goal * 60000, done = t.ms >= goalMs;
      var s = streak(), left = Math.max(0, Math.ceil((goalMs - t.ms) / 60000)), h = "";
      /* today */
      var also = [plural(Math.round(t.words), "word", "words")];
      if (t.pages >= 1) also.push(plural(Math.round(t.pages), "page", "pages"));
      h += '<section class="st-sec"><div class="label">Today</div><div class="st-today">' +
        '<div class="st-ring" style="--p:' + Math.min(100, Math.round(t.ms / goalMs * 100)) + '%" aria-hidden="true"></div>' +
        '<div><div class="st-big">' + mins(t.ms) + '<span> of ' + data.goal + ' min</span></div>' +
        '<div class="st-sub">' + (done ? "Goal reached" : plural(left, "minute", "minutes") + " to go") + ' · ' + also.join(" · ") + '</div></div></div></section>';
      /* streak */
      h += '<section class="st-sec"><div class="label">Streak</div>' + dots(14) +
        '<div class="st-line">' + (s ? s + "-day streak" : "No streak yet") + (data.best.streak ? ' · best ' + plural(data.best.streak, "day", "days") : '') + '</div>' +
        (done ? '' : '<div class="st-hint">Read ' + plural(left, "more minute", "more minutes") + ' today to ' + (s ? "keep it" : "start one") + '.</div>') + '</section>';
      /* the last four weeks, a bar per day */
      var max = data.goal, keys = [];
      for (var i = 27; i >= 0; i--){ var kk = addDays(k, -i); keys.push(kk); if (data.days[kk]) max = Math.max(max, data.days[kk].ms / 60000); }
      var ws = weekStart(k);
      h += '<section class="st-sec"><div class="label">Last 4 weeks</div><div class="st-chart">' +
        '<div class="st-goal" style="bottom:' + (data.goal / max * 100).toFixed(1) + '%"></div>' +
        keys.map(function(key){
          var m = data.days[key] ? data.days[key].ms / 60000 : 0, pct = m > 0 ? Math.max(3, m / max * 100) : 0;
          return '<div class="st-bar' + (met(key) ? ' met' : '') + '" style="height:' + pct.toFixed(1) + '%" role="img" aria-label="' + dayTitle(key) + '"></div>';
        }).join("") + '</div>' +
        '<div class="st-line">This week ' + dur(sum(ws, 7)) + ' · last week ' + dur(sum(addDays(ws, -7), 7)) + '</div></section>';
      /* all time */
      var all = { ms: 0, words: 0, pages: 0 }, dayKeys = Object.keys(data.days).sort(), ids = Object.keys(data.books);
      dayKeys.forEach(function(key){ var d = data.days[key]; all.ms += d.ms; all.words += d.words; all.pages += d.pages; });
      var finished = ids.filter(function(id){ return data.books[id].finished; }).length, first = dayKeys.length ? dateOf(dayKeys[0]) : null;
      h += '<section class="st-sec"><div class="label">All time</div><dl class="st-grid">' +
        row("Time read", dur(all.ms)) + row("Words", count(all.words)) + row("Pages", count(all.pages)) +
        row("Documents opened", count(ids.length)) + row("Books finished", count(finished)) +
        row("Average speed", Math.round(Progress.wpm()) + " words per minute") +
        row("First day recorded", first ? first.getDate() + " " + MO[first.getMonth()] + " " + first.getFullYear() : "—") + '</dl></section>';
      /* goal */
      h += '<section class="st-sec"><div class="label">Daily goal</div><div class="chips st-goals" role="group" aria-label="Daily goal in minutes">' +
        GOALS.map(function(g){ return '<button type="button" class="chip' + (g === data.goal ? ' on' : '') + '" data-goal="' + g + '" aria-pressed="' + (g === data.goal) + '" aria-label="' + plural(g, "minute", "minutes") + ' a day">' + g + '</button>'; }).join("") +
        '</div><div class="hint">Minutes of reading a day. A day counts toward the streak once the goal is met.</div></section>';
      body.innerHTML = h;
      foot.innerHTML = '<button type="button" class="chip" data-st="export">Export JSON</button><button type="button" class="chip" data-st="reset">Reset…</button>';
    }
    /* redraw in place: the scroll position and the focused chip survive the refresh */
    function refreshPanel(){
      if (!Side.is("stats")) return;
      var body = Side.body, top = body.scrollTop, a = document.activeElement, sel = null;
      if (a && (body.contains(a) || Side.foot.contains(a))) sel = a.dataset.goal ? '[data-goal="' + a.dataset.goal + '"]' : a.dataset.st ? '[data-st="' + a.dataset.st + '"]' : null;
      Side.refresh("stats", renderPanel);
      body.scrollTop = top;
      var again = sel && (body.querySelector(sel) || Side.foot.querySelector(sel));
      if (again) again.focus({ preventScroll: true });
    }
    function openPanel(){ Side.open("stats", "Reading stats", renderPanel); }
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
      var out = { app: "Lamplight", exported: new Date().toISOString(), goal: data.goal, streak: streak(), best: data.best, days: data.days, books: data.books };
      download("lamplight-stats.json", JSON.stringify(out, tidy, 2), "application/json");
    }
    function reset(){
      if (!confirm("Clear all reading stats from this device? This can’t be undone.")) return;
      data = fresh(); docKey = null; dirty = true;
      save(); refreshPanel(); renderWidget();
      Marks.toast("Reading stats cleared");
    }
    Side.body.addEventListener("click", function(e){
      if (!Side.is("stats")) return;
      var b = e.target.closest("button[data-goal]"); if (b) setGoal(+b.dataset.goal);
    });
    Side.foot.addEventListener("click", function(e){
      if (!Side.is("stats")) return;
      var b = e.target.closest("button[data-st]"); if (!b) return;
      if (b.dataset.st === "export") exportJson(); else reset();
    });
    Menu.add({ order: 61, label: "Reading stats", key: "G", run: openPanel });

    function snapshot(){ var o = JSON.parse(JSON.stringify(data, tidy)); o.streak = streak(); o.today = todayKey(); return o; }
    /* for tests and other scripts */
    window.llStats = { onMode: onMode, openPanel: openPanel, snapshot: snapshot, streak: streak, setGoal: setGoal, tick: tick, flush: save };
    return { noteWords: noteWords, notePages: notePages, onMode: onMode, openPanel: openPanel, snapshot: snapshot };
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
      if (!toasted){ toasted = true; Marks.toast("Zen mode — press z or Esc to leave"); }
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
      if (!on || !pagedActive() || e.target.closest("a")) return;
      var sel = window.getSelection();
      if (sel && sel.toString()) return;
      var r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      if (x < 0.35 || x > 0.65) return;
      e.stopImmediatePropagation();
      if (!hinted){ hinted = true; Marks.toast("Press z or Esc to leave zen mode"); }
    }
    $("#docView").addEventListener("click", middleTap);
    $("#pdf").addEventListener("click", middleTap);
    Menu.add({ order: 52, label: function(){ return on ? "Leave zen mode" : "Zen mode"; }, key: "Z", run: toggle, show: docOpen });
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
      return book ? (book.title || book.name) : "";
    }
    function printPdf(){
      var file = currentFile();
      if (!file){ Marks.toast("The PDF isn’t ready to print yet — try again in a moment"); return; }
      var blob = file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
      var url = URL.createObjectURL(blob), win = null;
      try { win = window.open(url, "_blank"); } catch(_){}
      Marks.toast(win ? "Opened the PDF in a new tab — print it from there" : "The browser blocked the new tab — allow pop-ups to print this PDF");
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
    Menu.add({ order: 70, label: "Print…", run: print, show: canPrint });
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
    $("#autoSlower").addEventListener("click", function(){ mult = Math.max(0.3, +(mult - 0.1).toFixed(1)); label(); Store.set("ll_autoscroll", String(mult)); if (on && !paused) run(); });
    $("#autoFaster").addEventListener("click", function(){ mult = Math.min(4, +(mult + 0.1).toFixed(1)); label(); Store.set("ll_autoscroll", String(mult)); if (on && !paused) run(); });
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
    try { tabs = JSON.parse(Store.get(KEY) || "[]"); if (!Array.isArray(tabs)) tabs = []; } catch(_){ tabs = []; }
    tabs = tabs.filter(function(t){ return t && t.id && t.name; }).map(function(t){ return { id: t.id, name: t.name, file: null }; });
    function save(){ try { Store.set(KEY, JSON.stringify(tabs.map(function(t){ return { id: t.id, name: t.name }; }))); } catch(_){} }
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
      if (wasActive) abandonOpen();
      if (wasActive){
        if (tabs.length){ activate(tabs[Math.min(i, tabs.length - 1)].id); }
        else { activeId = null; Library.home(); }
      }
      render();
    }
    function drop(id){ var i = tabs.findIndex(function(x){ return x.id === id; }); if (i >= 0){ tabs.splice(i, 1); save(); render(); } }
    function clear(){ tabs = []; activeId = null; save(); render(); }
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
      if (e.key === "w" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); close(t.dataset.id); }
    });
    document.addEventListener("keydown", function(e){
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab" && tabs.length > 1){
        e.preventDefault();
        var i = tabs.findIndex(function(x){ return x.id === activeId; });
        var n = (i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
        activate(tabs[n].id);
      }
    });
    render();
    return { noteOpen: noteOpen, activate: activate, close: close, drop: drop, clear: clear, addFiles: addFiles, setName: setName, list: function(){ return tabs; }, active: function(){ return activeId; }, render: render };
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
  /* The settings sheet sits in the flow under the bar and sticks there while scrolling. In
     Scroll flow, opening it should push the text down so what was at the top reappears just
     under the sheet, and closing it should pull the text back up; browsers with scroll
     anchoring undo exactly that shift, so the document is put where it belongs afterwards. */
  function setSheet(open){
    var sheet = $("#sheet");
    var was = sheet.classList.contains("open");
    if (open === undefined) open = !was;
    if (open === was) return;
    var paged = document.body.classList.contains("paged"), ref = $("#main");
    var before = ref.getBoundingClientRect().top, h = was ? sheet.offsetHeight : 0;
    sheet.classList.toggle("open", open);
    $("#gear").setAttribute("aria-expanded", open ? "true" : "false");
    sheet.setAttribute("aria-hidden", open ? "false" : "true");
    if (!paged){
      if (open) h = sheet.offsetHeight;
      var wanted = before + (open ? h : -h), actual = ref.getBoundingClientRect().top;
      if (Math.abs(actual - wanted) > 1) window.scrollBy(0, actual - wanted);
    }
  }
  $("#gear").addEventListener("click", function(){
    document.body.classList.remove("hidebar");
    setSheet();
  });

  $("#themeChips").addEventListener("click", function(e){
    var ch = e.target.closest(".chip");
    if (!ch) return;
    if (ch.dataset.new) createCustom(); else selectTheme(ch.dataset.theme);
  });
  function selectTheme(theme){
    state.theme = theme;
    if (customById(theme)) syncCustomUI();
    applyTheme(); AutoTheme.userPicked(theme);
  }
  /* the saved themes changed (new, renamed, copied or deleted): redraw the chips and the day / night lists */
  function customsChanged(){ buildThemeChips(); AutoTheme.syncUI(); }
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
  $("#cRename").addEventListener("click", function(){
    var c = editing(); if (!c) return;
    var name = prompt("Name for this theme", c.name);
    if (name === null) return;
    name = name.trim().slice(0, 60);
    if (!name || name === c.name) return;
    c.name = name; customsChanged(); edited();
  });
  $("#cDup").addEventListener("click", function(){
    var c = editing(); if (!c) return;
    var d = copyCustom(c, customName(c.name + " copy"));
    customsChanged(); selectTheme("c:" + d.id);
    Marks.toast("Copied as “" + d.name + "”");
  });
  $("#cSaveAs").addEventListener("click", function(){
    var c = editing(); if (!c) return;
    var name = prompt("Name for the new theme", customName());
    if (name === null) return;
    var d = copyCustom(c, name.trim().slice(0, 60) || customName());
    customsChanged(); selectTheme("c:" + d.id);
    Marks.toast("Saved as “" + d.name + "”");
  });
  $("#cDel").addEventListener("click", function(){
    var c = editing(); if (!c) return;
    if (!confirm("Delete the theme “" + c.name + "”?")) return;
    state.customs.splice(state.customs.indexOf(c), 1);
    var gone = "c:" + c.id, fallback = isDarkColor(c.bg) ? "dusk" : "day";
    if (state.autoDay === gone) state.autoDay = "day";
    if (state.autoNight === gone) state.autoNight = "dusk";
    customsChanged(); selectTheme(fallback); focusChip(fallback);
  });
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
  window.llThemes = { THEMES: THEMES, CYCLE: CYCLE, groups: themeGroups, contrast: contrast, resolve: resolveTheme, current: currentTheme,
    customs: function(){ return state.customs; }, select: selectTheme, create: createCustom, fix: fixContrast };

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
      setSheet(false);
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
    if (e.key === "Escape"){ setSheet(false); return; }
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
    add("z", "Zen mode (enter / leave)", function(){ Zen.toggle(); }, function(){ return Zen.isOn() || docOpen(); });
    add("a", "Auto-scroll (start / stop)", function(){ if (Auto.isOn()) Auto.stop(); else Auto.start(); }, docOpen);
    add("h", "Library / home", function(){ Library.home(); }, docOpen);
    add("i", "About this text", function(){ About.openPanel(); }, docOpen);
    add("?", "Keyboard shortcuts", function(){ openHelp(); });
    add("g", "Reading stats", function(){ Stats.openPanel(); });
    var extra = [
      ["\u2190 \u2192, PgUp/PgDn, Space", "Turn pages (Pages flow)"], ["Home / End", "First / last page (Pages flow)"],
      ["Ctrl/\u2318+F", "Search"], ["Ctrl/\u2318+Tab", "Next tab"], ["Enter / Shift+Enter", "Next / previous match (in search)"],
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
    var dictMode = Store.get(LS_MODE) || "tap";

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
      /* word parts: a row of tiles, one per prefix / root / suffix, joined by plus signs */
      "#dictCard .parts{display:flex; flex-wrap:wrap; align-items:stretch; gap:6px 4px; margin:2px 0 6px;}",
      "#dictCard .part{",
      "  display:flex; flex-direction:column; align-items:flex-start; min-width:0; max-width:12em;",
      "  padding:6px 9px 7px; border-radius:10px; border:1px solid var(--line);",
      "  background:var(--panel); font:inherit; color:var(--ink); text-align:left;",
      "}",
      "#dictCard button.part{cursor:pointer; border-color:color-mix(in srgb, var(--accent) 45%, var(--line));}",
      "#dictCard button.part:hover{background:color-mix(in srgb, var(--accent) 10%, transparent);}",
      "#dictCard .part .pt{font-family:var(--reader-font); font-size:1.0625rem; line-height:1.2; font-weight:600;}",
      "#dictCard .part .pk{font-size:0.7812rem; line-height:1.3; color:var(--accent); margin-top:1px;}",
      "#dictCard .part .pm{font-size:0.7812rem; line-height:1.35; margin-top:2px;}",
      "#dictCard .part .po{font-size:0.7812rem; line-height:1.3; color:var(--muted); font-style:italic; margin-top:1px;}",
      "#dictCard .plus{align-self:center; color:var(--muted); font-size:0.9375rem; padding:0 1px;}",
      "#dictCard .gloss{font-style:italic; font-size:0.875rem; line-height:1.45; margin:2px 0 4px;}",
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
    /* the card sits over the side panel and the sheet, so while it is open it takes Escape first
       (capture phase) and the layers under it stay as they are */
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape") return;
      if (card.classList.contains("open")){ e.preventDefault(); e.stopImmediatePropagation(); }
      closeCard();
    }, true);

    /* ---------- highlight the tapped word ---------- */
    var hitEl = null;
    function clearHit(){
      if (!hitEl) return;
      var p = hitEl.parentNode;
      if (p){ p.replaceChild(document.createTextNode(hitEl.textContent), hitEl); p.normalize(); }
      hitEl = null;
      Anchor.invalidate();
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
      renderParts(term, res);
    }

    /* ---------- word parts (prefix / root / suffix, see llMorph) ----------
       Drawn under the definition once morph.js and the chunks for the possible stems are
       in; the definition itself never waits for it. */
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
      var token = ++partsToken;
      var words = [term.toLowerCase().replace(/[’]/g, "'")];
      if (res && res.word && words.indexOf(res.word) < 0) words.push(res.word);
      need(["morph"]).then(function(){
        var cands = [];
        words.forEach(function(w){ cands = cands.concat(window.llMorph.candidates(w)); });
        return withWords(cands.concat(cands.map(function(c){ return IRREG[c]; })));
      }).then(function(){
        if (token !== partsToken || !card.classList.contains("open")) return;
        var r = null;
        for (var i = 0; i < words.length && !r; i++) r = window.llMorph.analyse(words[i], partLookup);
        if (!r) return;
        var h = '<div class="sec">Word parts</div><div class="parts">';
        r.parts.forEach(function(p, i){
          if (i) h += '<span class="plus" aria-hidden="true">+</span>';
          /* a base is shown as the word it is (hurry, not the hurri- of "unhurried") */
          var tile = '<span class="pt">' + esc(p.kind === "base" && p.word ? p.word : p.text) + '</span><small class="pk">' + esc(p.kind) + '</small>' +
                     (p.meaning ? '<span class="pm">' + esc(p.meaning) + '</span>' : '') +
                     (p.origin ? '<i class="po">' + esc(p.origin) + '</i>' : '');
          if (p.kind === "base" && p.word) h += '<button type="button" class="part" data-w="' + esc(p.word) + '" title="Look up “' + esc(p.word) + '”">' + tile + '</button>';
          else h += '<span class="part"' + (p.origin ? ' title="' + esc(p.origin) + '"' : '') + '>' + tile + '</span>';
        });
        h += '</div>';
        if (r.gloss) h += '<div class="gloss">so: ' + esc(r.gloss) + '</div>';
        if (r.confidence < 0.5) h += '<div class="note">A guess from the spelling.</div>';
        var box = document.createElement("div");
        box.className = "wordparts";
        box.innerHTML = h;
        box.addEventListener("click", function(e){
          var b = e.target.closest("button.part");
          if (b) defineWord(b.dataset.w);
        });
        inner.appendChild(box);
      }).catch(function(err){ console.warn("Word parts unavailable", err); });
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
        var key = Store.get(LS_KEY) || "";
        if (!key){ if (!askForKey(true)) return; key = Store.get(LS_KEY) || ""; if (!key) return; }
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
        aiBox.querySelector("#dictAiRetry").addEventListener("click", function(){ explainWithAI(sentence, Store.get(LS_KEY) || "", aiBox); });
        aiBox.querySelector("#dictAiKey").addEventListener("click", function(){ if (askForKey(true)) explainWithAI(sentence, Store.get(LS_KEY) || "", aiBox); });
      });
    }
    window.addEventListener("online", function(){ if (currentSentence && card.classList.contains("open")) renderAiButton(currentSentence); });
    window.addEventListener("offline", function(){ var b = inner.querySelector("#dictAiBtn"); if (b) b.parentNode.removeChild(b); });

    function askForKey(keepOpen){
      var k = prompt("Paste an Anthropic API key to enable “Explain with AI”.\n\nIt is stored only on this device and is sent only to api.anthropic.com when you press the button. Leave blank to remove it.", Store.get(LS_KEY) || "");
      if (k === null) return false;
      k = k.trim();
      if (k) Store.set(LS_KEY, k); else Store.remove(LS_KEY);
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

    function inMiddleBand(x){
      if (!document.body.classList.contains("paged")) return true;
      var r = $("#docView").getBoundingClientRect();      /* the strip itself is scrolled sideways */
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
          Store.set(LS_MODE, dictMode);
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
  window.__ll = { need: need, state: state, Library: Library, Marks: Marks, Toc: Toc, Search: Search, Speak: Speak, Progress: Progress, Ruler: Ruler, Auto: Auto, AutoTheme: AutoTheme, Wake: Wake, Tabs: Tabs, Anchor: Anchor, Side: Side, openFile: openFile, openFiles: openFiles, show: show, revealOffset: revealOffset };
  window.Search = Search;
  window.Marks_highlightSelection = function(){ var m = Marks.highlightSelection(); if (m) Marks.toast("Highlighted"); };
  window.Marks_selectionOffsets = Marks.selectionOffsets;

  /* ---------- boot ---------- */
  Prefs.load();
  /* first run on a device that asks for more contrast: start with the high-contrast theme */
  if (!Store.get("ll_prefs") && window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches){
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
    return { register: register, hasToast: function(){ return !!toastEl; } };
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
