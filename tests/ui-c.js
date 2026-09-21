/* UI-C — the understanding card: one tabbed card for words (Meaning · Parts · Translate) and
   sentences (Explain · Simpler · Translate) with a footer of actions on the passage, and a
   two-button selection pill. Roles and keys, lazy panels, the badge and the dot, Copy and
   Say it, contrast of the new tints on the hardest themes, the bottom sheet on a phone.
   Screenshots of every tab at 1200×800 and 390×844 in Day, Dusk, Newsprint and Terminal go
   to $LL_SHOTS (default: the OS temp dir).
     NODE_PATH=$(npm root -g) node tests/ui-c.js */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-ui-c");
fs.mkdirSync(SHOTS, { recursive: true });

/* the browser's translator (ready, on-device) and a speech engine that logs every utterance */
const STUB = `(() => {
  window.Translator = { availability: async () => "available",
    create: async (a) => ({ translate: async (s) => { await new Promise((r) => setTimeout(r, 3)); return "[" + a.targetLanguage + "] " + s; }, destroy(){} }) };
  window.LanguageDetector = { create: async () => ({ detect: async () => [{ detectedLanguage: "en", confidence: 0.9 }] }) };
  const voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true }, { name: "Daniel", lang: "en-GB", localService: true, default: false }];
  window.__spoken = [];
  const synth = { getVoices(){ return voices; }, speak(u){ window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate }); setTimeout(() => u.onend && u.onend({}), 30); },
    cancel(){}, pause(){}, resume(){}, addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
})();`;

const SENTENCE = "Nobody could have predicted the extraordinary consequences of that small, deliberate decision.";

async function textPoint(page, word){
  return page.evaluate((word) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.textContent.indexOf(word) >= 0) break;
    if (!n) return null;
    const i = n.textContent.indexOf(word), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length);
    let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 2 + 120); b = r.getBoundingClientRect();
    return { x: b.left + 3, y: b.top + b.height / 2, right: b.right - 3 };
  }, word);
}
async function tapWord(page, word){
  const pt = await textPoint(page, word);
  await page.waitForTimeout(150);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction((w) => document.getElementById("dictCard").classList.contains("open") && new RegExp("^" + w, "i").test((document.querySelector("#dictCard .term") || {}).textContent || ""), word, { timeout: 30000 });
}
async function holdSentence(page, phrase){
  const pt = await textPoint(page, phrase);
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open") && document.querySelector("#dictCard .quote"), null, { timeout: 20000 });
}
async function selectPhrase(page, phrase){
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForTimeout(200);
  const b = await page.evaluate((phrase) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.textContent.indexOf(phrase) >= 0) break;
    const i = n.textContent.indexOf(phrase), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + phrase.length);
    let bb = r.getBoundingClientRect(); window.scrollBy(0, bb.top - window.innerHeight / 2);
    const rects = Array.from(r.getClientRects()), first = rects[0], last = rects[rects.length - 1];
    return { x1: first.left + 2, y1: first.top + first.height / 2, x2: last.right - 2, y2: last.top + last.height / 2 };
  }, phrase);
  await page.mouse.move(b.x1, b.y1); await page.mouse.down(); await page.mouse.move(b.x2, b.y2, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(350);
}
const tab = (t) => '#dictCard [role=tab][data-tab="' + t + '"]';
const tabState = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#dictCard [role=tab]")).map((b) => ({
  tab: b.dataset.tab, label: b.querySelector("span").textContent, selected: b.getAttribute("aria-selected"), disabled: b.getAttribute("aria-disabled") === "true",
  tabindex: b.tabIndex, badge: (b.querySelector(".bdg") || {}).textContent || null, dot: !!b.querySelector(".dot"), controls: b.getAttribute("aria-controls"),
  panelHidden: document.getElementById(b.getAttribute("aria-controls")).hidden, focused: document.activeElement === b })));
