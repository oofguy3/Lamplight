/* The reader shell: the top bar (document buttons, Open only on the start screen, the section
   after the title), the type and theme popovers (desktop popover / phone bottom sheet, Escape
   layering, the t key), the settings sheet's section strip, and the start screen (hero, Continue
   card, tips). Screenshots go to $LL_SHOTS (default: the OS temp dir).
   NODE_PATH=$(npm root -g) node tests/ui-a.js */
const path = require("path"), os = require("os");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || os.tmpdir();

/* a fake speech engine so read-aloud can be exercised headlessly */
const SPEECH_STUB = `(() => {
  const voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true }];
  window.__spoken = [];
  const synth = { getVoices(){ return voices; }, speak(u){ window.__spoken.push(u.text); setTimeout(() => u.onstart && u.onstart({}), 1); setTimeout(() => u.onend && u.onend({}), 400000); },
    cancel(){}, pause(){}, resume(){}, addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
  HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
})();`;

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const section = (t) => console.log("\n" + t);
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); console.log(err.stack); } };
  const rect = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
  const visible = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0; });
  const popOpen = (page) => page.$eval("#pop", (p) => p.classList.contains("open"));
  const sheetOpen = (page) => page.$eval("#sheet", (s) => s.classList.contains("open"));
  const unnamed = (page) => page.evaluate(() => Array.from(document.querySelectorAll("button")).filter((b) => b.offsetParent !== null && !(b.textContent.trim() || b.getAttribute("aria-label") || b.getAttribute("title"))).map((b) => b.id || b.className));
  /* the popover's rows against its padding box: nothing pokes past the edge, nothing scrolls sideways */
  const popFits = (page) => page.evaluate(() => {
    const p = document.getElementById("pop"), r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const padR = r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) + 0.5;
    const rows = Array.from(p.querySelectorAll(".prow, .pop-link")).filter((x) => x.offsetParent !== null);   /* a strip scrolls its chips by design (its own 2px bleed sits under the mask) */
    return { fits: p.scrollWidth <= p.clientWidth && rows.every((x) => x.getBoundingClientRect().right <= padR), sw: p.scrollWidth, cw: p.clientWidth, over: rows.filter((x) => x.getBoundingClientRect().right > padR).map((x) => x.id || x.className) };
  });
  /* a finger drag through the debugger (Playwright's touchscreen only taps) */
  async function touchDrag(page, x1, y1, x2, y2){
    const cdp = await page.context().newCDPSession(page), steps = 8;
    const pt = (x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(x1, y1)] });
    for (let i = 1; i <= steps; i++){ await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps)] }); await page.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(250);
  }

  /* ---------------- the bar ---------------- */
  section("Top bar");
  await guard("bar", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(SPEECH_STUB);
    const page = await newPage(ctx, url);
    R.check("the start screen shows Open in the bar and no document buttons", (await visible(page, "#openBtn")) && !(await visible(page, "#searchBtn")) && !(await visible(page, "#tocBtn")) && (await page.evaluate(() => document.body.dataset.mode === "empty")));
    await openFixture(page, "sample.md");
    R.check("with a document, Open leaves the bar and search / contents / read aloud appear", !(await visible(page, "#openBtn")) && (await visible(page, "#searchBtn")) && (await visible(page, "#tocBtn")) && (await visible(page, "#speakBtn")));
    const sizes = await page.$$eval(".bar .ctl:not(.primary)", (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }));
    R.check("bar buttons are 40x40", sizes.length >= 5 && sizes.every((s) => s === "40x40"), sizes.join(","));
    await page.click("#searchBtn"); await page.waitForTimeout(350);
    R.check("the search button opens the search panel", (await page.$eval("#side", (s) => s.classList.contains("open"))) && (await page.$eval("#sideTitle", (t) => t.textContent)) === "Search");
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    await page.click("#tocBtn"); await page.waitForTimeout(350);
    R.check("the contents button opens the contents panel", (await page.$eval("#sideTitle", (t) => t.textContent)) === "Contents" && (await page.evaluate(() => document.querySelectorAll(".toc-item").length)) >= 4);
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    await page.click("#speakBtn"); await page.waitForTimeout(500);
    R.check("the speaker button starts read aloud and lights up", (await page.$eval("#tts", (t) => t.classList.contains("on"))) && (await page.$eval("#speakBtn", (b) => b.classList.contains("on") && b.getAttribute("aria-pressed") === "true" && /Stop/.test(b.getAttribute("aria-label")))) && (await page.evaluate(() => window.__spoken.length)) >= 1);
    await page.click("#speakBtn"); await page.waitForTimeout(300);
    R.check("the speaker button stops it", !(await page.$eval("#tts", (t) => t.classList.contains("on"))) && (await page.$eval("#speakBtn", (b) => !b.classList.contains("on") && b.getAttribute("aria-pressed") === "false")));
    /* the section after the title */
    await page.evaluate(() => { const h = Array.from(document.querySelectorAll("#doc h1, #doc h2")).find((x) => /Chapter 2/.test(x.textContent)); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 40); });
    await page.waitForTimeout(900);
    const sec = await page.$eval("#fname", (f) => ({ text: f.textContent, sec: f.dataset.sec, after: getComputedStyle(f, "::after").content }));
    R.check("#fname shows \u00B7 Chapter 2 after scrolling into chapter 2, the title text itself untouched", sec.text === "sample.md" && sec.sec === "Chapter 2" && /Chapter 2/.test(sec.after), JSON.stringify(sec));
    await page.keyboard.press("p"); await page.waitForTimeout(500);
    await page.keyboard.press("Home"); await page.waitForTimeout(700);
    const sec1 = await page.$eval("#fname", (f) => f.dataset.sec);
    await page.keyboard.press("End"); await page.waitForTimeout(700);
    const secN = await page.$eval("#fname", (f) => f.dataset.sec);
    R.check("in Pages flow the section follows the page: the title on the first page, the last chapter on the last", sec1 === "The Lamp" && /Chapter \d/.test(secN) && secN !== "Chapter 1", sec1 + " / " + secN);
    await page.keyboard.press("p"); await page.waitForTimeout(400);
    const bad = await unnamed(page);
    R.check("all visible buttons have a name (document open)", bad.length === 0, bad.join(","));
    R.check("no page errors (bar)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- the type popover ---------------- */
  section("Type popover");
  await guard("type", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.click("#gear"); await page.waitForTimeout(250);
    const g = await rect(page, "#gear"), p = await rect(page, "#pop");
    R.check("Aa opens the type popover under the button, right edges aligned", (await popOpen(page)) && (await page.evaluate(() => window.llPop.is("type"))) && p.top > g.bottom && p.top < g.bottom + 16 && Math.abs(p.right - g.right) <= 4, JSON.stringify({ g, p }));
    R.check("the popover is 280–340 wide and the button says it is expanded", p.width >= 280 && p.width <= 340 && (await page.$eval("#gear", (b) => b.getAttribute("aria-expanded") === "true")), String(p.width));
    R.check("focus moved into the popover", await page.evaluate(() => document.activeElement && document.activeElement.id === "qSize"), await page.evaluate(() => document.activeElement && document.activeElement.id));
    const fit = await popFits(page);
    R.check("every row of the type popover ends inside its padding box; nothing scrolls sideways", fit.fits, JSON.stringify(fit));
    const s0 = await page.evaluate(() => window.__ll.state.size);
    await page.$eval("#qSize", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, s0 + 3);
    R.check("the size slider changes state.size and the sheet's slider", (await page.evaluate(() => window.__ll.state.size)) === s0 + 3 && (await page.$eval("#rSize", (r) => +r.value)) === s0 + 3 && (await page.$eval("#qSizeV", (v) => v.textContent)) === (s0 + 3) + " px");
    await page.click("#bigger");
    R.check("A+ still works from the popover", (await page.evaluate(() => window.__ll.state.size)) === s0 + 4 && (await page.$eval("#qSize", (r) => +r.value)) === s0 + 4);
    await page.selectOption("#fontQuick", "lora"); await page.waitForTimeout(100);
    R.check("the font select applies and syncs with the sheet's select", (await page.evaluate(() => window.__ll.state.font)) === "lora" && (await page.$eval("#fontSel", (s) => s.value)) === "lora");
    await page.$eval("#fontSel", (s) => { s.value = "serif"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await page.waitForTimeout(100);
    R.check("the sheet's select syncs back to the popover", (await page.$eval("#fontQuick", (s) => s.value)) === "serif" && (await page.evaluate(() => window.__ll.state.font)) === "serif");
    await page.click('#qFlow [data-flow="pages"]'); await page.waitForTimeout(500);
    R.check("Flow switches to Pages and the segment is marked", (await page.evaluate(() => document.body.classList.contains("paged"))) && (await page.$eval('#qFlow [data-flow="pages"]', (c) => c.getAttribute("aria-pressed") === "true")));
    await page.click('#qFlow [data-flow="scroll"]'); await page.waitForTimeout(400);
    await page.click("#typeMore"); await page.waitForTimeout(700);
    const near = await page.evaluate(() => { const s = document.getElementById("sheet"), g = document.getElementById("textGroup"); return g.getBoundingClientRect().top - s.getBoundingClientRect().top; });
    R.check("All text settings… closes the popover and opens the sheet at the Text group", !(await popOpen(page)) && (await sheetOpen(page)) && near >= 0 && near < 80 && (await page.$eval('#sheetTabs [data-group="textGroup"]', (b) => b.classList.contains("on"))), String(near));
    /* Escape closes only the popover, not the sheet under it; focus returns to the button */
    await page.click("#gear"); await page.waitForTimeout(200);
    R.check("the popover opens over the open sheet", (await popOpen(page)) && (await sheetOpen(page)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    R.check("Escape closes the popover only and returns focus to Aa", !(await popOpen(page)) && (await sheetOpen(page)) && (await page.evaluate(() => document.activeElement && document.activeElement.id === "gear")));
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    R.check("the next Escape closes the sheet", !(await sheetOpen(page)));
    /* the ⋯ menu and the popover close each other */
    await page.click("#more"); await page.waitForTimeout(100);
    await page.click("#gear"); await page.waitForTimeout(100);
    R.check("opening the popover closes the ⋯ menu", (await popOpen(page)) && !(await page.$eval("#moreMenu", (m) => m.classList.contains("open"))));
    await page.click("#more"); await page.waitForTimeout(100);
    R.check("opening the ⋯ menu closes the popover", !(await popOpen(page)) && (await page.$eval("#moreMenu", (m) => m.classList.contains("open"))));
    await page.keyboard.press("Escape");
    await page.click("#gear"); await page.waitForTimeout(100);
    await page.mouse.click(40, 500); await page.waitForTimeout(100);   /* the page margin, not the text */
    R.check("a click outside closes it", !(await popOpen(page)));
    /* a PDF: zoom and soften instead of the text rows */
    await openFixture(page, "sample.pdf");
    await page.click("#gear"); await page.waitForTimeout(250);
    const pdfRows = await page.evaluate(() => ({ label: document.getElementById("qSizeL").textContent, zoom: getComputedStyle(document.getElementById("qZoom")).display !== "none",
      size: getComputedStyle(document.getElementById("qSize")).display === "none", font: getComputedStyle(document.querySelector("#typePop .doc-row")).display === "none",
      soften: getComputedStyle(document.querySelector("#typePop .pdf-row")).display !== "none", flow: getComputedStyle(document.getElementById("qFlow")).display !== "none" }));
    R.check("for a PDF the popover shows Zoom and Soften (no font row) and keeps Flow", pdfRows.label === "Zoom" && pdfRows.zoom && pdfRows.size && pdfRows.font && pdfRows.soften && pdfRows.flow, JSON.stringify(pdfRows));
    await page.$eval("#qZoom", (el) => { el.value = 150; el.dispatchEvent(new Event("input", { bubbles: true })); });
    R.check("the zoom slider mirrors the sheet's", (await page.evaluate(() => window.__ll.state.zoom)) === 1.5 && (await page.$eval("#rZoom", (r) => +r.value)) === 150);
    R.check("the PDF popover fits too", (await popFits(page)).fits, JSON.stringify(await popFits(page)));
    await page.keyboard.press("Escape");
    /* deep in a document, dragging Spacing reflows the text under the window: the popover stays
       (the page's own reflow is not the reader scrolling away), and so does the bar */
    await openFixture(page, "sample.md");
    await page.evaluate(() => { const h = document.documentElement; window.scrollTo(0, 0.6 * (h.scrollHeight - h.clientHeight)); }); await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollBy(0, -200)); await page.waitForTimeout(400);
    const gb = await rect(page, "#gear");
    await page.mouse.click(gb.left + gb.width / 2, gb.top + gb.height / 2); await page.waitForTimeout(250);
    R.check("the popover opens from deep in the document", await popOpen(page));
    const lh = await page.$eval("#qLh", (el) => { const r = el.getBoundingClientRect(), f = (+el.value - +el.min) / (+el.max - +el.min); return { x: r.left + 8 + (r.width - 16) * f, y: r.top + r.height / 2, right: r.right - 2 }; });
    await page.mouse.move(lh.x, lh.y); await page.mouse.down();
    let stayed = true;
    for (let i = 1; i <= 8; i++){ await page.mouse.move(lh.x + (lh.right - lh.x) * i / 8, lh.y); await page.waitForTimeout(60); if (!(await popOpen(page))) stayed = false; }
    await page.mouse.up(); await page.waitForTimeout(200);
    const dragged = await page.evaluate(() => ({ lh: window.__ll.state.lh, hidebar: document.body.classList.contains("hidebar"), open: document.getElementById("pop").classList.contains("open") }));
    R.check("dragging Spacing to its end keeps the popover open and the bar shown", stayed && dragged.open && dragged.lh === 2.1 && !dragged.hidebar, JSON.stringify(dragged));
    await page.selectOption("#fontQuick", "dyslexic");
    await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(300);
    R.check("a font that arrives after the change keeps the popover open too", (await popOpen(page)) && (await page.evaluate(() => window.__ll.state.font)) === "dyslexic");
    await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(200);
    R.check("the reader scrolling away still closes it", !(await popOpen(page)));
    R.check("no page errors (type)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- the theme popover ---------------- */
  section("Theme popover");
  await guard("theme", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.click("#lamp"); await page.waitForTimeout(250);
    const rows = await page.evaluate(() => ({ light: document.querySelectorAll("#qLight .chip").length, dark: document.querySelectorAll("#qDark .chip").length,
      on: Array.from(document.querySelectorAll("#pop .strip .chip[aria-pressed=true]")).map((c) => c.dataset.theme).join(","), auto: document.querySelector('#qAuto .chip[aria-pressed="true"]').dataset.auto }));
    R.check("the lamp opens the theme popover with light and dark rows, the current theme and auto choice marked", (await page.evaluate(() => window.llPop.is("theme"))) && rows.light >= 13 && rows.dark >= 13 && rows.on === "day" && rows.auto === "off", JSON.stringify(rows));
    const bg0 = await page.evaluate(() => document.documentElement.style.getPropertyValue("--bg"));
    await page.click('#qDark .chip[data-theme="ocean"]'); await page.waitForTimeout(100);
    const bg1 = await page.evaluate(() => document.documentElement.style.getPropertyValue("--bg"));
    R.check("picking a swatch applies the theme at once", bg1 !== bg0 && (await page.evaluate(() => window.__ll.state.theme)) === "ocean" && (await page.$eval('#qDark .chip[data-theme="ocean"]', (c) => c.getAttribute("aria-pressed") === "true")), bg0 + " -> " + bg1);
    R.check("the sheet's chips follow", await page.$eval('#themeChips .chip[data-theme="ocean"]', (c) => c.classList.contains("on")));
    await page.click('#qAuto [data-auto="system"]'); await page.waitForTimeout(100);
    R.check("the Auto segment calls the same handler as the sheet", (await page.evaluate(() => window.__ll.state.auto)) === "system" && (await page.$eval('#autoChips .chip[data-auto="system"]', (c) => c.classList.contains("on"))));
    await page.click('#qAuto [data-auto="off"]'); await page.waitForTimeout(100);
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    await page.evaluate(() => window.llThemes.select("day"));
    await page.keyboard.press("t"); await page.waitForTimeout(100);
    const tn = await page.evaluate(() => window.__ll.state.theme);
    await page.keyboard.press("t"); await page.waitForTimeout(100);
    R.check("t toggles day / night", tn === "dusk" && (await page.evaluate(() => window.__ll.state.theme)) === "day", tn);
    /* a saved custom theme joins the row of its lightness */
    await page.evaluate(() => { window.llThemes.select("midnight"); window.llThemes.create(); });
    await page.click("#lamp"); await page.waitForTimeout(250);
    const custom = await page.evaluate(() => { const last = document.querySelector("#qDark .chip:last-child"); return { theme: last.dataset.theme, on: last.getAttribute("aria-pressed"), name: last.textContent.trim() }; });
    R.check("a saved custom theme appears at the end of the dark row, selected", /^c:/.test(custom.theme) && custom.on === "true" && custom.name === "Custom 1", JSON.stringify(custom));
    await page.click("#themeMore"); await page.waitForTimeout(700);
    R.check("All themes and the editor… opens the sheet at the Theme group", (await sheetOpen(page)) && (await page.$eval('#sheetTabs [data-group="themeGroup"]', (b) => b.classList.contains("on"))) && (await page.$eval("#customRow", (r) => r.classList.contains("show"))));
    await page.keyboard.press("Escape");
    R.check("Escape on the sheet opened from the popover's footer hands focus back to the lamp", await page.evaluate(() => document.activeElement && document.activeElement.id === "lamp"), await page.evaluate(() => document.activeElement && document.activeElement.id));
    R.check("no page errors (theme)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
    /* a theme far along its strip: the popover scrolls it into view, and a mouse wheel over a
       strip moves the strip rather than the page (which would close the popover) */
    const ctx2 = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx2.addInitScript(() => { try { localStorage.setItem("ll_prefs", JSON.stringify({ theme: "terminal" })); } catch(_){} });
    const p2 = await newPage(ctx2, url);
    await openFixture(p2, "sample.md");
    await p2.click("#lamp"); await p2.waitForTimeout(250);
    const cur = await p2.evaluate(() => { const on = document.querySelector("#pop .strip .chip.on"), r = on.getBoundingClientRect(), s = on.closest(".strip").getBoundingClientRect(); return { theme: on.dataset.theme, inside: r.left >= s.left - 1 && r.right <= s.right + 1, y: window.scrollY }; });
    R.check("with Terminal on, its chip is in view when the popover opens and the window did not move", cur.theme === "terminal" && cur.inside && cur.y === 0, JSON.stringify(cur));
    R.check("the theme popover fits too", (await popFits(p2)).fits, JSON.stringify(await popFits(p2)));
    const st = await rect(p2, "#qLight");
    await p2.mouse.move(st.left + st.width / 2, st.top + st.height / 2); await p2.mouse.wheel(0, 120); await p2.waitForTimeout(300);
    const wh = await p2.evaluate(() => ({ open: document.getElementById("pop").classList.contains("open"), left: document.getElementById("qLight").scrollLeft, y: window.scrollY }));
    R.check("a wheel over the light strip scrolls the strip and keeps the popover open", wh.open && wh.left > 0 && wh.y === 0, JSON.stringify(wh));
    await ctx2.close();
  });

  /* ---------------- the settings sheet ---------------- */
  section("Settings sheet");
  await guard("sheet", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.keyboard.press("s"); await page.waitForTimeout(300);
    const tabs = await page.$$eval("#sheetTabs button[data-group]", (bs) => bs.map((x) => x.textContent + ":" + x.dataset.group));
    R.check("the section strip lists every group in order", tabs.join("|") === "Reading:readingGroup|Theme:themeGroup|Text:textGroup|PDF:pdfGroup|Dictionary:dictGroup|Translation:trGroup", tabs.join("|"));
    R.check("the strip is sticky at the top of the sheet with the Reading tab marked", (await page.$eval("#sheetTabs", (s) => getComputedStyle(s).position === "sticky")) && (await page.$eval('#sheetTabs [data-group="readingGroup"]', (x) => x.classList.contains("on") && x.getAttribute("aria-current") === "true")));
    const icons = await page.$$eval(".sheet-inner > .group > .label", (ls) => ls.map((l) => !!l.querySelector("svg, .label-aa")));
    R.check("every group has a section header icon", icons.length === 6 && icons.every(Boolean), icons.join(","));
    R.check("the gear no longer opens the sheet and the sheet's own close button does", await page.evaluate(() => { document.getElementById("sheetClose").click(); return !document.getElementById("sheet").classList.contains("open"); }));
    await page.keyboard.press("s"); await page.waitForTimeout(300);
    await page.click('#sheetTabs [data-group="textGroup"]'); await page.waitForTimeout(800);
    const textTop = await page.evaluate(() => { const s = document.getElementById("sheet"), g = document.getElementById("textGroup"); return g.getBoundingClientRect().top - s.getBoundingClientRect().top; });
    R.check("clicking Text scrolls the sheet to the Text group and marks the tab", textTop >= 0 && textTop < 80 && (await page.$eval('#sheetTabs [data-group="textGroup"]', (x) => x.classList.contains("on"))), String(textTop));
    await page.evaluate(() => { const s = document.getElementById("sheet"), g = document.getElementById("pdfGroup"); s.scrollTop = g.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - 30; });
    await page.waitForTimeout(900);
    R.check("scrolling to the PDF group activates the PDF tab", await page.$eval('#sheetTabs [data-group="pdfGroup"]', (x) => x.classList.contains("on")), await page.$eval("#sheetTabs .on", (x) => x.textContent));
    await page.evaluate(() => { document.getElementById("sheet").scrollTop = 0; }); await page.waitForTimeout(300);
    R.check("back at the top, Reading is marked again", await page.$eval('#sheetTabs [data-group="readingGroup"]', (x) => x.classList.contains("on")));
    const maxH = await page.$eval("#sheet", (s) => getComputedStyle(s).maxHeight);
    R.check("the sheet's max height is min(78vh, 900px)", /min\(78vh, 900px\)|624px/.test(maxH), maxH);
    R.check("the flow and auto controls are segmented", await page.evaluate(() => document.getElementById("flowChips").classList.contains("seg") && document.getElementById("autoChips").classList.contains("seg")));
    /* each single-choice group tells assistive technology which option is chosen */
    const pressed = await page.evaluate(() => { const one = (sel, key) => { const on = document.querySelectorAll(sel + ' [aria-pressed="true"]'); return on.length === 1 ? on[0].dataset[key] : "none:" + on.length; };
      return { flow: one("#flowChips", "flow"), auto: one("#autoChips", "auto"), dict: one("#dictChips", "dm"), state: { flow: window.__ll.state.flow, auto: window.__ll.state.auto, dict: localStorage.getItem("ll_dictmode") || "tap" }, group: document.getElementById("dictChips").getAttribute("role") === "group" && !!document.getElementById("dictChips").getAttribute("aria-labelledby") }; });
    R.check("Flow, Auto and Dictionary each mark exactly one option with aria-pressed, matching the state", pressed.flow === pressed.state.flow && pressed.auto === pressed.state.auto && pressed.dict === pressed.state.dict && pressed.group, JSON.stringify(pressed));
    /* the last group can be the one under the strip: scrolled to the end, Translation is marked */
    await page.evaluate(() => { const s = document.getElementById("sheet"); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(400);
    R.check("scrolled to the bottom, the Translation tab is marked", await page.$eval('#sheetTabs [data-group="trGroup"]', (x) => x.classList.contains("on")), await page.$eval("#sheetTabs .on", (x) => x.textContent));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    /* keyboard focus around the sheet: s from the document lands on the section strip, Escape
       goes back to the document; from a bar button focus stays there and Escape returns to it */
    await page.mouse.click(40, 500); await page.waitForTimeout(100);   /* the margin: main takes focus */
    R.check("a click in the page focuses main without a focus ring", await page.evaluate(() => document.activeElement.id === "main" && getComputedStyle(document.activeElement).outlineStyle === "none"));
    await page.keyboard.press("s"); await page.waitForTimeout(300);
    R.check("s from the document puts focus on the first section button", await page.evaluate(() => document.activeElement && document.activeElement.closest("#sheetTabs") && document.activeElement.dataset.group === "readingGroup"), await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className)));
    await page.focus("#rSize"); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    R.check("Escape from a control in the sheet returns focus to the document", !(await sheetOpen(page)) && (await page.evaluate(() => document.activeElement.id === "main")), await page.evaluate(() => document.activeElement.id));
    await page.click("#more");
    await page.waitForSelector("#moreMenu button:has-text('Settings')", { state: "visible", timeout: 20000 });
    await page.click("#moreMenu button:has-text('Settings')"); await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("sheetClose").focus());
    await page.keyboard.press("Enter"); await page.waitForTimeout(200);
    R.check("closing with the sheet's own button returns focus to the ⋯ button it came from", !(await sheetOpen(page)) && (await page.evaluate(() => document.activeElement.id === "more")), await page.evaluate(() => document.activeElement.id));
    await page.focus("#gear"); await page.keyboard.press("s"); await page.waitForTimeout(300);
    R.check("s with focus on a bar button leaves focus there", (await sheetOpen(page)) && (await page.evaluate(() => document.activeElement.id === "gear")));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    R.check("Escape then leaves focus on the button", !(await sheetOpen(page)) && (await page.evaluate(() => document.activeElement.id === "gear")));
    R.check("no page errors (sheet)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- the start screen ---------------- */
  section("Start screen");
  await guard("start", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    R.check("empty: the lamp hero shows, no Continue card, the tips card shows", (await visible(page, "#empty .hero")) && (await visible(page, ".hero-lamp")) && !(await visible(page, "#continue")) && (await visible(page, "#tips")) && (await page.$$eval("#tips .tip-row", (r) => r.length)) === 3);
    R.check("the drop border is off until a drag", await page.$eval("#empty .hero", (h) => getComputedStyle(h).borderTopColor === "rgba(0, 0, 0, 0)"));
    await page.click("#tipsOk"); await page.waitForTimeout(100);
    R.check("Got it hides the tips", !(await visible(page, "#tips")) && (await page.evaluate(() => localStorage.getItem("ll_tips"))) === "seen");
    await openFixture(page, "sample.md");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5)); await page.waitForTimeout(900);
    await openFixture(page, "sample.txt"); await page.waitForTimeout(400);
    await page.keyboard.press("h"); await page.waitForTimeout(400);
    R.check("with a library: the hero is gone, the Continue card and Recent show, tips stay hidden", !(await visible(page, "#empty .hero")) && (await visible(page, "#continueCard")) && (await visible(page, "#library")) && !(await visible(page, "#tips")));
    const cc = await page.$eval("#continueCard", (c) => ({ title: c.querySelector(".cc-title").textContent, ring: c.querySelector(".cc-ring").style.getPropertyValue("--p"), go: c.querySelector(".cc-go").textContent.trim(), badge: c.querySelector(".lib-type").textContent }));
    R.check("the Continue card names the last book with a progress ring, badge and Continue", cc.title === "sample.txt" && /%$/.test(cc.ring) && cc.go === "Continue" && cc.badge === "TXT", JSON.stringify(cc));
    const items = await page.$$eval("#libList .lib-item", (els) => els.map((e) => ({ name: e.querySelector(".lib-name").textContent, meta: e.querySelector(".lib-meta").textContent, x: e.querySelector(".lib-x svg") ? "svg" : "text" })));
    R.check("Recent lists both files with a percentage and an icon to remove", items.length === 2 && items.some((i) => i.name === "sample.md" && /\d+%/.test(i.meta)) && items.every((i) => i.x === "svg"), JSON.stringify(items));
    R.check("the count and the Open another file button are there", (await page.$eval("#libCount", (c) => c.textContent)) === "2" && (await visible(page, "#libOpen")));
    await page.click("#continueCard");
    await page.waitForFunction(() => document.getElementById("docView").style.display === "block", null, { timeout: 15000 });
    R.check("the Continue card opens the last book", /sample\.txt/.test(await page.title()), await page.title());
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".lib-item").length > 0, null, { timeout: 10000 });
    R.check("after a reload the tips stay hidden and the Continue card is back", !(await visible(page, "#tips")) && (await visible(page, "#continueCard")));
    const bad = await unnamed(page);
    R.check("all visible buttons have a name (start screen)", bad.length === 0, bad.join(","));
    /* a card is two sibling buttons: the book and its remove; nothing interactive is nested */
    const card = await page.evaluate(() => { const c = document.querySelector("#libList .lib-item"); return { role: c.getAttribute("role"), open: !!c.querySelector(":scope > button.lib-open"), x: !!c.querySelector(":scope > button.lib-x"), nested: !!c.querySelector("[role=button] button, button button"), n: document.querySelectorAll("#libList .lib-item").length }; });
    R.check("library cards nest no control inside another", !card.role && card.open && card.x && !card.nested, JSON.stringify(card));
    await page.focus("#libList .lib-item:first-child .lib-x"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ n: document.querySelectorAll("#libList .lib-item").length, mode: document.body.dataset.mode }));
    R.check("Enter on a card's remove takes the book out of the library without opening it", after.n === card.n - 1 && after.mode === "empty", JSON.stringify(after));
    R.check("no page errors (start)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- the tabs strip from the keyboard ---------------- */
  section("Tabs");
  await guard("tabs", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await page.setInputFiles("#fileInput", ["sample.md", "sample.txt", "sample.html"].map((f) => path.join(__dirname, "fixtures", f)));
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 3 && document.getElementById("docView").style.display === "block", null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => ({ stops: document.querySelectorAll('#tabs [tabindex="0"]').length, buttons: document.querySelectorAll("#tabs button.tab").length, nested: document.querySelectorAll("#tabs .tab button").length,
      xHidden: Array.from(document.querySelectorAll("#tabs .tab-x")).every((x) => x.getAttribute("aria-hidden") === "true" && x.querySelector("svg")), xSize: Math.round(document.querySelector("#tabs .tab-x").getBoundingClientRect().width), title: document.title }));
    R.check("three tabs are three buttons with one Tab stop, the close a hidden 28px mark with the shared icon", t.stops === 1 && t.buttons === 3 && t.nested === 0 && t.xHidden && t.xSize === 28, JSON.stringify(t));
    const name = await page.evaluate(() => { const on = document.querySelector("#tabs .tab.on"); return on.getAttribute("aria-label") || on.textContent.trim(); });
    R.check("a tab's name is the file name alone (no Close in it)", name === "sample.md", name);
    await page.focus("#tabs .tab.on"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(900);
    R.check("ArrowRight opens the next document and keeps focus in the strip", /sample\.txt/.test(await page.title()) && (await page.evaluate(() => document.activeElement.closest("#tabs") && document.activeElement.classList.contains("on"))), await page.title());
    await page.keyboard.press("Delete"); await page.waitForTimeout(900);
    R.check("Delete closes it and focus stays on the tab that took its place, not the body", (await page.evaluate(() => !!document.activeElement.closest("#tabs") && document.activeElement.classList.contains("on") && document.querySelectorAll("#tabs .tab").length === 2)), await page.evaluate(() => document.activeElement.tagName + " " + document.title));
    await page.keyboard.press("Delete"); await page.waitForTimeout(900);
    R.check("with one document left the strip goes and focus lands on the document", (await page.evaluate(() => document.activeElement.id === "main" && !document.getElementById("tabs").classList.contains("on"))), await page.evaluate(() => document.activeElement.tagName));
    await page.click("#more"); await page.waitForTimeout(100);
    R.check("the ⋯ menu offers Close document (the × is hidden from assistive technology)", await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button")).some((b) => /^Close document$/.test((b.querySelector("span") || {}).textContent || ""))));
    await page.keyboard.press("Escape");
    R.check("no page errors (tabs)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- phone: bottom sheets ---------------- */
  section("Phone");
  await guard("phone", async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    R.check("no horizontal overflow with a document", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.tap("#gear"); await page.waitForTimeout(400);
    const p = await rect(page, "#pop");
    R.check("the type popover is a bottom sheet: full width, on the bottom edge, with a handle and scrim", (await popOpen(page)) && Math.abs(p.bottom - 844) <= 1 && Math.abs(p.width - 390) <= 1 && p.top > 200 && (await visible(page, ".pop-handle")) && (await page.$eval("#popScrim", (s) => s.classList.contains("on"))), JSON.stringify(p));
    const rowH = await page.$$eval("#typePop .prow", (rs) => rs.filter((r) => r.offsetParent !== null).map((r) => Math.round(r.getBoundingClientRect().height)));
    R.check("rows are at least 44px tall on touch", rowH.length >= 5 && rowH.every((h) => h >= 44), rowH.join(","));
    /* a finger holds the page still under the sheet: a drag on the scrim or inside the sheet
       neither scrolls the document nor dismisses the sheet; the sliders still work */
    await page.evaluate(() => window.scrollTo(0, 100)); await page.waitForTimeout(200);
    await touchDrag(page, 195, 120, 195, 20);
    const l1 = await page.evaluate(() => ({ y: window.scrollY, open: document.getElementById("pop").classList.contains("open"), scrim: document.getElementById("popScrim").classList.contains("on") }));
    R.check("a drag on the scrim leaves the page and the sheet where they are", l1.y === 100 && l1.open && l1.scrim, JSON.stringify(l1));
    const wr = await rect(page, "#qW");
    await touchDrag(page, wr.left - 30, wr.top + wr.height / 2, wr.left - 30, wr.top - 120);
    const l2 = await page.evaluate(() => ({ y: window.scrollY, open: document.getElementById("pop").classList.contains("open") }));
    R.check("a drag inside the sheet (beside a slider) does not scroll the page or close the sheet", l2.y === 100 && l2.open, JSON.stringify(l2));
    const s0 = await page.evaluate(() => window.__ll.state.size), sr = await rect(page, "#qSize");
    await touchDrag(page, sr.left + 8 + (sr.width - 16) * ((s0 - 14) / 14), sr.top + sr.height / 2, sr.right - 4, sr.top + sr.height / 2 + 10);
    R.check("a sideways drag on the Size slider still changes the size", (await page.evaluate(() => window.__ll.state.size)) > s0 && (await popOpen(page)), String(await page.evaluate(() => window.__ll.state.size)));
    /* near the top: the popover is a bottom sheet and may stand up to 70vh tall, so the middle
       of the scrim is behind it */
    await page.tap("#popScrim", { position: { x: 195, y: 40 } }); await page.waitForTimeout(400);
    R.check("the scrim closes it", !(await popOpen(page)) && !(await page.$eval("#popScrim", (s) => s.classList.contains("on"))));
    await page.tap("#lamp"); await page.waitForTimeout(400);
    const t = await rect(page, "#pop");
    R.check("the theme popover is a bottom sheet too", (await page.evaluate(() => window.llPop.is("theme"))) && Math.abs(t.bottom - 844) <= 1 && t.height <= 844 * 0.7 + 1, JSON.stringify(t));
    await page.tap("#popScrim", { position: { x: 195, y: 40 } }); await page.waitForTimeout(300);
    /* the side panel's scrim holds the page too */
    await page.tap("#tocBtn"); await page.waitForTimeout(400);
    await touchDrag(page, 195, 60, 195, 300);
    const l3 = await page.evaluate(() => ({ y: window.scrollY, open: document.getElementById("side").classList.contains("open") }));
    R.check("a drag on the side panel's scrim leaves the page still and the panel open", l3.y === 100 && l3.open, JSON.stringify(l3));
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    /* the sheet's last section can be the current one on a phone too */
    await page.keyboard.press("s"); await page.waitForTimeout(300);
    await page.tap('#sheetTabs [data-group="trGroup"]'); await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById("sheet").dispatchEvent(new Event("scroll"))); await page.waitForTimeout(150);
    R.check("phone: tapping Translation keeps it marked after the scroll settles", await page.$eval('#sheetTabs [data-group="trGroup"]', (x) => x.classList.contains("on")), await page.$eval("#sheetTabs .on", (x) => x.textContent));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await page.keyboard.press("h"); await page.waitForTimeout(400);
    R.check("no horizontal overflow on the start screen", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    /* touch targets: nothing in the sheet, the panel or the start screen is under 40px tall */
    await page.tap("#more"); await page.waitForTimeout(300);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button, #library button, #tips button")).filter((x) => x.getClientRects().length && x.getBoundingClientRect().height < 40).map((x) => x.id || x.className));
    R.check("phone: the menu's, the library's and the tips' buttons are at least 40px tall", small.length === 0, small.join(","));
    await page.keyboard.press("Escape");
    R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
    /* the narrowest phones: neither popover overflows sideways, for a text document or a PDF */
    for (const w of [360, 320]){
      const c = await b.newContext({ viewport: { width: w, height: 800 }, hasTouch: true, isMobile: true });
      const p = await newPage(c, url);
      for (const f of ["sample.md", "sample.pdf"]){
        await openFixture(p, f);
        for (const btn of ["#gear", "#lamp"]){
          await p.tap(btn); await p.waitForTimeout(350);
          const fit = await popFits(p);
          R.check(w + "px, " + f + ": " + btn + " fits its sheet", fit.fits && (await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify(fit));
          await p.keyboard.press("Escape"); await p.waitForTimeout(250);
        }
      }
      await c.close();
    }
  });

  /* ---------------- screenshots: the popovers and the start screen, four themes, two widths ---------------- */
  section("Screenshots");
  await guard("shots", async () => {
    for (const [w, h, tag] of [[1200, 800, "desktop"], [390, 844, "phone"]]){
      for (const theme of ["day", "dusk", "newsprint", "terminal"]){
        const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 });
        await ctx.addInitScript((t) => { try { localStorage.setItem("ll_prefs", JSON.stringify({ theme: t })); } catch(_){} }, theme);
        const page = await newPage(ctx, url);
        const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, "ui-a-" + name + "-" + tag + "-" + theme + ".png") }); };
        await shot("start-empty");
        await openFixture(page, "sample.md");
        await page.click("#gear"); await shot("pop-type");
        await page.keyboard.press("Escape"); await page.waitForTimeout(150);
        await page.click("#lamp"); await shot("pop-theme");
        await page.keyboard.press("Escape"); await page.waitForTimeout(150);
        await page.keyboard.press("s"); await shot("sheet");
        await page.keyboard.press("Escape"); await page.waitForTimeout(150);
        await page.keyboard.press("h"); await shot("start-library");
        R.check("screenshots " + tag + " " + theme + ": no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
        await ctx.close();
      }
    }
    console.log("screenshots in " + SHOTS);
  });

  await b.close(); server.close();
  process.exit(R.done());
})();
