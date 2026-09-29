/* Translate: the settings group (Automatic, the Dutch ↔ English pack's row, the two views), the card's translation
   line for a word / sentence / selection (at once, no button), the whole book under or in place of each block in
   shadow roots (offsets, highlights, search and read-aloud units untouched), the cache (reopen, offline), the engine
   fallbacks (MyMemory), the built-in translator's download, right-to-left output, PDFs, and the real Dutch ↔ English
   pack (Bergamot in workers/mt-worker.js, served from this repository) on a Dutch phone without a built-in translator.
   The browser's Translator / LanguageDetector are stubbed (or taken away) before the app loads; the web services are
   answered by page.route.
     NODE_PATH=$(npm root -g) node tests/translate.js        (LL_SHOTS=<dir> for the screenshots) */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-translate");
fs.mkdirSync(SHOTS, { recursive: true });

/* the built-in translator: availability as asked, one translate() per string, a monitor that reports
   a download when the pack is "downloadable"; every create() is counted. o.target: a language chosen in the
   settings before the app starts (the default is Automatic) */
const STUB = (o) => `(function(){
  var o = ${JSON.stringify(o)};
  window.__trCreates = 0;
  if (o.target && !sessionStorage.getItem("__trSet")){ sessionStorage.setItem("__trSet", "1"); localStorage.setItem("ll_tr_to", o.target); localStorage.setItem("ll_tr_v", "2"); }
  if (o.view && !sessionStorage.getItem("__trView")){ sessionStorage.setItem("__trView", "1"); localStorage.setItem("ll_tr_view", o.view); }
  /* a page the test can hide and show again (visibilitychange) */
  window.__vis = "visible";
  try { Object.defineProperty(document, "visibilityState", { get: function(){ return window.__vis; }, configurable: true });
        Object.defineProperty(document, "hidden", { get: function(){ return window.__vis === "hidden"; }, configurable: true }); } catch(_){}
  if (!o.translator){
    /* this Chromium has the real API (no model behind it): take it away to test the fallbacks */
    ["Translator", "LanguageDetector"].forEach(function(k){ try { Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true }); } catch(_){} });
    return;
  }
  window.Translator = {
    availability: async function(){ return o.availability || "available"; },
    create: async function(a){
      window.__trCreates++;
      if (o.availability === "downloadable" && a.monitor){
        var tgt = new EventTarget(); a.monitor(tgt);
        await new Promise(function(r){ setTimeout(r, 60); });
        var e = new Event("downloadprogress"); e.loaded = 0.4; e.total = 1; tgt.dispatchEvent(e);
        await new Promise(function(r){ setTimeout(r, 700); });
      }
      return { translate: async function(s){ await new Promise(function(r){ setTimeout(r, o.delay || 3); }); return "[" + a.targetLanguage + "] " + s; }, destroy: function(){} };
    }
  };
  window.LanguageDetector = { create: async function(){ return { detect: async function(){ return [{ detectedLanguage: "en", confidence: 0.9 }]; } }; } };
})();`;
/* a speech engine that logs every utterance (read aloud in "Translation only") */
const SPEECH = `(function(){
  var voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true }];
  window.__spoken = [];
  var synth = { getVoices: function(){ return voices; }, speak: function(u){ window.__spoken.push(u.text); setTimeout(function(){ if (u.onend) u.onend({}); }, 400); },
    cancel: function(){}, pause: function(){}, resume: function(){}, addEventListener: function(){}, removeEventListener: function(){}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
})();`;