const footer = (page) => page.$$eval("#dictMarkActs button", (bs) => bs.map((b) => b.dataset.m + ":" + b.textContent.trim()));
const theme = (page, k) => page.evaluate((k) => document.querySelector('#themeChips [data-theme="' + k + '"]').click(), k);
/* contrast of an element's text against what is painted behind it (tints are composited over the panel) */
const CONTRAST = `(el, behind) => {
  const parse = (s) => { if (/^color\\(srgb/.test(s)){ const m = s.match(/[\\d.]+/g).map(Number); return { rgb: m.slice(0, 3).map((c) => c * 255), a: m.length > 3 ? m[3] : 1 }; }
    const m = (s.match(/[\\d.]+/g) || [0, 0, 0]).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
  const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const cs = getComputedStyle(el), base = parse(getComputedStyle(behind).backgroundColor).rgb;
  const bg = over(parse(cs.backgroundColor), base), fg = over(parse(cs.color), bg);
  const [x, y] = [lum(fg), lum(bg)]; return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}`;

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); } };

  /* ---------------- desktop ---------------- */
  await guard("desktop", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(STUB);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url.replace(/\/$/, "") }).catch(() => null);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.evaluate(() => { localStorage.setItem("ll_tts_voice", "Daniel"); });

    /* the word card */
    await tapWord(page, "unexpected");
    let tabs = await tabState(page);
    R.check("word card: Meaning · Parts · Translate tabs in a tablist", tabs.map((t) => t.label).join("·") === "Meaning·Parts·Translate" && (await page.$eval("#dictCard [role=tablist]", (l) => l.getAttribute("aria-label"))) === "Word", JSON.stringify(tabs));
    R.check("Meaning is selected, its panel shown, the others hidden (tabpanels labelled by their tabs)", tabs[0].selected === "true" && !tabs[0].panelHidden && tabs[1].panelHidden && tabs[2].panelHidden &&
      (await page.evaluate(() => Array.from(document.querySelectorAll("#dictCard .panel")).every((p) => p.getAttribute("role") === "tabpanel" && document.getElementById(p.getAttribute("aria-labelledby"))))), JSON.stringify(tabs));
    R.check("only the selected tab is in the tab order (roving tabindex)", tabs.map((t) => t.tabindex).join(",") === "0,-1,-1", tabs.map((t) => t.tabindex).join(","));
    await page.waitForFunction((sel) => document.querySelector(sel).getAttribute("aria-disabled") !== "true", tab("parts"), { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#dictCard .tr-slot[data-kind="word"] .tr-out'), null, { timeout: 15000 });
    tabs = await tabState(page);
    R.check("Parts lights up with a badge of 3 once the analysis arrives", !tabs[1].disabled && tabs[1].badge === "3", JSON.stringify(tabs[1]));
    R.check("Translate fills by itself and shows a dot", tabs[2].dot && (await page.evaluate(() => document.querySelector("#dictCard .tr-out").textContent)) === "[es] unexpected", JSON.stringify(tabs[2]));
    R.check("the definition is there meanwhile", /adjective/.test(await page.$eval('#dictPanel-meaning', (p) => p.textContent)));
    R.check("footer: Highlight · Copy · Say it", (await footer(page)).join(",") === "hl:Highlight,copy:Copy,say:Say it", (await footer(page)).join(","));
    await page.click(tab("parts"));
    const parts = await page.evaluate(() => ({ visible: !document.getElementById("dictPanel-parts").hidden && !!document.querySelector("#dictCard .wordparts").offsetParent, n: document.querySelectorAll("#dictCard .wordparts .part").length }));
    R.check("the Parts tab shows the three tiles", parts.visible && parts.n === 3, JSON.stringify(parts));
    await page.click(tab("translate"));
    tabs = await tabState(page);
    R.check("the Translate tab shows the translation and its dot is gone", tabs[2].selected === "true" && !tabs[2].dot && (await page.$eval("#dictCard .tr-out", (e) => !!e.offsetParent && e.textContent === "[es] unexpected")), JSON.stringify(tabs[2]));
    await page.click("#dictMarkActs [data-m=copy]"); await page.waitForTimeout(250);
    const clipTr = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
    await page.click(tab("meaning"));
    await page.click("#dictMarkActs [data-m=copy]"); await page.waitForTimeout(250);
    const clipWord = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
    R.check("Copy takes what the open tab shows: the translation, then the word", clipTr === "[es] unexpected" && clipWord === "unexpected", JSON.stringify({ clipTr, clipWord }));
    await page.click("#dictMarkActs [data-m=say]"); await page.waitForTimeout(150);
    const spoken = await page.evaluate(() => window.__spoken.slice());
    R.check("Say it speaks the word in the narrator's voice", spoken.length === 1 && spoken[0].text === "unexpected" && spoken[0].voice === "Daniel", JSON.stringify(spoken));
    /* keys */
    await page.focus(tab("meaning"));
    await page.keyboard.press("ArrowRight");
    let t1 = await tabState(page);
    await page.keyboard.press("ArrowRight");
    let t2 = await tabState(page);
    await page.keyboard.press("ArrowRight");
    let t3 = await tabState(page);
    R.check("arrow keys move and select: Parts, Translate, then round to Meaning", t1[1].selected === "true" && t1[1].focused && t2[2].selected === "true" && t2[2].focused && t3[0].selected === "true" && t3[0].focused);
    await page.keyboard.press("End"); const tEnd = await tabState(page);
    await page.keyboard.press("Home"); const tHome = await tabState(page);
    R.check("End and Home jump to the last and first tab", tEnd[2].selected === "true" && tHome[0].selected === "true");
    /* highlight from the footer */
    await page.click("#dictMarkActs [data-m=hl]"); await page.waitForTimeout(300);
    const hl = await page.evaluate(() => ({ marks: Array.from(document.querySelectorAll("#doc mark.ll-mark")).map((m) => m.textContent), open: document.getElementById("dictCard").classList.contains("open"), hit: !!document.querySelector("#doc .ll-hit") }));
    R.check("Highlight marks the tapped word in the text and closes the card", hl.marks.length === 1 && hl.marks[0] === "unexpected" && !hl.open && !hl.hit, JSON.stringify(hl));
    /* a plain word: Parts stays dim and the keys skip it */
    await tapWord(page, "chair");
    await page.waitForTimeout(2500);
    tabs = await tabState(page);
    await page.focus(tab("meaning")); await page.keyboard.press("ArrowRight");
    const skip = await tabState(page);
    R.check("a plain word: Parts stays dim, and the arrow keys skip it", tabs[1].disabled && !tabs[1].badge && skip[2].selected === "true", JSON.stringify(tabs[1]) + " -> " + skip.map((t) => t.selected).join(","));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* the sentence card */
    await holdSentence(page, "Nobody could have");
    tabs = await tabState(page);
    const head = await page.evaluate(() => ({ title: document.querySelector("#dictCard .term").textContent, quote: document.querySelector("#dictCard .quote").textContent, label: document.getElementById("dictCard").getAttribute("aria-label") }));
    R.check("sentence card: Explain · Simpler · Translate over the quoted sentence", tabs.map((t) => t.label).join("·") === "Explain·Simpler·Translate" && head.title === "This sentence" && head.quote === SENTENCE, JSON.stringify(head));
    R.check("the Simpler tab carries data-m=simplify", await page.$eval('#dictCard [role=tab][data-m="simplify"]', (b) => b.dataset.tab === "simpler"));
    await page.waitForFunction(() => /main clause/.test(document.getElementById("dictExpl").textContent), null, { timeout: 20000 });
    R.check("Explain is drawn at once, with the AI chip as its last block", await page.evaluate(() => /main clause/.test(document.getElementById("dictExpl").textContent) && !!document.querySelector("#dictPanel-explain #dictAiBtn.go")));
    R.check("Simpler waits for its tab", await page.evaluate(() => document.getElementById("simpBody").children.length === 0));
    R.check("footer: Highlight · Note… · Read from here · Copy", (await footer(page)).join(",") === "hl:Highlight,note:Note…,read:Read from here,copy:Copy", (await footer(page)).join(","));
    await page.click('#dictCard [data-m="simplify"]');
    await page.waitForSelector("#dictCard .simple", { timeout: 30000 });
    const simp = await page.evaluate(() => ({ text: document.querySelector("#dictCard .simple").textContent, chg: document.querySelectorAll("#dictCard .chg").length, acts: Array.from(document.querySelectorAll("#simpActs button")).map((b) => b.textContent.trim()) }));
    R.check("the Simpler tab renders the plainer sentence with its changes, Read aloud and Simplify with AI", /unusual/.test(simp.text) && simp.chg >= 1 && simp.acts.join("|") === "Read aloud|Simplify with AI", JSON.stringify(simp));
    await page.click(tab("translate"));
    await page.waitForSelector('#dictCard .tr-slot[data-kind="sentence"] .tr-out', { timeout: 15000 });
    R.check("the Translate tab shows the sentence translation", /^\[es\] Nobody/.test(await page.$eval("#dictCard .tr-out", (e) => e.textContent)));
    const named = await page.evaluate(() => Array.from(document.querySelectorAll("#dictCard button, #dictPill button")).filter((x) => x.offsetParent !== null && !(x.textContent.trim() || x.getAttribute("aria-label"))).length);
    R.check("every visible button in the card has a name", named === 0, String(named));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    R.check("Escape closes the card", await page.evaluate(() => !document.getElementById("dictCard").classList.contains("open")));

    /* the pill */
    await selectPhrase(page, SENTENCE);
    let pill = await page.$$eval("#dictPill button", (bs) => bs.map((x) => x.dataset.act + ":" + x.textContent.trim()));
    const pillOn = await page.$eval("#dictPill", (p) => p.classList.contains("on"));
    R.check("a sentence selected: the pill has Explain and Highlight only", pillOn && pill.join(",") === "lookup:Explain,mark:Highlight", pill.join(","));
    await selectPhrase(page, "extraordinary");
    pill = await page.$$eval("#dictPill button", (bs) => bs.map((x) => x.dataset.act + ":" + x.textContent.trim()));
    R.check("a word selected: Define and Highlight", pill.join(",") === "lookup:Define,mark:Highlight", pill.join(","));
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await page.waitForTimeout(250);

    /* a long passage: the quote is cut at three lines with Show all */
    const LONG = (SENTENCE + " ").repeat(4).trim();
    await page.evaluate((s) => window.llDict.explainSentence(s), LONG);
    await page.waitForSelector("#dictCard .more", { timeout: 5000 }).catch(() => null);
    const clamp = await page.evaluate(() => { const q = document.getElementById("dictQuote"), m = document.querySelector("#dictCard .more"); const h0 = q.getBoundingClientRect().height; m.click(); return { shown: !m.hidden, h0, h1: q.getBoundingClientRect().height, label: m.textContent, expanded: m.getAttribute("aria-expanded") }; });
    R.check("a long selection is cut at three lines; Show all opens it", clamp.shown && clamp.h1 > clamp.h0 && clamp.label === "Show less" && clamp.expanded === "true", JSON.stringify(clamp));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* the new tints on the hardest themes: selected and idle tabs, the badge, the primary chip, the quote */
    for (const th of ["newsprint", "candle", "terminal", "hidark"]){
      await theme(page, th); await page.waitForTimeout(150);
      await holdSentence(page, "Nobody could have");
      await page.waitForSelector("#dictAiBtn", { timeout: 10000 }).catch(() => null);
      const rs = await page.evaluate((src) => { const c = eval(src), card = document.getElementById("dictCard"); return {
        tabOn: c(document.querySelector("#dictCard [role=tab][aria-selected=true]"), card), tabOff: c(document.querySelector("#dictCard [role=tab]:not([aria-selected=true])"), card),
        go: c(document.getElementById("dictAiBtn"), card), quote: c(document.getElementById("dictQuote"), card), act: c(document.querySelector("#dictMarkActs .act"), card), pill: c(document.querySelector("#dictPill button"), document.getElementById("dictPill")) }; }, CONTRAST);
      await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      await tapWord(page, "misunderstanding");   /* "unexpected" is a highlight now, which a tap leaves alone */
      await page.waitForFunction((sel) => document.querySelector(sel + " .bdg"), tab("parts"), { timeout: 30000 });
      rs.badge = await page.evaluate((src) => eval(src)(document.querySelector("#dictCard .bdg"), document.getElementById("dictCard")), CONTRAST);
      await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      const min = Math.min.apply(null, Object.values(rs));
      R.check(th + ": card text on every tint ≥ 4.5:1", min >= 4.5, JSON.stringify(rs));
    }
    await theme(page, "day");
    R.check("no page errors (desktop)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- phone: a bottom sheet ---------------- */
  await guard("phone", async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(STUB);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await holdSentence(page, "Nobody could have");
    await page.waitForFunction(() => /main clause/.test(document.getElementById("dictExpl").textContent), null, { timeout: 20000 });
    await page.waitForTimeout(350);
    const sheet = await page.evaluate(() => {
      const c = document.getElementById("dictCard"), r = c.getBoundingClientRect(), cs = getComputedStyle(c), grab = c.querySelector(".grab");
      const tabs = Array.from(c.querySelectorAll("[role=tab]")).map((t) => t.getBoundingClientRect());
      return { left: r.left, right: r.right, bottom: r.bottom, height: r.height, radius: cs.borderTopLeftRadius, grab: !!(grab && grab.offsetParent), maxH: cs.maxHeight,
        tabW: tabs.map((t) => Math.round(t.width)), tabH: tabs.map((t) => Math.round(t.height)), scrim: getComputedStyle(document.getElementById("dictScrim")).backgroundColor,
        footH: c.querySelector(".foot").getBoundingClientRect().height, overflow: c.scrollWidth > c.clientWidth + 1 || document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    R.check("phone: the card is a bottom sheet with a grab handle", sheet.left === 0 && Math.round(sheet.right) === 390 && Math.round(sheet.bottom) === 844 && sheet.radius === "16px" && sheet.grab && sheet.height <= 844 * 0.66 + 1, JSON.stringify(sheet));
    R.check("phone: tabs are equal width and 44px tall", Math.max.apply(null, sheet.tabW) - Math.min.apply(null, sheet.tabW) <= 1 && sheet.tabH.every((h) => h === 44), JSON.stringify({ w: sheet.tabW, h: sheet.tabH }));
    R.check("phone: a scrim dims the page; the footer fits in one row; nothing overflows sideways", /0\.18\)$/.test(sheet.scrim) && sheet.footH < 64 && !sheet.overflow, JSON.stringify({ scrim: sheet.scrim, footH: sheet.footH, overflow: sheet.overflow }));
    await page.tap("#dictScrim", { position: { x: 120, y: 120 } }); await page.waitForTimeout(300);
    R.check("phone: a tap on the scrim closes it", await page.evaluate(() => !document.getElementById("dictCard").classList.contains("open")));
    R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- screenshots: every tab, both widths, four themes ---------------- */
  await guard("screenshots", async () => {
    for (const view of [{ name: "desktop", vp: { width: 1200, height: 800 } }, { name: "phone", vp: { width: 390, height: 844 }, mobile: true }]){
      const ctx = await b.newContext(Object.assign({ viewport: view.vp }, view.mobile ? { isMobile: true, hasTouch: true } : {}));
      await ctx.addInitScript(STUB);
      const page = await newPage(ctx, url);
      await openFixture(page, "sample.md");
      for (const th of ["day", "dusk", "newsprint", "terminal"]){
        await theme(page, th); await page.waitForTimeout(150);
        const shot = (n) => page.screenshot({ path: path.join(SHOTS, view.name + "-" + th + "-" + n + ".png") });
        await tapWord(page, "unexpected");
        await page.waitForFunction((sel) => document.querySelector(sel).getAttribute("aria-disabled") !== "true", tab("parts"), { timeout: 30000 });
        await page.waitForFunction(() => document.querySelector("#dictCard .tr-out"), null, { timeout: 15000 });
        await page.waitForTimeout(300); await shot("word-meaning");
        await page.click(tab("parts")); await page.waitForTimeout(200); await shot("word-parts");
        await page.click(tab("translate")); await page.waitForTimeout(200); await shot("word-translate");
        await page.keyboard.press("Escape"); await page.waitForTimeout(300);
        await holdSentence(page, "Nobody could have");
        await page.waitForFunction(() => /main clause/.test(document.getElementById("dictExpl").textContent), null, { timeout: 20000 });
        await page.waitForFunction(() => document.querySelector("#dictCard .tr-out"), null, { timeout: 15000 });
        await page.waitForTimeout(300); await shot("sentence-explain");
        await page.click('#dictCard [data-m="simplify"]');
        await page.waitForSelector("#dictCard .simple", { timeout: 30000 }); await page.waitForTimeout(200); await shot("sentence-simpler");
        await page.click(tab("translate")); await page.waitForTimeout(200); await shot("sentence-translate");
        await page.keyboard.press("Escape"); await page.waitForTimeout(300);
        if (!view.mobile){
          await selectPhrase(page, "extraordinary consequences");
          const r = await page.$eval("#dictPill", (p) => { const b = p.getBoundingClientRect(); return { x: Math.max(0, b.left - 160), y: Math.max(0, b.top - 60), width: b.width + 320, height: b.height + 140 }; });
          await page.screenshot({ path: path.join(SHOTS, view.name + "-" + th + "-pill.png"), clip: r });
          await page.evaluate(() => window.getSelection().removeAllRanges());
          await page.waitForTimeout(250);
        }
      }
      await ctx.close();
    }
    R.check("screenshots taken", fs.readdirSync(SHOTS).filter((f) => /\.png$/.test(f)).length >= 52, String(fs.readdirSync(SHOTS).length));
  });

  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
