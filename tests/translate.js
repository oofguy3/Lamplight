/* Translate: the settings group and its hint, the card's Translate tab for a word / sentence / selection, the whole
   document under each block in shadow roots (offsets, highlights, search and read-aloud units
   untouched), the cache (reopen, offline), the engine fallbacks (MyMemory, an Anthropic key),
   the download flow, right-to-left output, PDFs. The browser's Translator / LanguageDetector
   are stubbed before the app loads; the web services are answered by page.route.
     NODE_PATH=$(npm root -g) node tests/translate.js        (LL_SHOTS=<dir> for the screenshots) */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-translate");
fs.mkdirSync(SHOTS, { recursive: true });

/* the built-in translator: availability as asked, one translate() per string, a monitor that reports
   a download when the pack is "downloadable"; every create() is counted */
const STUB = (o) => `(function(){
  var o = ${JSON.stringify(o)};
  window.__trCreates = 0;
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

/* the two web services; cross-origin, so the stubbed replies carry CORS headers (and answer the preflight) */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
async function routes(ctx, log){
  await ctx.route("https://api.mymemory.translated.net/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const u = new URL(route.request().url()); log.mm.push(u.searchParams.get("q") + " " + u.searchParams.get("langpair"));
    route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ responseStatus: 200, responseData: { translatedText: "[mm] " + u.searchParams.get("q") } }) });
  });
  await ctx.route("https://api.anthropic.com/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() || "{}"); log.ai.push(body);
    const content = body.messages[0].content, arr = JSON.parse(content.slice(content.indexOf("\n\n[") + 2));
    route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ content: [{ type: "text", text: "```json\n" + JSON.stringify(arr.map((s) => "[ai] " + s)) + "\n```" }], stop_reason: "end_turn" }) });
  });
}
async function textPoint(page, word){
  return page.evaluate((word) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.textContent.indexOf(word) >= 0) break;
    if (!n) return null;
    const i = n.textContent.indexOf(word), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length);
    let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 2); b = r.getBoundingClientRect();
    return { x: b.left + 3, y: b.top + b.height / 2, right: b.right - 3 };
  }, word);
}
async function tapWord(page, word){
  const pt = await textPoint(page, word);
  await page.waitForTimeout(150);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction((w) => document.getElementById("dictCard").classList.contains("open") && new RegExp("^" + w, "i").test((document.querySelector("#dictCard .term") || {}).textContent || ""), word, { timeout: 30000 });
}
/* the translation lives in the card's Translate tab */
async function openTranslateTab(page){
  await page.waitForSelector('#dictCard [role=tab][data-tab="translate"]', { timeout: 15000 });
  await page.click('#dictCard [role=tab][data-tab="translate"]');
}
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
async function waitDone(page){
  await page.waitForFunction(() => { const s = window.llTranslate && window.llTranslate.status(); return s && s.on && !s.running && s.total > 0 && s.done === s.total; }, null, { timeout: 40000 });
  return status(page);
}
/* every block of the document and what follows it */
const blocks = (page) => page.evaluate(() => {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  return Array.from(document.querySelectorAll("#doc p, #doc h1, #doc h2, #doc h3, #doc li, #doc blockquote")).filter((b) => !b.querySelector("p, li") && /[A-Za-z].*[A-Za-z]/.test(b.textContent))
    .map((b) => { const n = b.nextElementSibling, tr = n && n.classList.contains("ll-tr") ? n : null;
      return { text: norm(b.textContent), tr: tr ? norm(tr.shadowRoot.querySelector(".t").textContent) : null, lang: tr && tr.getAttribute("lang"), dir: tr && tr.getAttribute("dir"), light: tr ? tr.textContent : null }; });
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
        if (urls.some((u) => /translate\.js$/.test(u)) && urls.some((u) => /app\.js$/.test(u)) && urls.filter((u) => /dict\d\.json$/.test(u)).length === 6) return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
}

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); } };
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });

  /* ---------------- A: the built-in translator is ready ---------------- */
  await guard("built-in", async () => {
    const log = { mm: [], ai: [] };
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(STUB({ translator: true }));
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");

    /* 1. the settings group; the hint once the script has loaded */
    await page.keyboard.press("s"); await page.waitForTimeout(200);
    const group = await page.evaluate(() => { const g = document.getElementById("trGroup"); return g ? { label: g.querySelector(".label").textContent, langs: g.querySelectorAll("#trLang option").length, from: (g.querySelector("#trFrom option") || {}).textContent, to: g.querySelector("#trLang").value } : null; });
    R.check("Translation group with both selects", !!group && group.label === "Translation" && group.langs === 36 && group.from === "Auto-detect", JSON.stringify(group));
    R.check("default target is Spanish in an English browser", group && group.to === "es", group && group.to);
    await page.evaluate(() => document.getElementById("trGroup").scrollIntoView());
    await page.waitForFunction(() => /built-in translator ready/.test(document.getElementById("trHint").textContent), null, { timeout: 15000 }).catch(() => null);
    const hint = await page.$eval("#trHint", (h) => h.textContent);
    R.check("hint: built-in translator ready", /Spanish · built-in translator ready/.test(hint), hint.slice(0, 80));
    R.check("hint carries the privacy line", /runs on your device/.test(hint) && /api\.anthropic\.com/.test(hint) && /MyMemory/.test(hint));
    await shot(page, "translate-settings-desktop-day");
    await page.selectOption("#trLang", "es");
    await page.waitForTimeout(200);
    R.check("choice is remembered", (await page.evaluate(() => localStorage.getItem("ll_tr_to"))) === "es");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* 2. the word card's Translate tab fills by itself (a dot until it is opened); the sentence card's; the pill's Explain leads there */
    await tapWord(page, "quietly");
    await page.waitForFunction(() => document.querySelector('#dictCard .tr-slot[data-kind="word"] .tr-out'), null, { timeout: 15000 });
    const dot = await page.evaluate(() => !!document.querySelector('#dictCard [role=tab][data-tab="translate"] .dot'));
    await openTranslateTab(page);
    await page.waitForSelector('#dictCard .tr-slot[data-kind="word"] .tr-out', { timeout: 15000 });
    const word = await page.evaluate(() => ({ out: document.querySelector("#dictCard .tr-slot .tr-out").textContent, eng: document.querySelector("#dictCard .tr-slot .tr-eng").textContent,
      lang: document.querySelector("#dictCard .tr-slot .tr-out").getAttribute("lang"), copy: !!document.querySelector("#dictMarkActs [data-m=copy]"),
      dotGone: !document.querySelector('#dictCard [role=tab][data-tab="translate"] .dot') }));
    R.check("word translated without a press", word.out === "[es] quietly", word.out);
    R.check("engine line says on-device; the tab had a dot until opened; Copy in the footer", /on-device/.test(word.eng) && word.copy && word.lang === "es" && dot && word.dotGone, JSON.stringify(Object.assign({ dot }, word)));
    await shot(page, "translate-word-desktop-day");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    const sp = await textPoint(page, "Nobody could have");
    await page.mouse.click(sp.x, sp.y, { button: "right" });
    await openTranslateTab(page);
    await page.waitForSelector('#dictCard .tr-slot[data-kind="sentence"] .tr-out', { timeout: 20000 });
    const sent = await page.$eval('#dictCard .tr-slot[data-kind="sentence"] .tr-out', (e) => e.textContent);
    R.check("sentence card's Translate tab shows the translation", /^\[es\] Nobody could have predicted/.test(sent), sent.slice(0, 60));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    const pt = await textPoint(page, "extraordinary");
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.right + 80, pt.y, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(() => document.getElementById("dictPill").classList.contains("on"), null, { timeout: 5000 }).catch(() => null);
    const pillBtns = await page.$$eval("#dictPill button", (bs) => bs.map((x) => x.dataset.act + ":" + x.textContent));
    R.check("pill has Explain and Highlight only", pillBtns.join(",") === "lookup:Explain,mark:Highlight", pillBtns.join(","));
    await page.click("#dictPill [data-act=lookup]");
    await openTranslateTab(page);
    await page.waitForSelector('#dictCard .tr-slot[data-kind="sentence"] .tr-out', { timeout: 15000 });
    const show = await page.evaluate(() => ({ title: document.querySelector("#dictCard .term").textContent, quote: document.querySelector("#dictCard .quote").textContent,
      out: document.querySelector("#dictCard .tr-out").textContent, hl: !!document.querySelector("#dictMarkActs [data-m=hl]"), copy: !!document.querySelector("#dictMarkActs [data-m=copy]"),
      tab: document.querySelector("#dictCard [role=tab][aria-selected=true]").dataset.tab }));
    R.check("selection's Translate tab: title, original, translation, Copy and Highlight in the footer", show.title === "This sentence" && show.tab === "translate" && /extraordinary/.test(show.quote) && show.out === "[es] " + show.quote && show.hl && show.copy, JSON.stringify(show));
    await page.click("#dictMarkActs [data-m=hl]"); await page.waitForTimeout(300);
    const marks0 = await page.evaluate(() => Array.from(document.querySelectorAll("#doc mark.ll-mark")).map((m) => m.textContent));
    R.check("Highlight from the translation card marks the selection", marks0.length === 1 && /extraordinary/.test(marks0[0]), marks0.join("|"));

    /* 3. the whole document */
    const before = await snapshot(page);
    const hitsBefore = await searchCount(page, "puddles");
    let m = await menu(page, /^Translate this document/);
    R.check("menu offers Translate this document…", !!m.hit, m.labels.join(" / "));
    await page.waitForFunction(() => document.getElementById("trStatus") && document.getElementById("trStatus").classList.contains("on"), null, { timeout: 15000 }).catch(() => null);
    const pill = await page.evaluate(() => { const s = document.getElementById("trStatus"); return s ? { on: s.classList.contains("on"), text: s.textContent } : null; });
    R.check("status pill: Translating… n of N · Cancel", !!pill && /Translating… \d+ of \d+/.test(pill.text) && /Cancel/.test(pill.text), JSON.stringify(pill));
    let st = await waitDone(page);
    R.check("all blocks done", st.done === st.total && st.total >= 30 && st.engine === "builtin" && st.pair === "en|es", JSON.stringify(st));
    R.check("status pill gone when done", await page.evaluate(() => !document.getElementById("trStatus").classList.contains("on")));
    let bl = await blocks(page);
    R.check("every paragraph and heading has a shadow-root translation", bl.length >= 30 && bl.every((x) => x.tr === "[es] " + x.text), JSON.stringify(bl.filter((x) => x.tr !== "[es] " + x.text).slice(0, 2)));
    R.check("translations carry lang=es dir=ltr and no light-DOM text", bl.every((x) => x.lang === "es" && x.dir === "ltr" && x.light === ""));
    const after = await snapshot(page);
    R.check("#doc.textContent unchanged", after.text === before.text, after.text.length + " vs " + before.text.length);
    R.check("Anchor.textLength unchanged", after.len === before.len, after.len + " vs " + before.len);
    R.check("the highlight still sits on the same words", after.marks.join("|") === before.marks.join("|") && /extraordinary/.test(after.marks[0]), after.marks.join("|"));
    R.check("read-aloud units unchanged", after.units === before.units, after.units + " vs " + before.units);
    const hitsAfter = await searchCount(page, "puddles");
    R.check("search finds the same hits", hitsAfter === hitsBefore && hitsBefore >= 1, hitsBefore + " -> " + hitsAfter);
    const heading = await page.evaluate(() => { const h = document.querySelector("#doc h2"), t = h.nextElementSibling; return t && t.classList.contains("h") && t.classList.contains("h2") && getComputedStyle(t).fontStyle === "normal" && parseFloat(getComputedStyle(t).fontSize) > parseFloat(getComputedStyle(document.getElementById("doc")).fontSize); });
    R.check("a heading's translation follows the heading (not italic, larger)", heading);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await shot(page, "translate-page-desktop-day");
    await theme(page, "dusk");
    await shot(page, "translate-page-desktop-dusk");
    await theme(page, "day");
    m = await menu(page, /^Show original/);
    R.check("menu entry now says Show original", !!m.hit && !m.labels.some((l) => /^Translate th/.test(l)), m.labels.join(" / "));
    await page.waitForTimeout(300);
    const gone = await page.evaluate(() => document.querySelectorAll("#doc .ll-tr").length);
    R.check("Show original removes every translation", gone === 0 && (await page.evaluate(() => !window.llTranslate.isOn())), String(gone));
    R.check("text unchanged after removal", (await snapshot(page)).text === before.text);

    /* 4. the cache: reopened, the document translates without the engine; offline it comes back translated */
    const cached = await waitPrecache(page);
    R.check("service worker precache includes translate.js", cached);
    await page.reload({ waitUntil: "load" });
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => window.__ll.Library.currentId(), null, { timeout: 10000 });
    R.check("no Translator.create before asking", (await page.evaluate(() => window.__trCreates)) === 0);
    R.check("translate.js not loaded until wanted", await page.evaluate(() => !window.llTranslate));
    m = await menu(page, /^Translate this document/);
    st = await waitDone(page);
    R.check("cached translation applied at once, no Translator.create", (await page.evaluate(() => window.__trCreates)) === 0 && st.done === st.total, JSON.stringify(st) + " creates=" + (await page.evaluate(() => window.__trCreates)));
    bl = await blocks(page);
    R.check("cached blocks match", bl.every((x) => x.tr === "[es] " + x.text));
    await page.waitForTimeout(400);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    R.check("app reloads offline", await page.evaluate(() => !!document.getElementById("openBtn")));
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => document.querySelectorAll("#doc .ll-tr").length > 20, null, { timeout: 15000 }).catch(() => null);
    bl = await blocks(page);
    R.check("offline: a document left translated reopens translated", bl.length > 20 && bl.every((x) => x.tr === "[es] " + x.text), bl.filter((x) => !x.tr).length + " missing of " + bl.length);
    R.check("offline: menu says Show original", (await menu(page, /^$/)).labels.some((l) => /^Show original/.test(l)));
    await ctx.setOffline(false);
    await ctx.close();
  });

  /* ---------------- B: no built-in translator, no key → MyMemory for words; a key → Claude for the page ---------------- */
  await guard("fallbacks", async () => {
    const log = { mm: [], ai: [] };
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(STUB({ translator: false }));
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await tapWord(page, "quietly");
    await openTranslateTab(page);
    await page.waitForSelector("#dictCard .tr-slot .tr-go", { timeout: 15000 });
    const label = await page.$eval("#dictCard .tr-slot .tr-go", (b) => b.textContent);
    R.check("without an engine that is ready, a button waits for a press", label === "Translate to Spanish", label);
    await page.waitForTimeout(300);
    R.check("no request before the press", log.mm.length === 0);
    await page.click("#dictCard .tr-slot .tr-go");
    await page.waitForSelector("#dictCard .tr-slot .tr-out", { timeout: 15000 });
    const mm = await page.evaluate(() => ({ out: document.querySelector("#dictCard .tr-out").textContent, eng: document.querySelector("#dictCard .tr-eng").textContent }));
    R.check("MyMemory answers the word", mm.out === "[mm] quietly" && log.mm.length === 1 && /en\|es$/.test(log.mm[0]), JSON.stringify(mm) + " " + log.mm.join(","));
    R.check("attribution: by MyMemory (free web service)", /by MyMemory \(free web service\)/.test(mm.eng), mm.eng);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await menu(page, /^Translate this document/);
    await page.waitForFunction(() => document.getElementById("sheet").classList.contains("open") && /MyMemory/.test(document.getElementById("trHint").textContent), null, { timeout: 15000 }).catch(() => null);
    const sheet = await page.evaluate(() => ({ open: document.getElementById("sheet").classList.contains("open"), hint: document.getElementById("trHint").textContent, tr: document.querySelectorAll("#doc .ll-tr").length }));
    R.check("no page engine: the settings open on the Translation group", sheet.open && sheet.tr === 0, JSON.stringify(sheet).slice(0, 120));
    R.check("hint explains what is needed", /words and sentences via MyMemory; add an Anthropic API key or use Chrome \/ Edge for whole documents/.test(sheet.hint), sheet.hint.slice(0, 120));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    /* a key: the document goes through the Anthropic API in batches */
    await page.evaluate(() => localStorage.setItem("ll_apikey", "sk-ant-test"));
    await page.evaluate(() => document.getElementById("trGroup").scrollIntoView());
    await page.keyboard.press("s"); await page.waitForTimeout(200);
    await page.evaluate(() => window.llTranslate.refreshHint());
    await page.waitForFunction(() => /Anthropic key/.test(document.getElementById("trHint").textContent), null, { timeout: 5000 }).catch(() => null);
    R.check("hint: using your Anthropic key", /Spanish · using your Anthropic key/.test(await page.$eval("#trHint", (h) => h.textContent)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await menu(page, /^Translate this document/);
    const st = await waitDone(page);
    const bodies = log.ai;
    R.check("Anthropic route hit in batches", bodies.length >= 2 && st.engine === "claude", bodies.length + " requests; " + JSON.stringify(st));
    const okBody = bodies.every((bd) => bd.model && bd.max_tokens <= 4000 && Array.isArray(JSON.parse(bd.messages[0].content.slice(bd.messages[0].content.indexOf("\n\n[") + 2))) && /from English into Spanish/.test(bd.messages[0].content));
    R.check("each request: model, capped max_tokens, instruction + JSON array", okBody, JSON.stringify(bodies[0]).slice(0, 160));
    const bl = await blocks(page);
    R.check("Claude's translations applied to every block", bl.length >= 30 && bl.every((x) => x.tr === "[ai] " + x.text));
    R.check("batches stay under about 2500 characters", bodies.every((bd) => JSON.stringify(JSON.parse(bd.messages[0].content.slice(bd.messages[0].content.indexOf("\n\n[") + 2))).length < 3200));
    R.check("no page errors (fallbacks)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- C: a language pack to download; right-to-left output; PDFs ---------------- */
  await guard("download / rtl / pdf", async () => {
    const log = { mm: [], ai: [] };
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(STUB({ translator: true, availability: "downloadable" }));
    await routes(ctx, log);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await tapWord(page, "quietly");
    await openTranslateTab(page);
    await page.waitForFunction(() => /download/.test((document.querySelector("#dictCard .tr-slot .tr-go") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => null);
    const label = await page.$eval("#dictCard .tr-slot .tr-go", (b) => b.textContent).catch(() => "");
    R.check("the button says it will download", /Translate to Spanish \(downloads the translator\)/.test(label), label);
    R.check("no download without a press", (await page.evaluate(() => window.__trCreates)) === 0);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.keyboard.press("s"); await page.waitForTimeout(150);
    await page.evaluate(() => window.llTranslate.refreshHint());
    await page.waitForFunction(() => /download/.test(document.getElementById("trHint").textContent), null, { timeout: 5000 }).catch(() => null);
    R.check("hint: needs a download", /needs a download \(about 30 MB\) — the first translation starts it/.test(await page.$eval("#trHint", (h) => h.textContent)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await menu(page, /^Translate this document/);
    await page.waitForFunction(() => /Downloading the Spanish translator… [1-9]\d* %/.test((document.getElementById("trStatus") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => null);
    const dl = await page.evaluate(() => (document.getElementById("trStatus") || {}).textContent || "");
    R.check("status shows the download with a percentage", /Downloading the Spanish translator… 40 %/.test(dl), dl);
    let st = await waitDone(page);
    R.check("translated after the download", st.done === st.total && (await page.evaluate(() => window.__trCreates)) === 1, JSON.stringify(st));
    /* 7. right-to-left */
    await page.keyboard.press("s"); await page.waitForTimeout(150);
    await page.selectOption("#trLang", "ar");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => { const s = window.llTranslate.status(); return s.pair === "en|ar" && s.on && !s.running && s.done === s.total && s.total > 0; }, null, { timeout: 30000 });
    const rtl = await blocks(page);
    R.check("Arabic: every translation is dir=rtl lang=ar", rtl.length >= 30 && rtl.every((x) => x.dir === "rtl" && x.lang === "ar" && x.tr === "[ar] " + x.text), JSON.stringify(rtl[0]));
    const rtlStyle = await page.evaluate(() => { const t = document.querySelector("#doc .ll-tr"); const cs = getComputedStyle(t); return { direction: cs.direction, right: cs.borderRightWidth, left: cs.borderLeftWidth }; });
    R.check("rtl block: rule on the right", rtlStyle.direction === "rtl" && rtlStyle.right === "2px" && rtlStyle.left === "0px", JSON.stringify(rtlStyle));
    /* 8. a PDF */
    await openFixture(page, "sample.pdf");
    const m = await menu(page, /^Translate this document/);
    await page.waitForTimeout(400);
    const pdf = await page.evaluate(() => ({ toast: (document.getElementById("toast") || {}).textContent || "", status: !!(document.getElementById("trStatus") && document.getElementById("trStatus").classList.contains("on")), tr: document.querySelectorAll(".ll-tr").length }));
    R.check("PDF: the entry is offered, shows a toast and does nothing else", !!m.hit && /Translate works on text documents; PDFs are not translated yet\./.test(pdf.toast) && !pdf.status && pdf.tr === 0, JSON.stringify(pdf));
    R.check("no page errors (download / rtl / pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- D: a phone; plain text (one text node) split between paragraphs; cancel ---------------- */
  await guard("phone / plain text", async () => {
    const log = { mm: [], ai: [] };
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(STUB({ translator: true, delay: 60 }));   /* slow enough to cancel half-way */
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
    const after = await snapshot(page);
    R.check("plain text: textContent and offsets unchanged", after.text === before.text && after.len === before.len && after.units === before.units, after.len + " vs " + before.len);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    await shot(page, "translate-page-phone-day");
    await theme(page, "dusk");
    await shot(page, "translate-page-phone-dusk");
    await page.evaluate(() => window.llTranslate.showOriginal());
    const merged = await page.evaluate(() => ({ nodes: document.querySelector("#doc .plain").childNodes.length, tr: document.querySelectorAll(".ll-tr").length, text: document.getElementById("doc").textContent }));
    R.check("plain text: Show original merges the text node back", merged.nodes === 1 && merged.tr === 0 && merged.text === before.text, JSON.stringify({ nodes: merged.nodes, tr: merged.tr }));
    /* cancel keeps what has arrived */
    await openFixture(page, "sample.md");
    await page.evaluate(() => { window.llTranslate.togglePage(); });
    await page.waitForFunction(() => { const s = window.llTranslate.status(); return s.running && s.done >= 3; }, null, { timeout: 15000 });
    await page.click("#trStatus .tr-x");
    await page.waitForTimeout(400);
    const c = await status(page);
    const kept = await page.evaluate(() => document.querySelectorAll("#doc .ll-tr").length);
    R.check("Cancel stops the work and keeps what arrived", !c.running && c.on && kept >= 3 && kept < c.total && c.missing.length === c.total - c.done, JSON.stringify({ c, kept }).slice(0, 160));
    const m = await menu(page, /^$/);
    R.check("menu: Translate the rest + Show original while incomplete", m.labels.some((l) => /^Translate the rest/.test(l)) && m.labels.some((l) => /^Show original/.test(l)), m.labels.join(" / "));
    await menu(page, /^Translate the rest/);
    const done = await waitDone(page);
    R.check("Translate the rest finishes the document", done.done === done.total && done.missing.length === 0 && (await page.evaluate(() => document.querySelectorAll("#doc .ll-tr").length)) === done.total, JSON.stringify(done));
    /* the word card on a phone, dusk */
    await tapWord(page, "quietly");
    await openTranslateTab(page);
    await page.waitForSelector('#dictCard .tr-slot[data-kind="word"] .tr-out', { timeout: 15000 });
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
    const back = await page.evaluate(() => ({ tr: document.querySelectorAll("#doc .ll-tr").length, on: window.llTranslate.isOn(), creates: window.__trCreates }));
    R.check("EPUB reopened: translated again from the cache", back.tr === ep.total && back.on && ep.total > 10, JSON.stringify({ back, total: ep.total }));
    R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  await b.close();
  server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