/* the two web services; cross-origin, so the stubbed replies carry CORS headers (and answer the preflight) */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
async function routes(ctx, log){
  await ctx.route("https://api.mymemory.translated.net/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const u = new URL(route.request().url()); log.mm.push(u.searchParams.get("q") + " " + u.searchParams.get("langpair"));
    route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ responseStatus: 200, responseData: { translatedText: "[mm] " + u.searchParams.get("q") } }) });
  });
}
async function textPoint(page, word){
  return page.evaluate((word) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.textContent.indexOf(word) >= 0) break;
    if (!n) return null;
    const i = n.textContent.indexOf(word), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length);
    let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 3); b = r.getBoundingClientRect();
    return { x: b.left + 3, y: b.top + b.height / 2, right: b.right - 3 };
  }, word);
}
async function tapWord(page, word){
  const pt = await textPoint(page, word);
  await page.waitForTimeout(150);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction((w) => document.getElementById("dictCard").classList.contains("open") && new RegExp("^" + w, "i").test((document.querySelector("#dictCard .term") || {}).textContent || ""), word, { timeout: 30000 });
}
/* the card's translation line: hidden, or what it shows */
const line = (page) => page.evaluate(() => {
  const l = document.getElementById("dictTr");
  if (!l) return null;
  const o = l.querySelector(".tr-out"), e = l.querySelector(".tr-eng");
  return { hidden: l.hidden, out: o ? o.textContent : null, lang: o && o.getAttribute("lang"), eng: e ? e.textContent : null, text: l.textContent,
    offer: !!l.querySelector(".tr-offer"), button: !!l.querySelector(".tr-go"), tabs: Array.from(document.querySelectorAll("#dictCard [role=tab]")).map((t) => t.dataset.tab) };
});
const waitLine = (page) => page.waitForSelector("#dictTr .tr-out", { timeout: 30000 });
async function menu(page, re){
  await page.click("#more");
  await page.waitForTimeout(100);
  const labels = await page.$$eval("#moreMenu button", (bs) => bs.map((b) => b.querySelector("span").textContent));
  const hit = labels.find((l) => re.test(l));
  if (hit) await page.evaluate((l) => { Array.from(document.querySelectorAll("#moreMenu button")).find((b) => b.querySelector("span").textContent === l).click(); }, hit);
  else await page.keyboard.press("Escape");
  return { labels, hit };
}
const status = (page) => page.evaluate(() => window.llTranslate ? window.llTranslate.status() : null);
async function waitDone(page, ms){
  await page.waitForFunction(() => { const s = window.llTranslate && window.llTranslate.status(); return s && s.on && !s.running && s.total > 0 && s.done === s.total; }, null, { timeout: ms || 40000 });
  return status(page);
}
/* every block of the document and the translation that follows it */
const blocks = (page) => page.evaluate(() => {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  return Array.from(document.querySelectorAll("#doc p, #doc h1, #doc h2, #doc h3, #doc li, #doc blockquote")).filter((b) => !b.querySelector("p, li") && /[A-Za-z].*[A-Za-z]/.test(b.textContent))
    .map((b) => { const n = b.nextElementSibling, tr = n && n.classList.contains("ll-tr") ? n : null;
      return { text: norm(b.textContent), tr: tr ? norm(tr.shadowRoot.querySelector(".t").textContent) : null, lang: tr && tr.getAttribute("lang"), dir: tr && tr.getAttribute("dir"), light: tr ? tr.textContent : null,
        hidden: b.classList.contains("ll-trsrc"), only: !!(tr && tr.classList.contains("only")), shownH: b.getBoundingClientRect().height }; });
});
const snapshot = (page) => page.evaluate(() => ({
  text: document.getElementById("doc").textContent, len: window.__ll.Anchor.textLength(), units: window.__ll.Speak.buildDocUnits().length,
  marks: Array.from(document.querySelectorAll("#doc mark.ll-mark")).map((m) => m.textContent.replace(/\s+/g, " ").trim())
}));
async function searchCount(page, q){
  await page.keyboard.press("/");
  await page.waitForSelector("#findInput", { timeout: 5000 });
  await page.fill("#findInput", q);
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.Search.results().length);
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  return n;
}
async function theme(page, key){
  await page.evaluate((k) => document.querySelector('#themeChips [data-theme="' + k + '"]').click(), key);
  await page.waitForTimeout(400);
}
async function waitPrecache(page){
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 60000 }).catch(() => null);
  return page.evaluate(async () => {
    for (let i = 0; i < 120; i++){
      const keys = await caches.keys(); const k = keys.filter((x) => /^lamplight-\d/.test(x))[0];
      if (k){ const c = await caches.open(k); const urls = (await c.keys()).map((r) => r.url);
        if (urls.some((u) => /translate\.js$/.test(u)) && urls.some((u) => /mt-worker\.js$/.test(u)) && urls.some((u) => /app\.js$/.test(u)) && urls.filter((u) => /dict\d\.json$/.test(u)).length === 6) return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
}
async function openFile(page, file){
  await page.setInputFiles("#fileInput", file);
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 100, null, { timeout: 30000 });
  await page.waitForTimeout(200);
}
/* a short Dutch book (Couperus, Eline Vere, 1889 — public domain) behind a Project Gutenberg style English header */
const DUTCH = ["The Project Gutenberg eBook of Eline Vere. This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.",
  "# Eline Vere", "## Hoofdstuk I",
  "Men verdrong zich in de, tot kleedkamer ingerichte, eetzaal. Voor een psyché stond Frédérique Van Erlevoort, met loshangende haren, zeer bleek onder een dunne laag poudre-de-riz.",
  "—Haast je dan toch, Paul! We komen niet klaar! zeide ze, een weinig ongeduldig, met een blik op de pendule.",
  "Voor haar knielde Paul Van Raat, en zijn vingers plooiden een langen, ijlen sluier, van goud en karmozijn, als een draperie om haar middel.",
  "—Klaar! sprak Marie.", "Nee.",
  "Het regende al de hele ochtend toen Sanne haar fiets tegen het hek van de school zette. Ze was te laat, weer, en ze wist dat meneer De Vries er iets van zou zeggen.",
  "‘Heb je je huiswerk eigenlijk wel gemaakt?’ vroeg haar moeder, zonder op te kijken van haar telefoon.",
  "‘Ja hoor,’ loog Sanne. Ze pakte een boterham van het aanrecht en liep de deur uit voordat haar moeder nog iets kon vragen.",
  "In de trein naar Utrecht zat een oude man tegenover haar die de hele reis uit het raam staarde, alsof hij iets zocht wat allang verdwenen was."].join("\n\n") + "\n";

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); } };
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });

  /* ---------------- A: the built-in translator is ready (desktop, an English browser) ---------------- */
  await guard("built-in", async () => {
    const log = { mm: [] };
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, locale: "en-US" });
    await ctx.addInitScript(STUB({ translator: true }));
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");

    /* 1. the settings group; Automatic by default; the pack's row and the two views; the hint once the script is in */
    await page.keyboard.press("s"); await page.waitForTimeout(200);
    const group = await page.evaluate(() => { const g = document.getElementById("trGroup"); return g ? { label: g.querySelector(".label").textContent, langs: g.querySelectorAll("#trLang option").length,
      auto: g.querySelector('#trLang option[value="auto"]').textContent, from: (g.querySelector("#trFrom option") || {}).textContent, to: g.querySelector("#trLang").value,
      dl: (g.querySelector("#mtDl") || {}).textContent, views: Array.from(g.querySelectorAll("#trViewChips .chip")).map((c) => c.dataset.trview + ":" + c.getAttribute("aria-checked")) } : null; });
    R.check("Translation group: Into (Automatic + 36 languages) and From", !!group && group.label === "Translation" && group.langs === 37 && group.auto === "Automatic · English" && group.from === "Auto-detect", JSON.stringify(group));
    R.check("Into is Automatic by default", group && group.to === "auto" && (await page.evaluate(() => localStorage.getItem("ll_tr_to"))) === "auto", group && group.to);
    R.check("the pack's row and the two views (Translation only by default)", group && group.dl === "Dutch ↔ English (≈ 50 MB, once)" && group.views.join(",") === "only:true,both:false", JSON.stringify(group));
    await page.selectOption("#trLang", "es");
    await page.evaluate(() => document.getElementById("trGroup").scrollIntoView());
    await page.waitForFunction(() => /Spanish · built-in translator ready/.test(document.getElementById("trHint").textContent), null, { timeout: 15000 }).catch(() => null);
    const hint = await page.$eval("#trHint", (h) => h.textContent);
    R.check("hint: built-in translator ready", /Spanish · built-in translator ready/.test(hint), hint.slice(0, 80));
    R.check("hint carries the privacy line", /run on your device and send nothing anywhere/.test(hint) && /downloaded once from this site/.test(hint) && /MyMemory/.test(hint));
    await shot(page, "translate-settings-desktop-day");
    R.check("choice is remembered", (await page.evaluate(() => localStorage.getItem("ll_tr_to"))) === "es");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* 2. the word card: the translation under the word, at once; no Translate tab, no button */
    await tapWord(page, "quietly");
    await waitLine(page);
    let w = await line(page);
    R.check("word translated at once, under the word", !w.hidden && w.out === "[es] quietly" && w.lang === "es" && !w.button, JSON.stringify(w));
    R.check("engine line says on-device; the card's tabs are Meaning and Parts", /Spanish · translated on-device/.test(w.eng) && w.tabs.join(",") === "meaning,parts", JSON.stringify(w));
    R.check("no pack offer for Spanish", !w.offer);
    await shot(page, "translate-word-desktop-day");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    const sp = await textPoint(page, "Nobody could have");
    await page.mouse.click(sp.x, sp.y, { button: "right" });
    await waitLine(page);
    w = await line(page);
    R.check("sentence card: the translation under the quote", /^\[es\] Nobody could have predicted/.test(w.out) && w.tabs.join(",") === "explain,simpler", JSON.stringify(w).slice(0, 160));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    const pt = await textPoint(page, "extraordinary");
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.right + 80, pt.y, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(() => document.getElementById("dictPill").classList.contains("on"), null, { timeout: 5000 }).catch(() => null);
    const pillBtns = await page.$$eval("#dictPill button", (bs) => bs.map((x) => x.dataset.act + ":" + x.textContent));
    R.check("pill has Explain and Highlight only", pillBtns.join(",") === "lookup:Explain,mark:Highlight", pillBtns.join(","));
    await page.click("#dictPill [data-act=lookup]");
    await waitLine(page);
    const show = await page.evaluate(() => ({ title: document.querySelector("#dictCard .term").textContent, quote: document.querySelector("#dictCard .quote").textContent,
      out: document.querySelector("#dictTr .tr-out").textContent, hl: !!document.querySelector("#dictMarkActs [data-m=hl]"), copy: !!document.querySelector("#dictMarkActs [data-m=copy]") }));
    R.check("a selection: title, original, its translation, Copy and Highlight in the footer", show.title === "This sentence" && /extraordinary/.test(show.quote) && show.out === "[es] " + show.quote && show.hl && show.copy, JSON.stringify(show));
    await page.click("#dictMarkActs [data-m=hl]"); await page.waitForTimeout(300);
    const marks0 = await page.evaluate(() => Array.from(document.querySelectorAll("#doc mark.ll-mark")).map((m) => m.textContent));
    R.check("Highlight from the card marks the selection", marks0.length === 1 && /extraordinary/.test(marks0[0]), marks0.join("|"));

    /* 3. the whole book: Translation only */
    const before = await snapshot(page);
    const hitsBefore = await searchCount(page, "puddles");
    let m = await menu(page, /^Translate book/);
    R.check("menu offers Translate book…", !!m.hit, m.labels.join(" / "));
    await page.waitForFunction(() => document.getElementById("trStatus") && document.getElementById("trStatus").classList.contains("on"), null, { timeout: 15000 }).catch(() => null);
    const pill = await page.evaluate(() => { const s = document.getElementById("trStatus"); return s ? { on: s.classList.contains("on"), text: s.textContent, title: s.title } : null; });
    R.check("status pill: Translating… n % · Pause", !!pill && /Translating… \d+ %/.test(pill.text) && /Pause/.test(pill.text) && /of \d+ paragraphs translated/.test(pill.title), JSON.stringify(pill));
    let st = await waitDone(page);
    R.check("all blocks done", st.done === st.total && st.total >= 30 && st.engine === "builtin" && st.pair === "en|es" && st.view === "only", JSON.stringify(st).slice(0, 200));
    R.check("status pill gone when done", await page.evaluate(() => !document.getElementById("trStatus").classList.contains("on")));
    let bl = await blocks(page);
    R.check("every paragraph and heading has a shadow-root translation", bl.length >= 30 && bl.every((x) => x.tr === "[es] " + x.text), JSON.stringify(bl.filter((x) => x.tr !== "[es] " + x.text).slice(0, 2)));
    R.check("Translation only: each original hidden (no room) behind its translation", bl.every((x) => x.hidden && x.only && x.shownH === 0), JSON.stringify(bl.slice(0, 2)));
    R.check("translations carry lang=es dir=ltr and no light-DOM text", bl.every((x) => x.lang === "es" && x.dir === "ltr" && x.light === ""));
    let after = await snapshot(page);
    R.check("#doc.textContent unchanged", after.text === before.text, after.text.length + " vs " + before.text.length);
    R.check("Anchor.textLength unchanged", after.len === before.len, after.len + " vs " + before.len);
    R.check("the highlight still sits on the same words", after.marks.join("|") === before.marks.join("|") && /extraordinary/.test(after.marks[0]), after.marks.join("|"));
    R.check("read-aloud units unchanged", after.units === before.units, after.units + " vs " + before.units);
    R.check("search finds the same hits", (await searchCount(page, "puddles")) === hitsBefore && hitsBefore >= 1, String(hitsBefore));
    /* the reading position: read off the translation standing in, and found again */
    await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(250);
    const pos = await page.evaluate(() => ({ off: window.__ll.Library.topCharOffset(), y: window.scrollY }));
    await page.evaluate((o) => { window.scrollTo(0, 0); window.__ll.revealOffset(o); }, pos.off); await page.waitForTimeout(200);
    const back = await page.evaluate(() => window.scrollY);
    R.check("reading position in Translation only: an offset in the original, and back to the same place", typeof pos.off === "number" && pos.off > 0 && Math.abs(back - pos.y) < 60, JSON.stringify({ pos, back }));
    /* a tap on a translation shows its original above it; another hides it */
    const hp = await page.evaluate(() => { const h = document.querySelectorAll("#doc .ll-tr.only")[4]; h.scrollIntoView({ block: "center" }); const r = h.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 6 }; });
    await page.waitForTimeout(150);
    await page.mouse.click(hp.x, hp.y); await page.waitForTimeout(250);
    const peek = await page.evaluate(() => { const o = document.querySelector("#doc .ll-trpeek"); return { n: document.querySelectorAll("#doc .ll-trpeek").length, h: o ? o.getBoundingClientRect().height : 0, card: document.getElementById("dictCard").classList.contains("open") }; });
    await shot(page, "translate-only-peek-desktop-day");
    const hp2 = await page.evaluate(() => { const h = document.querySelector("#doc .ll-trpeek").nextElementSibling, r = h.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 6 }; });
    await page.mouse.click(hp2.x, hp2.y); await page.waitForTimeout(250);
    const unpeek = await page.evaluate(() => document.querySelectorAll("#doc .ll-trpeek").length);
    R.check("a tap on a translation shows its original (not the dictionary); a second tap hides it", peek.n === 1 && peek.h > 10 && !peek.card && unpeek === 0, JSON.stringify({ peek, unpeek }));
    /* a right-click (a hold on a phone) does the same; the sentence card stays closed */
    const hp3 = await page.evaluate(() => { const h = document.querySelectorAll("#doc .ll-tr.only")[6]; h.scrollIntoView({ block: "center" }); const r = h.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 6 }; });
    await page.waitForTimeout(150);
    await page.mouse.click(hp3.x, hp3.y, { button: "right" }); await page.waitForTimeout(400);
    const rc = await page.evaluate(() => ({ n: document.querySelectorAll("#doc .ll-trpeek").length, card: document.getElementById("dictCard").classList.contains("open") }));
    const hp4 = await page.evaluate(() => { const h = document.querySelector("#doc .ll-trpeek").nextElementSibling, r = h.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 6 }; });
    await page.mouse.click(hp4.x, hp4.y, { button: "right" }); await page.waitForTimeout(300);
    R.check("a right-click (a hold on a phone) on a translation shows its original too, and no sentence card", rc.n === 1 && !rc.card && (await page.evaluate(() => document.querySelectorAll("#doc .ll-trpeek").length)) === 0, JSON.stringify(rc));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    await shot(page, "translate-only-desktop-day");

    /* 4. Both */
    m = await menu(page, /^Show both languages/);
    R.check("menu: Show both languages", !!m.hit, m.labels.join(" / "));
    await page.waitForTimeout(300);
    bl = await blocks(page);
    R.check("Both: originals shown, each translation under its block", bl.every((x) => !x.hidden && !x.only && x.shownH > 0 && x.tr === "[es] " + x.text), JSON.stringify(bl.slice(0, 1)));
    R.check("the settings' view chips follow", await page.evaluate(() => document.querySelector('#trViewChips [data-trview="both"]').getAttribute("aria-checked") === "true" && localStorage.getItem("ll_tr_view") === "both"));
    const heading = await page.evaluate(() => { const h = document.querySelector("#doc h2"), t = h.nextElementSibling; return t && t.classList.contains("h") && t.classList.contains("h2") && getComputedStyle(t).fontStyle === "normal" && parseFloat(getComputedStyle(t).fontSize) > parseFloat(getComputedStyle(document.getElementById("doc")).fontSize); });
    R.check("a heading's translation follows the heading (not italic, larger)", heading);
    R.check("text unchanged after the change of view", (await snapshot(page)).text === before.text);
    await shot(page, "translate-page-desktop-day");
    await theme(page, "dusk");
    await shot(page, "translate-page-desktop-dusk");
    await theme(page, "day");
    m = await menu(page, /^Show original/);
    R.check("menu entry now says Show original", !!m.hit && !m.labels.some((l) => /^Translate book/.test(l)), m.labels.join(" / "));
    await page.waitForTimeout(300);
    const gone = await page.evaluate(() => document.querySelectorAll("#doc .ll-tr, #doc .ll-trsrc").length);
    R.check("Show original removes every translation", gone === 0 && (await page.evaluate(() => !window.llTranslate.isOn())), String(gone));
    R.check("text unchanged after removal", (await snapshot(page)).text === before.text);
    await page.evaluate(() => window.llTranslate.setView("only"));

    /* 5. the cache: reopened, the book translates without the engine; offline it comes back translated */
    const cached = await waitPrecache(page);
    R.check("service worker precache includes translate.js and workers/mt-worker.js", cached);
    await page.reload({ waitUntil: "load" });
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => window.__ll.Library.currentId(), null, { timeout: 10000 });
    R.check("no Translator.create before asking", (await page.evaluate(() => window.__trCreates)) === 0);
    m = await menu(page, /^Translate book/);
    st = await waitDone(page);
    R.check("cached translation applied at once, no Translator.create", (await page.evaluate(() => window.__trCreates)) === 0 && st.done === st.total, JSON.stringify(st).slice(0, 120));
    bl = await blocks(page);
    R.check("cached blocks match", bl.every((x) => x.tr === "[es] " + x.text && x.hidden));
    await page.waitForTimeout(400);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    R.check("app reloads offline", await page.evaluate(() => !!document.getElementById("openBtn")));
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => document.querySelectorAll("#doc .ll-tr").length > 20, null, { timeout: 15000 }).catch(() => null);
    bl = await blocks(page);
    R.check("offline: a book left translated reopens translated", bl.length > 20 && bl.every((x) => x.tr === "[es] " + x.text && x.hidden), bl.filter((x) => !x.tr).length + " missing of " + bl.length);
    R.check("offline: menu says Show original", (await menu(page, /^$/)).labels.some((l) => /^Show original/.test(l)));
    await ctx.setOffline(false);
    R.check("no page errors (built-in)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- B: no built-in translator → MyMemory for words, at once; nothing for the book ---------------- */
  await guard("fallbacks", async () => {
    const log = { mm: [] };
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, locale: "en-US" });
    await ctx.addInitScript(STUB({ translator: false }));
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    /* an English book for an English reader: no translation line */
    await tapWord(page, "quietly");
    await page.waitForTimeout(800);
    let w = await line(page);
    R.check("a book in the reader's own language: no translation line", w.hidden && !w.out && log.mm.length === 0, JSON.stringify(w));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.evaluate(() => { localStorage.setItem("ll_tr_to", "es"); document.getElementById("trLang").value = "es"; });
    await tapWord(page, "quietly");
    await waitLine(page);
    w = await line(page);
    R.check("MyMemory answers the word at once, no button", w.out === "[mm] quietly" && !w.button && log.mm.length === 1 && /en\|es$/.test(log.mm[0]), JSON.stringify(w) + " " + log.mm.join(","));
    R.check("attribution: by MyMemory (free web service)", /by MyMemory \(free web service\)/.test(w.eng), w.eng);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await menu(page, /^Translate book/);
    await page.waitForFunction(() => document.getElementById("sheet").classList.contains("open") && /MyMemory/.test(document.getElementById("trHint").textContent), null, { timeout: 15000 }).catch(() => null);
    const sheet = await page.evaluate(() => ({ open: document.getElementById("sheet").classList.contains("open"), hint: document.getElementById("trHint").textContent, tr: document.querySelectorAll("#doc .ll-tr").length }));
    R.check("no book engine: the settings open on the Translation group", sheet.open && sheet.tr === 0, JSON.stringify(sheet).slice(0, 120));
    R.check("hint explains what is needed", /words and sentences via MyMemory; use Chrome \/ Edge for whole documents/.test(sheet.hint), sheet.hint.slice(0, 120));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    R.check("no page errors (fallbacks)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- C: a language pack to download; right-to-left output; PDFs ---------------- */
  await guard("download / rtl / pdf", async () => {
    const log = { mm: [] };
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, locale: "en-US" });
    await ctx.addInitScript(STUB({ translator: true, availability: "downloadable", target: "es" }));
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await tapWord(page, "quietly");
    await waitLine(page);
    const w = await line(page);
    R.check("a word waits for no download: MyMemory meanwhile", w.out === "[mm] quietly" && (await page.evaluate(() => window.__trCreates)) === 0, JSON.stringify(w));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.keyboard.press("s"); await page.waitForTimeout(150);
    await page.evaluate(() => window.llTranslate.refreshHint());
    await page.waitForFunction(() => /download/.test(document.getElementById("trHint").textContent), null, { timeout: 5000 }).catch(() => null);
    R.check("hint: needs a download", /needs a download \(about 30 MB\) — Translate book starts it/.test(await page.$eval("#trHint", (h) => h.textContent)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await menu(page, /^Translate book/);
    await page.waitForFunction(() => /Downloading the Spanish translator… [1-9]\d* %/.test((document.getElementById("trStatus") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => null);
    const dl = await page.evaluate(() => (document.getElementById("trStatus") || {}).textContent || "");
    R.check("status shows the download with a percentage", /Downloading the Spanish translator… 40 %/.test(dl), dl);
    let st = await waitDone(page);
    R.check("translated after the download", st.done === st.total && (await page.evaluate(() => window.__trCreates)) === 1, JSON.stringify(st).slice(0, 120));
    /* right-to-left */
    await page.evaluate(() => window.llTranslate.setView("both"));
    await page.keyboard.press("s"); await page.waitForTimeout(150);
    await page.selectOption("#trLang", "ar");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => { const s = window.llTranslate.status(); return s.pair === "en|ar" && s.on && !s.running && s.done === s.total && s.total > 0; }, null, { timeout: 30000 });
    const rtl = await blocks(page);
    R.check("Arabic: every translation is dir=rtl lang=ar", rtl.length >= 30 && rtl.every((x) => x.dir === "rtl" && x.lang === "ar" && x.tr === "[ar] " + x.text), JSON.stringify(rtl[0]));
    const rtlStyle = await page.evaluate(() => { const t = document.querySelector("#doc .ll-tr"); const cs = getComputedStyle(t); return { direction: cs.direction, right: cs.borderRightWidth, left: cs.borderLeftWidth }; });
    R.check("rtl block: rule on the right", rtlStyle.direction === "rtl" && rtlStyle.right === "2px" && rtlStyle.left === "0px", JSON.stringify(rtlStyle));
    /* a PDF */
    await openFixture(page, "sample.pdf");
    const m = await menu(page, /^Translate book/);
    await page.waitForTimeout(400);
    const pdf = await page.evaluate(() => ({ toast: (document.getElementById("toast") || {}).textContent || "", status: !!(document.getElementById("trStatus") && document.getElementById("trStatus").classList.contains("on")), tr: document.querySelectorAll(".ll-tr").length }));
    R.check("PDF: the entry is offered, shows a toast and does nothing else", !!m.hit && /Translate works on text documents; PDFs are not translated yet\./.test(pdf.toast) && !pdf.status && pdf.tr === 0, JSON.stringify(pdf));
    R.check("no page errors (download / rtl / pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- D: a phone; plain text (one text node) split between paragraphs; pause; an EPUB reopened ---------------- */
  await guard("phone / plain text", async () => {
    const log = { mm: [] };
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
    await ctx.addInitScript(STUB({ translator: true, delay: 60, target: "es", view: "both" }));   /* slow enough to pause half-way */
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.txt");
    const before = await snapshot(page);
    const paras = await page.evaluate(() => document.querySelector("#doc .plain").textContent.split(/\n[ \t]*\n/).filter((p) => /[A-Za-z].*[A-Za-z]/.test(p)).length);
    await page.evaluate(() => window.llTranslate ? window.llTranslate.togglePage() : window.__ll.need(["translate"]).then(() => window.llTranslate.togglePage()));
    const st = await waitDone(page);
    const plain = await page.evaluate(() => {
      const div = document.querySelector("#doc .plain"), hosts = Array.from(div.querySelectorAll(".ll-tr"));
      return { hosts: hosts.length, plainClass: hosts.every((h) => h.classList.contains("txt") && !h.classList.contains("plain")), inside: hosts.every((h) => h.parentNode === div),
        first: hosts[0] && hosts[0].shadowRoot.querySelector(".t").textContent, prevText: hosts[0] && hosts[0].previousSibling && hosts[0].previousSibling.textContent.slice(-40) };
    });
    R.check("plain text: one translation per paragraph, inside the div", plain.hosts === paras && st.total === paras && plain.plainClass && plain.inside, JSON.stringify(plain).slice(0, 200));
    R.check("plain text: the first paragraph's translation follows it", /^\[es\] Chapter 1/.test(plain.first || "") && /Chapter 1\n$/.test(plain.prevText || ""), JSON.stringify(plain).slice(0, 200));
    let after = await snapshot(page);
    R.check("plain text: textContent and offsets unchanged", after.text === before.text && after.len === before.len && after.units === before.units, after.len + " vs " + before.len);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    await shot(page, "translate-page-phone-day");
    /* Translation only on plain text: each paragraph's text wrapped in a hidden span, the text itself untouched */
    await page.evaluate(() => window.llTranslate.setView("only"));
    const only = await page.evaluate(() => ({ spans: document.querySelectorAll("#doc .plain span.ll-trsrc").length, h: Array.from(document.querySelectorAll("#doc .plain span.ll-trsrc")).every((s) => s.getBoundingClientRect().height === 0) }));
    after = await snapshot(page);
    R.check("plain text, Translation only: originals wrapped and hidden, text and offsets unchanged", only.spans === paras && only.h && after.text === before.text && after.len === before.len && after.units === before.units, JSON.stringify(only));
    await shot(page, "translate-only-phone-day");
    await theme(page, "dusk");
    await shot(page, "translate-only-phone-dusk");
    await page.evaluate(() => window.llTranslate.showOriginal());
    const merged = await page.evaluate(() => ({ nodes: document.querySelector("#doc .plain").childNodes.length, tr: document.querySelectorAll(".ll-tr, .ll-trsrc").length, text: document.getElementById("doc").textContent }));
    R.check("plain text: Show original merges the text node back", merged.nodes === 1 && merged.tr === 0 && merged.text === before.text, JSON.stringify({ nodes: merged.nodes, tr: merged.tr }));
    /* Pause keeps what has arrived */
    await openFixture(page, "sample.md");
    await page.evaluate(() => { window.llTranslate.togglePage(); });
    await page.waitForFunction(() => { const s = window.llTranslate.status(); return s.running && s.done >= 3; }, null, { timeout: 15000 });
    await page.click("#trStatus .tr-x");
    await page.waitForTimeout(500);
    const c = await status(page);
    const kept = await page.evaluate(() => document.querySelectorAll("#doc .ll-tr").length);
    R.check("Pause stops the work and keeps what arrived", !c.running && c.on && kept >= 3 && kept < c.total && c.missing.length === c.total - c.done, JSON.stringify({ c, kept }).slice(0, 160));
    const m = await menu(page, /^$/);
    R.check("menu: Translate the rest + Show original while incomplete", m.labels.some((l) => /^Translate the rest/.test(l)) && m.labels.some((l) => /^Show original/.test(l)), m.labels.join(" / "));
    await menu(page, /^Translate the rest/);
    const done = await waitDone(page);
    R.check("Translate the rest finishes the book", done.done === done.total && done.missing.length === 0 && (await page.evaluate(() => document.querySelectorAll("#doc .ll-tr").length)) === done.total, JSON.stringify(done).slice(0, 120));
    /* the word card on a phone, dusk (in Both: in Translation only a tap on a paragraph shows its original) */
    await page.evaluate(() => window.llTranslate.setView("both"));
    await tapWord(page, "quietly");
    await waitLine(page);
    await shot(page, "translate-word-phone-dusk");
    await page.keyboard.press("Escape");
    /* an EPUB (opened through the "Unpacking…" status) left translated comes back translated when reopened */
    await openFixture(page, "sample.epub");
    R.check("a new document starts untranslated", (await page.evaluate(() => document.querySelectorAll("#doc .ll-tr").length)) === 0 && !(await page.evaluate(() => window.llTranslate.isOn())));
    await page.evaluate(() => window.llTranslate.togglePage());
    const ep = await waitDone(page);
    await openFixture(page, "sample.txt");
    await openFixture(page, "sample.epub");
    await page.waitForFunction((n) => document.querySelectorAll("#doc .ll-tr").length === n, ep.total, { timeout: 15000 }).catch(() => null);
    const back = await page.evaluate(() => ({ tr: document.querySelectorAll("#doc .ll-tr").length, on: window.llTranslate.isOn() }));
    R.check("EPUB reopened: translated again from the cache", back.tr === ep.total && back.on && ep.total > 10, JSON.stringify({ back, total: ep.total }));
    R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- E: the Dutch ↔ English pack on a Dutch phone with no built-in translator (Chrome on Android) ---------------- */
  await guard("pack", async () => {
    const log = { mm: [] };
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "nl-NL" });
    /* a Dutch phone now gets a Dutch interface (Settings › Reading › App language); this part is about the
       translator for a Dutch reader and reads the English labels, so the interface is set to English */
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_ui_lang", "en"); } catch(_){} });
    await ctx.addInitScript(STUB({ translator: false }));
    await ctx.addInitScript(SPEECH);
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    const dutch = path.join(os.tmpdir(), "lamplight-eline.md");
    fs.writeFileSync(dutch, DUTCH);
    await openFixture(page, "sample.md");

    /* 1. an English book, the pack not there: MyMemory at once, and the pack offered in the card, once */
    await tapWord(page, "quietly");
    await waitLine(page);
    let w = await line(page);
    R.check("pack: English word for a Dutch reader → Dutch via MyMemory, at once", w.out === "[mm] quietly" && w.lang === "nl" && /en\|nl$/.test(log.mm[0] || ""), JSON.stringify(w));
    await page.waitForSelector("#dictTr .tr-offer", { timeout: 5000 }).catch(() => null);
    w = await line(page);
    R.check("the card offers the pack the first time", w.offer && /Download Dutch ↔ English for instant offline translation/.test(w.text), w.text);
    await shot(page, "translate-offer-phone-day");
    await page.click('#dictTr [data-mt="later"]');
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await tapWord(page, "unexpected");
    await waitLine(page); await page.waitForTimeout(500);
    R.check("…and only the first time", !(await line(page)).offer);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* 2. the settings row: download with progress, then ready, offline, removable */
    await page.keyboard.press("s"); await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById("trGroup").scrollIntoView());
    await page.waitForFunction(() => !document.getElementById("mtDl").hidden, null, { timeout: 15000 });
    const row0 = await page.evaluate(() => ({ state: document.getElementById("mtState").textContent, dl: document.getElementById("mtDl").textContent, rm: document.getElementById("mtRm").hidden,
      auto: document.querySelector('#trLang option[value="auto"]').textContent, hint: document.getElementById("trHint").textContent }));
    R.check("pack row: not on this device yet, Dutch ↔ English (≈ 50 MB, once)", /not on this device yet/.test(row0.state) && row0.dl === "Dutch ↔ English (≈ 50 MB, once)" && row0.rm && row0.auto === "Automatic · Dutch", JSON.stringify(row0));
    const seen = [];
    await page.exposeFunction("__seenPct", (v) => seen.push(v));
    await page.evaluate(() => { const p = document.getElementById("mtProgress"); new MutationObserver(() => { if (!p.hidden) window.__seenPct(p.value); }).observe(p, { attributes: true }); });
    const t0 = Date.now();
    await page.click("#mtDl");
    await page.waitForFunction(() => /ready, works offline/.test(document.getElementById("mtState").textContent), null, { timeout: 120000 });
    const row1 = await page.evaluate(async () => ({ state: document.getElementById("mtState").textContent, rm: !document.getElementById("mtRm").hidden, dl: document.getElementById("mtDl").hidden, bar: document.getElementById("mtProgress").hidden,
      files: (await (await caches.open("bergamot-models")).keys()).map((r) => r.url.split("/").slice(-2).join("/")) }));
    R.check("download: progress shown, then ready with Remove", seen.length >= 1 && row1.rm && row1.dl && row1.bar && /Dutch ↔ English · ready, works offline · 50 MB/.test(row1.state), JSON.stringify({ seen: seen.slice(0, 5), row1 }));
    R.check("five files in Cache Storage \"bergamot-models\"", row1.files.length === 5 && row1.files.some((f) => /model\.nlen/.test(f)) && row1.files.some((f) => /model\.ennl/.test(f)) && row1.files.some((f) => /vocab\.nlen/.test(f)) && row1.files.some((f) => /\.wasm$/.test(f)), row1.files.join(", "));
    console.log("  (pack download took " + (Date.now() - t0) + " ms from the local server)");
    await page.waitForFunction(() => /Dutch ↔ English pack ready/.test(document.getElementById("trHint").textContent), null, { timeout: 15000 }).catch(() => null);
    R.check("hint: Dutch · Dutch ↔ English pack ready", /Dutch · Dutch ↔ English pack ready/.test(await page.$eval("#trHint", (h) => h.textContent)), await page.$eval("#trHint", (h) => h.textContent.slice(0, 80)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* 3. words and sentences through the pack */
    let t1 = Date.now();
    await tapWord(page, "extraordinary");
    await waitLine(page);
    w = await line(page);
    const first = Date.now() - t1;
    R.check("pack: a word, in Dutch, on this device", /buitengewo/i.test(w.out) && /Dutch · translated on this device \(Dutch ↔ English pack\)/.test(w.eng) && log.mm.length === 2, JSON.stringify(w) + " mm=" + log.mm.length);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    t1 = Date.now();
    await tapWord(page, "ahead");
    await waitLine(page);
    const again = Date.now() - t1;
    console.log("  (first word through the pack " + first + " ms incl. starting the worker; the next " + again + " ms incl. the card)");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const sp = await textPoint(page, "Nobody could have");
    await page.mouse.click(sp.x, sp.y, { button: "right" });
    await waitLine(page);
    w = await line(page);
    R.check("pack: a sentence", /^Niemand had/.test(w.out) && /voorspellen/.test(w.out), w.out);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* 4. the whole English book into Dutch, Translation only; the page hidden half-way */
    const before = await snapshot(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => { window.llTranslate.togglePage(); });
    await page.waitForFunction(() => { const s = window.llTranslate.status(); return s.running && s.done >= 4; }, null, { timeout: 60000 });
    await page.evaluate(() => { window.__vis = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(1500);
    const h1 = await status(page); await page.waitForTimeout(2000); const h2 = await status(page);
    R.check("hidden page: the work rests", h2.held && h2.running && h2.done === h1.done && h2.done < h2.total, JSON.stringify({ h1: h1.done, h2: h2.done, held: h2.held }));
    await page.evaluate(() => { window.__vis = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    let st = await waitDone(page, 120000);
    R.check("…and carries on when it is back: the book in Dutch through the pack", st.engine === "pack" && st.pair === "en|nl" && st.view === "only" && st.hidden === st.total, JSON.stringify(st).slice(0, 200));
    const rate = st.rate && st.rate.ms ? Math.round(st.rate.chars / st.rate.ms * 1000) : 0;
    console.log("  (book: " + st.total + " paragraphs, " + rate + " characters a second through the pack in this browser)");
    let bl = await blocks(page);
    R.check("every paragraph in Dutch, lang=nl", bl.every((x) => x.lang === "nl" && x.tr && x.tr !== x.text) && bl.some((x) => /lamp/i.test(x.tr)), JSON.stringify(bl.slice(1, 3).map((x) => x.tr)));
    const after = await snapshot(page);
    R.check("pack book: text, offsets and read-aloud units unchanged", after.text === before.text && after.len === before.len && after.units === before.units);
    /* read aloud in Translation only reads the original, and follows it */
    await page.evaluate(() => { const h = document.querySelectorAll("#doc .ll-tr.only")[6]; window.__ll.Speak.start(+h.getAttribute("data-ll-off")); });
    await page.waitForTimeout(1200);
    const spoken = await page.evaluate(() => ({ said: window.__spoken.slice(0, 2), y: window.scrollY }));
    await page.evaluate(() => window.__ll.Speak.stop());
    R.check("read aloud in Translation only reads the original text", spoken.said.length >= 1 && /[a-z]/i.test(spoken.said[0]) && before.text.indexOf(spoken.said[0].slice(0, 20)) >= 0, JSON.stringify(spoken));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    await shot(page, "translate-pack-only-phone-day");

    /* 5. a Dutch book: no line when a word is tapped; the book into English */
    await openFile(page, dutch);
    await tapWord(page, "kleedkamer");
    await page.waitForTimeout(1000);
    w = await line(page);
    R.check("a Dutch book for a Dutch reader: no translation line", w.hidden && !w.out, JSON.stringify(w));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await menu(page, /^Translate book/);
    st = await waitDone(page, 120000);
    R.check("Translate book on a Dutch book (behind an English licence): into English through the pack", st.pair === "nl|en" && st.engine === "pack", JSON.stringify(st).slice(0, 160));
    bl = await page.evaluate(() => Array.from(document.querySelectorAll("#doc .ll-tr")).map((h) => h.shadowRoot.querySelector(".t").textContent));
    R.check("…the dialogue and a short answer come out right", bl.some((t) => /said Marie/.test(t)) && bl.indexOf("No.") >= 0, JSON.stringify(bl.slice(3, 8)));
    await shot(page, "translate-pack-dutch-phone-day");

    /* 6. offline: the translated book, and a word through the pack */
    const cached = await waitPrecache(page);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await openFile(page, dutch);
    await page.waitForFunction(() => document.querySelectorAll("#doc .ll-tr.only").length > 5, null, { timeout: 20000 }).catch(() => null);
    const off = await page.evaluate(() => ({ tr: document.querySelectorAll("#doc .ll-tr.only").length, on: window.llTranslate && window.llTranslate.isOn() }));
    R.check("offline: the Dutch book reopens in English", cached && off.on && off.tr > 5, JSON.stringify(off));
    await openFixture(page, "sample.md");
    await page.evaluate(() => window.llTranslate.showOriginal());
    await tapWord(page, "punctual");
    await waitLine(page);
    w = await line(page);
    R.check("offline: a tapped word through the pack", /pack/.test(w.eng) && w.out && !/\[mm\]/.test(w.out), JSON.stringify(w));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await ctx.setOffline(false);

    /* 7. removing the pack */
    await page.evaluate(() => window.llTranslate.pack.remove());
    const rm = await page.evaluate(async () => ({ has: await caches.has("bergamot-models"), worker: window.llTranslate.pack.state().worker }));
    await page.keyboard.press("s"); await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById("trGroup").scrollIntoView());
    await page.waitForFunction(() => !document.getElementById("mtDl").hidden, null, { timeout: 10000 }).catch(() => null);
    R.check("Remove: the cache and the worker are gone, the download is offered again", !rm.has && !rm.worker && (await page.evaluate(() => !document.getElementById("mtDl").hidden && document.getElementById("mtRm").hidden)), JSON.stringify(rm));
    await page.keyboard.press("Escape");
    R.check("no page errors (pack)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  await b.close();
  server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
