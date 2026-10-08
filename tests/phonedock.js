/* The phone reading screen (PhoneBar: a finger for a pointer, 560px and narrower, a book open):
   no header; the text, a strip at the foot with the time left in the chapter and the lamp button;
   the lamp opens the dock (Back, the title, Search, the position, Day and Night, and the five
   tools with their labels). The dock holds the page still, closes on a tap outside or Escape, and
   a tool closes it before it opens its own sheet, which hands focus back to the lamp when it closes.
     NODE_PATH=$(npm root -g) node tests/phonedock.js */
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");

const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1.5 : tol);
const rect = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0; }, sel);
const dockOpen = (page) => page.evaluate(() => document.body.classList.contains("dock-open"));
const focusId = (page) => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
const openDock = async (page) => { await page.tap("#dockBtn"); await page.waitForTimeout(250); };
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
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };
async function phonePage(b, url, prefs){
  const ctx = await b.newContext(PHONE);
  await ctx.addInitScript((p) => { try {
    localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_dictmode", "tap");
    if (p) localStorage.setItem("ll_prefs", JSON.stringify(p));
  } catch(_){} }, prefs || null);
  const page = await newPage(ctx, url);
  return { ctx, page };
}

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); console.log(err.stack); } };

  /* ---------- the reading screen and the dock ---------- */
  await guard("dock", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.epub");
    R.check("phonebar is on", await page.evaluate(() => document.body.classList.contains("phonebar")));
    R.check("no header box under phonebar", (await page.evaluate(() => document.querySelector("header").getClientRects().length)) === 0);
    const lb = await rect(page, "#dockBtn");
    R.check("lamp at right 20, bottom 28, 56px round", near(lb.right, 370) && near(lb.bottom, 816) && near(lb.width, 56) && near(lb.height, 56) &&
      (await page.$eval("#dockBtn", (e) => getComputedStyle(e).borderRadius)) === "50%", JSON.stringify(lb));
    const nb = await rect(page, "#leftNote");
    R.check("the note sits bottom-left, centred on the lamp", near(nb.left, 24) && near(nb.top + nb.height / 2, lb.top + lb.height / 2, 2) && nb.right <= lb.left, JSON.stringify(nb));
    const named = await page.$eval("#dockBtn", (e) => ({ name: e.getAttribute("aria-label"), exp: e.getAttribute("aria-expanded"), ctl: e.getAttribute("aria-controls") }));
    R.check("the lamp is 'Reading controls', collapsed, controlling the dock", named.name === "Reading controls" && named.exp === "false" && named.ctl === "phoneDock", JSON.stringify(named));
    R.check("the dock is closed and out of reach", !(await dockOpen(page)) && !(await shown(page, "#phoneDock")));
    await openDock(page);
    const inDock = await page.evaluate(() => document.getElementById("phoneDock").contains(document.activeElement));
    R.check("tap lamp opens the dock, focus inside", (await dockOpen(page)) && (await page.$eval("#dockBtn", (e) => e.getAttribute("aria-expanded"))) === "true" && inDock, await focusId(page));
    const db = await rect(page, "#phoneDock");
    const dcs = await page.$eval("#phoneDock", (e) => ({ r: getComputedStyle(e).borderTopLeftRadius, role: e.getAttribute("role"), modal: e.getAttribute("aria-modal"), name: e.getAttribute("aria-label") }));
    R.check("the dock: a dialog at the foot, 24px top corners, at most 85% tall", near(db.bottom, 844) && near(db.left, 0) && near(db.width, 390) && db.height <= 844 * 0.85 + 1 &&
      dcs.r === "24px" && dcs.role === "dialog" && dcs.modal === "true" && dcs.name === "Reading controls", JSON.stringify([db, dcs]));
    const tools = await page.$$eval("#actRow > *", (els) => els.filter((e) => e.getClientRects().length).map((e) => e.id + ":" + ((e.querySelector(".tool-l") || {}).textContent || "")));
    R.check("tools in order with labels", tools.join() === "tocBtn:Contents,gear:Text,speakBtn:Read aloud,lamp:Theme,more:More", tools.join());
    R.check("the tools sit inside the dock", await page.evaluate(() => document.getElementById("phoneDock").contains(document.getElementById("actRow"))));
    const head = await page.$$eval("#phoneDock .pd-head > *", (els) => els.map((e) => e.id));
    R.check("header row: Back, the title, Search", head.join() === "dockHome,fname,searchBtn", head.join());
    R.check("Back is 'Back to library'", (await page.$eval("#dockHome", (e) => e.getAttribute("aria-label"))) === "Back to library");
    R.check("the title reads the book's, with its chevron", /^The Lamp/.test(await page.$eval("#fname .fn-t", (e) => e.textContent.trim())) &&
      (await page.$eval("#fname .fn-t", (e) => getComputedStyle(e, "::after").content !== "none")));
    const fill = await page.evaluate(() => { const s = getComputedStyle(document.getElementById("speakBtn")), acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const hex = (c) => "#" + c.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join(""); return { bg: hex(s.backgroundColor), acc: acc.toLowerCase() }; });
    R.check("Read aloud is the filled tool, in the accent", fill.bg === fill.acc, JSON.stringify(fill));
    R.check("everything else is inert while it is open", await page.evaluate(() => document.getElementById("main").inert && document.getElementById("readFoot").inert && !document.getElementById("phoneDock").inert));
    /* the page holds still: a wheel turn and a finger drag on the page around the dock */
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.move(195, 200); await page.mouse.wheel(0, 500); await page.waitForTimeout(200);
    await touchDrag(page, 195, 300, 195, 100);
    const y1 = await page.evaluate(() => window.scrollY);
    R.check("while open the page does not scroll (wheel and touch drag)", y1 === y0 && (await dockOpen(page)), y0 + " → " + y1);
    /* a tap on the page closes it and does nothing else (after the fling above has settled: Chrome
       swallows a tap that stops a fling, as it does on a phone) */
    await page.waitForTimeout(700);
    const word = await page.evaluate(() => { const p = [...document.querySelectorAll("#doc p")].find((x) => /\w{5,}/.test(x.textContent) && x.getBoundingClientRect().top > 80 && x.getBoundingClientRect().top < 300);
      const tn = [...p.childNodes].find((n) => n.nodeType === 3 && /\w{5,}/.test(n.textContent)); const m = /\w{5,}/.exec(tn.textContent);
      const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length); const q = r.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    await page.touchscreen.tap(word.x, word.y); await page.waitForTimeout(400);
    const card = await page.evaluate(() => { const c = document.getElementById("dictCard"); return !!c && c.classList.contains("open"); });
    R.check("tap on the page closes it, focus to the lamp, no word card", !(await dockOpen(page)) && (await focusId(page)) === "dockBtn" && !card, (await focusId(page)) + " card:" + card);
    await openDock(page);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    R.check("Escape closes it, focus to the lamp", !(await dockOpen(page)) && (await focusId(page)) === "dockBtn", await focusId(page));
    R.check("no page errors (dock)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- the tools: the dock closes first, and focus comes back to the lamp ---------- */
  await guard("tools", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.epub");
    await openDock(page); await page.tap("#tocBtn"); await page.waitForTimeout(400);
    const side = await page.evaluate(() => ({ open: document.getElementById("side").classList.contains("open"), title: document.getElementById("sideTitle").textContent }));
    R.check("Contents closes the dock and opens contents", !(await dockOpen(page)) && side.open && side.title === "Contents", JSON.stringify(side));
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    R.check("…closing it returns focus to the lamp", (await focusId(page)) === "dockBtn", await focusId(page));
    await openDock(page); await page.tap("#gear"); await page.waitForTimeout(400);
    R.check("Text opens the Text sheet", !(await dockOpen(page)) && (await page.evaluate(() => window.llPop.is("type"))));
    await page.tap("#typeClose"); await page.waitForTimeout(300);
    R.check("…its close button hands focus to the lamp", (await focusId(page)) === "dockBtn", await focusId(page));
    await openDock(page); await page.tap("#lamp"); await page.waitForTimeout(400);
    R.check("Theme opens the theme sheet", !(await dockOpen(page)) && (await page.evaluate(() => window.llPop.is("theme"))));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    R.check("…Escape hands focus to the lamp", (await focusId(page)) === "dockBtn", await focusId(page));
    await openDock(page); await page.tap("#more"); await page.waitForTimeout(400);
    const menu = await page.evaluate(() => { const m = document.getElementById("moreMenu"), s = document.getElementById("moreScrim"), r = m.getBoundingClientRect();
      return { open: m.classList.contains("open"), h: r.height, parent: m.parentNode.tagName, scrim: s && s.parentNode.tagName, top: document.elementFromPoint(195, r.top + 30) && document.elementFromPoint(195, r.top + 30).closest("#moreMenu") !== null }; });
    R.check("More sheet is visible at body level with its scrim, on top", !(await dockOpen(page)) && menu.open && menu.h > 0 && menu.parent === "BODY" && menu.scrim === "BODY" && menu.top, JSON.stringify(menu));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    R.check("…Escape hands focus to the lamp", (await focusId(page)) === "dockBtn", await focusId(page));
    await openDock(page); await page.tap("#fname"); await page.waitForTimeout(400);
    R.check("the title opens the open books", !(await dockOpen(page)) && (await page.evaluate(() => document.getElementById("sideTitle").textContent)) === "Open books");
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    await openDock(page); await page.tap("#searchBtn"); await page.waitForTimeout(400);
    R.check("Search opens search", !(await dockOpen(page)) && (await page.evaluate(() => document.getElementById("side").classList.contains("open") && document.getElementById("sideTitle").textContent)) === "Search");
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    R.check("…and focus is back on the lamp", (await focusId(page)) === "dockBtn", await focusId(page));
    await openDock(page); await page.tap("#speakBtn"); await page.waitForTimeout(500);
    R.check("Read aloud closes the dock", !(await dockOpen(page)));
    await page.evaluate(() => window.__ll.Speak.stop()); await page.waitForTimeout(200);
    await openDock(page); await page.tap("#dockHome"); await page.waitForTimeout(500);
    const lib = await page.evaluate(() => ({ mode: document.body.dataset.mode, hdr: document.querySelector("header").getClientRects().length, pb: document.body.classList.contains("phonebar") }));
    R.check("Back goes to the library: header back, chrome gone", lib.mode === "empty" && lib.hdr > 0 && !lib.pb && !(await shown(page, "#readFoot")) && !(await shown(page, "#phoneDock")), JSON.stringify(lib));
    R.check("…the tools are back in the header", await page.evaluate(() => ["tocBtn", "gear", "speakBtn", "lamp", "more", "fname", "searchBtn"].every((id) => document.querySelector("header").contains(document.getElementById(id))) && document.querySelector("header").contains(document.getElementById("moreMenu"))));
    R.check("no page errors (tools)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- a custom theme with a light accent: the filled Read aloud stays readable ---------- */
  await guard("light accent", async () => {
    const { ctx, page } = await phonePage(b, url, { theme: "c:lite", customs: [{ id: "lite", name: "Lite", bg: "#fbf7ee", accent: "#f2d06b" }] });
    await openFixture(page, "sample.epub");
    await openDock(page);
    const ratio = await page.evaluate(() => { const s = getComputedStyle(document.getElementById("speakBtn")), hex = (c) => "#" + c.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("");
      return window.llThemes.contrast(hex(s.color), hex(s.backgroundColor)); });
    R.check("custom theme with a light accent: Read aloud label ≥ 4.5:1", ratio >= 4.5, ratio.toFixed(2));
    await ctx.close();
  });

  /* ---------- layout: the text clears the strip, the dock never re-paginates ---------- */
  await guard("layout", async () => {
    const { ctx, page } = await phonePage(b, url, { flow: "pages" });
    await openFixture(page, "sample.epub");
    await page.waitForTimeout(300);
    const n0 = await page.evaluate(() => window.__ll.state.totalPages);
    await openDock(page);
    const n1 = await page.evaluate(() => window.__ll.state.totalPages);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const n2 = await page.evaluate(() => window.__ll.state.totalPages);
    R.check("Pages: page count unchanged by opening and closing the dock", n0 > 1 && n1 === n0 && n2 === n0, [n0, n1, n2].join(" "));
    const pg = await page.evaluate(() => { const v = document.getElementById("docView").getBoundingClientRect(), s = document.getElementById("readFoot").getBoundingClientRect(), m = getComputedStyle(document.getElementById("main"));
      return { viewTop: v.top, viewBottom: v.bottom, stripTop: s.top, padTop: m.paddingTop, pager: getComputedStyle(document.getElementById("pager")).display, headH: getComputedStyle(document.documentElement).getPropertyValue("--headH").trim() }; });
    R.check("Pages: the text column ends above the strip, and starts 20px from the top", pg.viewBottom <= pg.stripTop + 1 && pg.padTop === "20px" && pg.viewTop >= 19, JSON.stringify(pg));
    R.check("Pages: no page-turn bar, and the header counts nothing (--headH 0px)", pg.pager === "none" && pg.headH === "0px", JSON.stringify(pg));
    const bars = await page.evaluate(() => ({ line: getComputedStyle(document.getElementById("progress")).display, pill: getComputedStyle(document.getElementById("progressInfo")).display }));
    R.check("no progress line or pill under phonebar", bars.line === "none" && bars.pill === "none", JSON.stringify(bars));
    await page.keyboard.press("z"); await page.waitForTimeout(400);
    const zen = await page.evaluate(() => ({ zen: document.body.classList.contains("zen"), line: getComputedStyle(document.getElementById("progress")).display, viewBottom: document.getElementById("docView").getBoundingClientRect().bottom, stripTop: document.getElementById("readFoot").getBoundingClientRect().top }));
    R.check("…in zen too, and the text still clears the strip", zen.zen && zen.line === "none" && zen.viewBottom <= zen.stripTop + 1, JSON.stringify(zen));
    await page.keyboard.press("z"); await page.waitForTimeout(400);
    R.check("no page errors (layout)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await guard("scroll layout", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.epub");
    const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]').content);
    R.check("viewport-fit=cover", /viewport-fit=cover/.test(meta), meta);
    const cols = await page.evaluate(() => { const r = document.documentElement.style; return { meta: document.querySelector('meta[name="theme-color"]').content.toLowerCase(), bg: r.getPropertyValue("--bg").trim().toLowerCase(), panel: r.getPropertyValue("--panel").trim().toLowerCase() }; });
    R.check("theme-color is the page colour in a book", cols.meta === cols.bg && cols.bg !== cols.panel, JSON.stringify(cols));
    /* the last line clears the strip at the very end */
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(400);
    const end = await page.evaluate(() => { const ps = [...document.querySelectorAll("#doc p, #doc li, #doc h1, #doc h2, #doc h3")].filter((p) => p.getClientRects().length); const last = ps[ps.length - 1].getBoundingClientRect();
      return { lastBottom: last.bottom, stripTop: document.getElementById("readFoot").getBoundingClientRect().top, hide: document.body.classList.contains("hidebar") }; });
    R.check("Scroll: the last line clears the strip at the end", end.lastBottom <= end.stripTop + 1, JSON.stringify(end));
    R.check("Scroll: no bar hides on the way down", !end.hide);
    /* a turn of the phone with the dock open: the dock closes, the header is back, the place is kept */
    await page.evaluate(() => { const p = [...document.querySelectorAll("#doc p")][4]; window.scrollTo(0, p.getBoundingClientRect().top + window.scrollY - 30); }); await page.waitForTimeout(300);
    const off0 = await page.evaluate(() => window.__ll.Library.topCharOffset());
    await openDock(page);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(600);
    const rot = await page.evaluate(() => ({ open: document.body.classList.contains("dock-open"), pb: document.body.classList.contains("phonebar"), hdr: document.querySelector("header").getClientRects().length, off: window.__ll.Library.topCharOffset(),
      meta: document.querySelector('meta[name="theme-color"]').content.toLowerCase(), panel: document.documentElement.style.getPropertyValue("--panel").trim().toLowerCase() }));
    R.check("rotate to 844×390 with the dock open: dock closed, header back, position kept", !rot.open && !rot.pb && rot.hdr > 0 && Math.abs(rot.off - off0) < 80, JSON.stringify(Object.assign({ off0 }, rot)));
    R.check("…and theme-color is the panel colour again", rot.meta === rot.panel, JSON.stringify(rot));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
    /* rotating while a panel opened from the dock is up: it keeps working */
    await openDock(page); await page.tap("#tocBtn"); await page.waitForTimeout(400);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(600);
    const before = await page.evaluate(() => window.scrollY);
    const went = await page.evaluate(() => { const items = [...document.querySelectorAll("#sideBody .toc-item")].filter((x) => x.getClientRects().length); const last = items[items.length - 1]; if (last) last.click(); return !!last; });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ y: window.scrollY, side: document.getElementById("side").classList.contains("open") }));
    R.check("rotate while the Contents panel (opened from the dock) is up: it still works", went && after.y !== before, JSON.stringify({ before, after }));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
    await page.evaluate(() => window.__ll.Library.home()); await page.waitForTimeout(500);
    const lib = await page.evaluate(() => { const r = document.documentElement.style; return { meta: document.querySelector('meta[name="theme-color"]').content.toLowerCase(), panel: r.getPropertyValue("--panel").trim().toLowerCase() }; });
    R.check("theme-color is the panel colour on the library", lib.meta === lib.panel, JSON.stringify(lib));
    R.check("no page errors (scroll layout)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- the ring, the note, the position slider ---------- */
  const NOTE = /^(Under a minute|\d+ min|\d+ h( \d+ min)?) left in chapter$/;
  const ringPct = (page) => page.evaluate(() => { const c = document.querySelector("#dockBtn .ring circle"), da = (c.style.strokeDasharray || getComputedStyle(c).strokeDasharray).split(/[ ,]+/).map(parseFloat);
    return { ring: da[0] / (2 * Math.PI * 27) * 100, bar: +document.getElementById("progress").getAttribute("aria-valuenow"), pct: document.getElementById("dockPct").textContent, desc: document.getElementById("dockBtn").getAttribute("aria-describedby") }; });
  await guard("ring and note", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.epub");
    /* a fresh profile (no reading history): the note is an estimate from the prior, or nothing */
    const fresh = await page.$eval("#leftNote", (e) => e.textContent);
    R.check("fresh profile: the note is empty or an estimate, never 0, NaN or undefined", (fresh === "" || NOTE.test(fresh)) && !/\b0 min|NaN|undefined/.test(fresh), fresh);
    await page.evaluate(() => { const h = document.documentElement; window.scrollTo(0, (h.scrollHeight - h.clientHeight) / 2); }); await page.waitForTimeout(600);
    const r = await ringPct(page);
    R.check("ring follows progress (scroll to ~50%)", Math.abs(r.ring - r.bar) < 1 && r.bar > 30 && r.bar < 70, JSON.stringify(r));
    R.check("the lamp says how far through, to a screen reader", /^\d+% through the book$/.test(r.pct) && r.desc === "dockPct", JSON.stringify(r));
    const note = await page.$eval("#leftNote", (e) => e.textContent);
    R.check("the note: the time left in the chapter", NOTE.test(note), note);
    await openDock(page);
    const cap = await page.evaluate(() => ({ page: document.getElementById("dockPage").textContent, left: document.getElementById("dockLeft").textContent, note: document.getElementById("leftNote").textContent,
      pos: document.getElementById("dockPos"), shown: !document.querySelector(".pd-pos").hidden }));
    R.check("the dock's caption: the place on the left, the chapter's time on the right", cap.shown && /^\d+%$/.test(cap.page) && cap.left === cap.note, JSON.stringify(cap));
    const mark = await page.evaluate(() => { const r = document.documentElement.style; return window.llThemes.contrast(r.getPropertyValue("--lamp-mark").trim(), r.getPropertyValue("--panel").trim()); });
    R.check("the ring's colour shows at 3:1 or more on the panel", mark >= 3, mark.toFixed(2));
    R.check("no page errors (ring)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await guard("note without chapters", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.txt");
    await page.evaluate(() => window.scrollBy(0, 200)); await page.waitForTimeout(600);
    const note = await page.$eval("#leftNote", (e) => e.textContent);
    R.check("sample.txt (no chapters): the whole book's time, capitalised", /^(Under a minute left|\d+ min left|\d+ h( \d+ min)? left)$/.test(note), note);
    await ctx.close();
  });
  await guard("light accent ring", async () => {
    const { ctx, page } = await phonePage(b, url, { theme: "c:lite", customs: [{ id: "lite", name: "Lite", bg: "#fbf7ee", accent: "#f2d06b" }] });
    await openFixture(page, "sample.epub");
    const mark = await page.evaluate(() => { const r = document.documentElement.style; return window.llThemes.contrast(r.getPropertyValue("--lamp-mark").trim(), r.getPropertyValue("--panel").trim()); });
    R.check("custom theme with a light accent: the ring still shows at 3:1 on the panel", mark >= 3, mark.toFixed(2));
    await ctx.close();
  });
  await guard("slider", async () => {
    /* Pages flow: one step a page */
    let { ctx, page } = await phonePage(b, url, { flow: "pages" });
    await openFixture(page, "sample.epub");
    await page.waitForTimeout(300);
    await openDock(page);
    const total = await page.evaluate(() => window.__ll.state.totalPages);
    const pos = await page.$eval("#dockPos", (r) => ({ min: r.min, max: r.max, v: r.value }));
    R.check("Pages: the slider runs over the pages", pos.min === "1" && +pos.max === total && pos.v === "1", JSON.stringify(Object.assign({ total }, pos)));
    await page.$eval("#dockPos", (r) => { r.value = 3; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ pg: document.getElementById("pgInfo").textContent, page: window.__ll.state.page, cap: document.getElementById("dockPage").textContent, vt: document.getElementById("dockPos").getAttribute("aria-valuetext"), open: document.body.classList.contains("dock-open") }));
    R.check("Pages: set 3 → page 3", /^3 \//.test(after.pg) && after.page === 2, JSON.stringify(after));
    R.check("aria-valuetext equals the caption", after.vt === after.cap && after.cap === "Page 3 of " + total, JSON.stringify(after));
    R.check("the dock stays open after a slider jump", after.open);
    await page.focus("#dockPos"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400);
    R.check("an arrow key moves one page", (await page.evaluate(() => window.__ll.state.page)) === 3);
    await ctx.close();
    /* Scroll flow: one step a percent */
    ({ ctx, page } = await phonePage(b, url));
    await openFixture(page, "sample.epub");
    await openDock(page);
    const sp = await page.$eval("#dockPos", (r) => ({ min: r.min, max: r.max }));
    await page.$eval("#dockPos", (r) => { r.value = 50; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(500);
    const frac = await page.evaluate(() => { const h = document.documentElement; return h.scrollTop / (h.scrollHeight - h.clientHeight); });
    R.check("Scroll: the slider runs 0–100; 50 → about half way", sp.min === "0" && sp.max === "100" && Math.abs(frac - 0.5) < 0.05, JSON.stringify(Object.assign({ frac }, sp)));
    R.check("…and its caption is the percentage", (await page.$eval("#dockPage", (e) => e.textContent)) === "50%");
    await ctx.close();
    /* a PDF: one step a page, in both flows */
    ({ ctx, page } = await phonePage(b, url));
    await openFixture(page, "sample.pdf");
    await openDock(page);
    await page.$eval("#dockPos", (r) => { r.value = 2; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(900);
    R.check("PDF: a slider jump to page 2", (await page.evaluate(() => window.__ll.Library.currentPdfPage())) === 2 && /^Page 2 of \d+$/.test(await page.$eval("#dockPage", (e) => e.textContent)));
    R.check("no page errors (slider)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await guard("Dutch note", async () => {
    const ctx = await b.newContext(Object.assign({ locale: "nl-NL" }, PHONE));
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); } catch(_){} });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.epub");
    await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(600);
    const nl = await page.evaluate(() => ({ note: document.getElementById("leftNote").textContent, pct: document.getElementById("dockPct").textContent }));
    R.check("Dutch: 'Nog 4 min in dit hoofdstuk' form", /^Nog (geen minuut|\d+ min|\d+ u( \d+ min)?) in dit hoofdstuk$/.test(nl.note) && /^\d+% van het boek gelezen$/.test(nl.pct), JSON.stringify(nl));
    await ctx.close();
  });

  /* ---------- gestures: what opens the dock, what turns the page ---------- */
  const touchHold = async (page, x, y, ms) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(ms);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach(); await page.waitForTimeout(400);
  };
  const pageNo = (page) => page.evaluate(() => window.__ll.state.page);
  const shut = async (page) => { await page.evaluate(() => window.__ll.PhoneBar.closeDock()); await page.waitForTimeout(700); };
  /* blank space between two paragraphs in the middle band of the page on screen */
  const blankMiddle = (page) => page.evaluate(() => { const vr = document.getElementById("docView").getBoundingClientRect();
    const ps = [...document.querySelectorAll("#doc p, #doc h1, #doc h2")].map((p) => p.getBoundingClientRect()).filter((r) => r.left >= vr.left - 1 && r.right <= vr.right + 1 && r.top > vr.top + 60 && r.bottom < vr.bottom - 80).sort((a, b) => a.top - b.top);
    for (let i = 0; i + 1 < ps.length; i++) if (ps[i + 1].top - ps[i].bottom > 8) return { x: vr.left + vr.width / 2, y: (ps[i].bottom + ps[i + 1].top) / 2 }; return null; });
  await guard("gestures", async () => {
    const { ctx, page } = await phonePage(b, url, { flow: "pages" });
    await openFixture(page, "sample.md");
    await page.waitForTimeout(500);
    const gap = await blankMiddle(page);
    await page.touchscreen.tap(gap.x, gap.y); await page.waitForTimeout(400);
    R.check("Pages: a blank tap in the middle opens the dock", await dockOpen(page), JSON.stringify(gap));
    await shut(page);
    const v = await rect(page, "#docView");
    await page.touchscreen.tap(195, v.bottom - 20); await page.waitForTimeout(400);
    R.check("Pages: a tap on the bottom strip of the page opens the dock", await dockOpen(page));
    await shut(page);
    const foot = await rect(page, "#readFoot");
    await page.touchscreen.tap(150, foot.top + 30); await page.waitForTimeout(400);
    R.check("Pages: a tap on the strip's blank part opens the dock", await dockOpen(page));
    await shut(page);
    await touchDrag(page, 195, 560, 195, 300);
    const a = await dockOpen(page);
    await page.waitForTimeout(500);
    await touchDrag(page, 195, 120, 195, 400);
    R.check("Pages: a swipe up opens the dock, a swipe down on the scrim closes it", a && !(await dockOpen(page)));
    await page.waitForTimeout(500);
    await openDock(page);
    const d = await rect(page, "#phoneDock");
    await touchDrag(page, 195, d.top + 20, 195, d.top + 220);
    R.check("…and a swipe down on the dock closes it too", !(await dockOpen(page)));
    await page.waitForTimeout(600);
    const p0 = await pageNo(page);
    await page.touchscreen.tap(370, v.top + 20); await page.waitForTimeout(500);
    R.check("Pages: the top corners turn the page (no strip of their own any more)", (await pageNo(page)) === p0 + 1 && !(await dockOpen(page)));
    await page.touchscreen.tap(20, v.top + 20); await page.waitForTimeout(500);
    R.check("…both ways", (await pageNo(page)) === p0);
    await openDock(page);
    const head = await rect(page, "#phoneDock .pd-head");
    await touchDrag(page, 320, head.top + 24, 60, head.top + 28);
    R.check("Pages: a sideways swipe on the dock does not turn the page", (await pageNo(page)) === p0, String(await pageNo(page)));
    await shut(page);
    await page.evaluate(() => window.__ll.PhoneBar.openDock()); await page.waitForTimeout(300);
    await page.tap("#gear"); await page.waitForTimeout(400);
    await page.tap("#qMore summary"); await page.waitForTimeout(250);
    await page.$eval("#qLs", (el) => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(150);
    const ls = await rect(page, "#qLs");
    await touchDrag(page, ls.left + 6, ls.top + ls.height / 2, ls.right - 6, ls.top + ls.height / 2);
    R.check("Pages: a sideways drag on a slider in the Text sheet does not turn the page", (await pageNo(page)) === p0, String(await pageNo(page)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    /* a word in the top strip is looked up now: the strip is the page like the rest */
    R.check("no page errors (gestures)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await guard("scroll and e-ink taps", async () => {
    let { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.md");
    const gap = await blankMiddle(page);
    if (gap){ await page.touchscreen.tap(gap.x, gap.y); await page.waitForTimeout(400); }
    R.check("Scroll: a blank tap does not open the dock (only the lamp does)", !!gap && !(await dockOpen(page)));
    await ctx.close();
    ({ ctx, page } = await phonePage(b, url, { flow: "pages" }));
    await page.evaluate(() => { localStorage.setItem("ll_eink", "1"); });
    await openFixture(page, "sample.md");
    await page.evaluate(() => window.__ll.Eink && window.__ll.Eink.set && window.__ll.Eink.set(true)); await page.waitForTimeout(500);
    const p0 = await pageNo(page), v = await rect(page, "#docView");
    await page.touchscreen.tap(195, v.top + v.height / 2); await page.waitForTimeout(500);
    const turned = (await pageNo(page)) === p0 + 1 && !(await dockOpen(page));
    await openDock(page);
    R.check("e-ink: a middle tap turns the page, the lamp opens the dock", turned && (await dockOpen(page)), JSON.stringify({ p0, now: await pageNo(page) }));
    R.check("e-ink: no Day/Night switch in the dock", !(await shown(page, "#phoneDock .pd-dn")));
    await ctx.close();
  });
  await guard("greek", async () => {
    const { ctx, page } = await phonePage(b, url, { flow: "pages" });
    await openFixture(page, "sample.md");
    await page.evaluate(() => { [...document.querySelectorAll("#doc p")].forEach((p) => { p.textContent = "Ὁ λύχνος βομβεῖ ἥσυχα καθὼς γυρίζει τὴν σελίδα. Ἀκόμη ἕνα κεφάλαιο, λέει στὸν ἑαυτό της, μόνο ἕνα ἀκόμη, καὶ ἡ βροχὴ ἔπεφτε πάλι ἔξω."; }); window.__ll.relayoutPages(); });
    await page.waitForTimeout(500);
    const v = await rect(page, "#docView"), p0 = await pageNo(page);
    await page.touchscreen.tap(195, v.top + v.height / 2); await page.waitForTimeout(500);
    const openGreek = await dockOpen(page);
    await shut(page);
    await page.touchscreen.tap(370, v.top + v.height / 2); await page.waitForTimeout(500);
    R.check("Greek text in Pages flow: a middle tap opens the dock, the edges turn", openGreek && (await pageNo(page)) === p0 + 1, JSON.stringify({ openGreek, p0, now: await pageNo(page) }));
    await ctx.close();
  });
  /* ---------- Day and Night in the dock, and the holds ---------- */
  await guard("day night", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.md");
    await openDock(page);
    const n0 = await page.evaluate(() => ({ day: document.getElementById("dockDay").getAttribute("aria-pressed"), night: document.getElementById("dockNight").getAttribute("aria-pressed"), shown: !document.querySelector(".pd-dn").hidden }));
    await page.tap("#dockNight");
    await page.waitForFunction(() => window.__ll.state.theme === "dusk", null, { timeout: 1500 }).catch(() => {});
    const n1 = await page.evaluate(() => ({ theme: window.__ll.state.theme, night: document.getElementById("dockNight").getAttribute("aria-pressed"), open: document.body.classList.contains("dock-open"), toast: !!document.getElementById("toast") && document.getElementById("toast").classList.contains("on") }));
    R.check("the switch marks the half on screen; Night → dusk; the dock stays open, no toast", n0.shown && n0.day === "true" && n0.night === "false" && n1.theme === "dusk" && n1.night === "true" && n1.open && !n1.toast, JSON.stringify([n0, n1]));
    R.check("the switch is a labelled group", (await page.$eval("#phoneDock .pd-dn", (g) => g.getAttribute("role") + ":" + g.getAttribute("aria-label"))) === "group:Day or night");
    /* no hold on the Theme tool in the dock: the switch is right above it */
    const lampAt = await rect(page, "#lamp");
    await touchHold(page, lampAt.left + lampAt.width / 2, lampAt.top + lampAt.height / 2, 800);
    R.check("no hold on the Theme tool in the dock", (await page.evaluate(() => window.__ll.state.theme)) === "dusk");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
    /* a hold on the lamp switches, with a toast */
    const lb = await rect(page, "#dockBtn");
    await touchHold(page, lb.left + 28, lb.top + 28, 800);
    await page.waitForFunction(() => window.__ll.state.theme === "day", null, { timeout: 1500 }).catch(() => {});
    const h = await page.evaluate(() => ({ theme: window.__ll.state.theme, toast: (document.getElementById("toast") || {}).textContent || "", open: document.body.classList.contains("dock-open") }));
    R.check("a hold on the lamp switches day and night, with a toast, and leaves the dock shut", h.theme === "day" && /Day theme/.test(h.toast) && !h.open, JSON.stringify(h));
    R.check("no page errors (day night)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- a mouse at 390px and a wide phone: no phone chrome ---------- */
  await guard("not a phone", async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.epub");
    R.check("390px with a mouse: the header, no strip, no dock", (await page.evaluate(() => document.querySelector("header").getClientRects().length > 0)) && !(await shown(page, "#readFoot")) && !(await shown(page, "#phoneDock")));
    await ctx.close();
  });

  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
