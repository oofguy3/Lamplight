/* The README's screenshots, made from the real app so they never drift from it.
   export NODE_PATH=/opt/node22/lib/node_modules && node tests/screenshots.js  [name ...]
   With no arguments it makes them all; the names are the file names without .png.   */
const path = require("path"), fs = require("fs");
const { serve, browser, newPage, openFixture } = require("./lib");
const OUT = process.env.LL_SHOT_DIR || path.join(__dirname, "..", "docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (n) => !only.length || only.indexOf(n) >= 0;

/* a believable set of voices: two women, two men, one of each "natural", one compact */
const SPEECH = `(() => {
  const V = (name, lang, local, uri) => ({ name, lang, localService: local, default: false, voiceURI: uri || name });
  const voices = [ V("Samantha", "en-US", true, "com.apple.voice.compact.en-US.Samantha"),
                   V("Daniel", "en-GB", true, "com.apple.voice.compact.en-GB.Daniel"),
                   V("Karen", "en-AU", true), V("Microsoft Aria Online (Natural) - English (United States)", "en-US", false),
                   V("Microsoft Guy Online (Natural) - English (United States)", "en-US", false),
                   V("Google UK English Male", "en-GB", false), V("Mónica", "es-ES", true),
                   V("English United States", "en-US", true, "en-us-x-iom#male_2-local") ];
  const synth = { getVoices(){ return voices; }, speak(u){ setTimeout(() => u.onend && u.onend({}), 300); }, cancel(){}, pause(){}, resume(){},
                  addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
})();`;

function dayKey(back){ const d = new Date(); d.setDate(d.getDate() - back); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
/* twelve weeks of reading, speeding up a little, so the trend line has something to say */
const STATS = (() => {
  const days = {};
  for (let i = 83; i >= 0; i--){
    const mins = [0, 12, 18, 22, 15, 9, 30, 11, 14, 0, 25, 16, 19, 8, 21][(i * 7) % 15];
    if (!mins) continue;
    const wpm = Math.round(205 + (83 - i) * 0.45 + ((i * 13) % 11) - 5);
    days[dayKey(i)] = { ms: mins * 60000, words: Math.round(mins * wpm), pages: 0, skimmed: Math.round(mins * 40), listened: 0, wpm, docs: ["a"] };
  }
  return { v: 1, goal: 10, goals: { booksPerYear: 12, pagesPerYear: 0 }, days,
           books: { a: { ms: 3000000, words: 640000, pages: 0, skimmed: 20000, listened: 0, opened: 12, finished: true, finishedAt: Date.now() - 86400000 * 9 },
                    b: { ms: 900000, words: 190000, pages: 0, skimmed: 4000, listened: 0, opened: 2, finished: false, finishedAt: 0 } },
           best: { streak: 9, day: dayKey(3) }, notified: dayKey(0) };
})();

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const made = [];
  const shot = async (page, name, clip) => { await page.waitForTimeout(450); await page.screenshot(Object.assign({ path: path.join(OUT, name + ".png") }, clip ? { clip } : {})); made.push(name); console.log("wrote " + name); };
  const theme = (page, id) => page.evaluate((id) => window.llThemes.select(id), id);
  const desktop = (w, h) => b.newContext({ viewport: { width: w || 1000, height: h || 720 } });
  const phone = () => b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /* ---- the reader itself: a two-page spread ---- */
  if (want("spread")){
    const ctx = await desktop(1280, 820), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "sepia");
    await page.evaluate(() => { const L = window.__ll; L.state.flow = "pages"; L.state.spread = true; L.state.font = "literata"; window.llFonts.use("literata"); });
    await page.evaluate(() => window.llType.apply());
    await page.waitForTimeout(1600);
    await shot(page, "spread");
    await ctx.close();
  }
  /* ---- the start screen: library, pins, the Continue card ---- */
  if (want("library")){
    const ctx = await desktop(1100, 820), page = await newPage(ctx, url);
    await page.setInputFiles("#fileInput", ["sample.md", "sample.epub", "sample.txt", "sample.html"].map((f) => path.join(__dirname, "fixtures", f)));
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 4, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__ll.Library.home());
    await page.waitForTimeout(700);
    await theme(page, "paper");
    /* pin the first book so the Pinned and Recent groups both show */
    await page.evaluate(() => { const p = document.querySelector('#libList [data-pin]'); if (p) p.click(); });
    await page.waitForTimeout(700);
    await shot(page, "library");
    await ctx.close();
  }
  /* ---- highlights and the notes panel, with tags and the legend ---- */
  if (want("notes")){
    const ctx = await desktop(1100, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "linen");
    await page.evaluate(() => {
      const M = window.__ll.Marks;
      M.addHighlight(40, 190); M.addHighlight(420, 560); M.addHighlight(900, 1010);
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__ll.Marks.openPanel());
    await page.waitForTimeout(900);
    await shot(page, "notes");
    await ctx.close();
  }
  /* ---- themes: the sheet's Theme group with the editor open ---- */
  if (want("themes")){
    const ctx = await b.newContext({ viewport: { width: 1000, height: 2200 } }), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "midnight");
    await page.evaluate(() => window.llThemes.create());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.llPop.sheetAt("#themeGroup"));
    await page.waitForTimeout(900);
    const box = await page.evaluate(() => { const a = document.getElementById("themeChips").getBoundingClientRect(), m = document.getElementById("cPrev").getBoundingClientRect();
      return { x: 0, y: Math.max(0, a.top - 40), w: window.innerWidth, h: Math.min(1750, m.bottom - a.top + 60) }; });
    await shot(page, "themes", { x: box.x, y: box.y, width: box.w, height: box.h });
    await ctx.close();
  }
  /* ---- the type popover: size, spacing, width, weight, letters, words ---- */
  if (want("type")){
    const ctx = await desktop(1000, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "day");
    await page.evaluate(() => { window.__ll.state.font = "lexend"; window.llFonts.use("lexend"); window.llType.apply(); });
    await page.waitForTimeout(700);
    await page.click("#gear"); await page.waitForTimeout(400);
    await page.evaluate(() => { const m = document.getElementById("qMore"); if (m) m.open = true; });
    await shot(page, "type");
    await ctx.close();
  }
  /* ---- fonts: the browse panel, every family in its own face ---- */
  if (want("fonts")){
    const ctx = await desktop(1000, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "sepia");
    await page.evaluate(() => { window.__ll.state.font = "literata"; window.llFonts.use("literata"); });
    await page.evaluate(() => window.llFonts.openPanel());
    await page.waitForTimeout(2200);
    await page.evaluate(() => { document.getElementById("sideBody").scrollTop = 0; });
    await shot(page, "fonts");
    await ctx.close();
  }
  /* ---- word parts in the understanding card ---- */
  if (want("wordparts")){
    const ctx = await desktop(1000, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "day");
    const pt = await page.evaluate(() => {
      const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) if (/unexpected/.test(n.textContent)) break;
      const i = n.textContent.indexOf("unexpected"), r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + 2);
      let bb = r.getBoundingClientRect(); window.scrollBy(0, bb.top - 200); bb = r.getBoundingClientRect();
      return { x: bb.left + 2, y: bb.top + bb.height / 2 };
    });
    await page.waitForTimeout(250); await page.mouse.click(pt.x, pt.y);
    await page.waitForSelector('#dictCard [role=tab][data-tab="parts"]:not([aria-disabled="true"])', { timeout: 30000 });
    await page.click('#dictCard [role=tab][data-tab="parts"]');
    await shot(page, "wordparts");
    await ctx.close();
  }
  /* ---- the explainer on a phone ---- */
  if (want("explain-phone")){
    const ctx = await phone(); await ctx.addInitScript(SPEECH);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "dusk");
    await page.evaluate(() => {
      const t = document.getElementById("doc").textContent, i = t.indexOf(". ", 400) + 2, j = t.indexOf(". ", i + 40) + 1;
      window.llDict.explainSentence(t.slice(i, j), { start: i, end: j });
    });
    await page.waitForTimeout(2500);
    await shot(page, "explain-phone");
    await ctx.close();
  }
  /* ---- simplify, at the "for a ten-year-old" strength ---- */
  if (want("simplify")){
    const ctx = await desktop(1000, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "parchment");
    await page.evaluate(() => {
      const t = document.getElementById("doc").textContent, i = t.indexOf(". ", 200) + 2, j = t.indexOf(". ", i + 60) + 1;
      window.llDict.explainSentence(t.slice(i, j), { start: i, end: j });
    });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { const t = document.querySelector('#dictCard [role=tab][data-tab="simpler"]'); if (t) t.click(); });
    await page.waitForTimeout(1600);
    await shot(page, "simplify");
    await ctx.close();
  }
  /* ---- the read-aloud voice picker ---- */
  if (want("voices")){
    const ctx = await desktop(1000, 820); await ctx.addInitScript(SPEECH);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "dusk");
    await page.keyboard.press("r"); await page.waitForTimeout(900);
    await page.click("#ttsVoiceBtn"); await page.waitForTimeout(1100);
    await shot(page, "voices");
    await ctx.close();
  }
  /* ---- about this text ---- */
  if (want("about")){
    const ctx = await desktop(1000, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.epub");
    await theme(page, "sage");
    await page.keyboard.press("i");
    await page.waitForFunction(() => /Flesch/.test(document.getElementById("sideBody").textContent), null, { timeout: 40000 });
    await shot(page, "about");
    await ctx.close();
  }
  /* ---- reading stats, with the speed trend and the yearly goals ---- */
  if (want("stats")){
    const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 } });
    await ctx.addInitScript((s) => { localStorage.setItem("ll_stats", JSON.stringify(s)); }, STATS);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "ocean");
    await page.keyboard.press("g"); await page.waitForTimeout(1100);
    await shot(page, "stats");
    await ctx.close();
  }
  /* ---- the storage panel ---- */
  if (want("storage")){
    const ctx = await b.newContext({ viewport: { width: 1000, height: 1000 } });
    await ctx.addInitScript((s) => { localStorage.setItem("ll_stats", JSON.stringify(s)); }, STATS);
    const page = await newPage(ctx, url);
    await page.setInputFiles("#fileInput", ["sample.md", "sample.epub", "sample.txt"].map((f) => path.join(__dirname, "fixtures", f)));
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 3, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await theme(page, "graphite");
    await page.evaluate(() => window.llStorage.openPanel());
    await page.waitForTimeout(2500);
    await shot(page, "storage");
    await ctx.close();
  }
  /* ---- a translated document ---- */
  if (want("translate")){
    const ctx = await desktop(1000, 760), page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await theme(page, "day");
    await page.evaluate(() => { localStorage.setItem("ll_tr_to", "es"); });
    await page.evaluate(() => window.llTranslate.togglePage());
    await page.waitForTimeout(4000);
    await shot(page, "translate");
    await ctx.close();
  }

  console.log("\n" + made.length + " screenshots in " + OUT);
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
