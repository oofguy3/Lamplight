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

  /* ---------- the More sheet leaves out what the dock has ---------- */
  const menuItems = (page) => page.$$eval("#moreMenu button[role=menuitem]", (bs) => bs.map((b) => (b.querySelector("span") || b).textContent.trim()));
  await guard("more sheet", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.md");
    await openDock(page); await page.tap("#more"); await page.waitForTimeout(400);
    const items = await menuItems(page);
    R.check("phone More: no Read aloud, Contents, Search or Library", !items.some((t) => /^(Read aloud|Contents|Search|Library)$/.test(t)) && items.length > 5, items.join(" | "));
    const quick = await page.$$eval("#moreMenu .menu-quick button[role=menuitem]", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { t: b.querySelector("span").textContent, top: Math.round(r.top), w: Math.round(r.width), fs: getComputedStyle(b).fontSize }; }));
    R.check("the quick row: Bookmark here and Previously…, side by side, half the width each", quick.map((q) => q.t).join() === "Bookmark here,Previously…" && quick[0].top === quick[1].top && quick.every((q) => q.w > 150), JSON.stringify(quick));
    R.check("…at 13px or more", quick.every((q) => parseFloat(q.fs) >= 13), JSON.stringify(quick.map((q) => q.fs)));
    R.check("focus starts on Bookmark here", (await page.evaluate(() => document.activeElement && (document.activeElement.querySelector("span") || {}).textContent)) === "Bookmark here");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    /* the library screen on a phone keeps the full menu in its header */
    await page.evaluate(() => window.__ll.Library.home()); await page.waitForTimeout(500);
    await page.tap("#more"); await page.waitForTimeout(400);
    const lib = await menuItems(page);
    R.check("library screen on a phone: today's menu (Open a file…, Settings)", lib.includes("Open a file…") && lib.includes("Settings") && !(await page.evaluate(() => document.body.classList.contains("phonebar"))), lib.join(" | "));
    await page.keyboard.press("Escape");
    await ctx.close();
  });
  await guard("no speech", async () => {
    const ctx = await b.newContext(PHONE);
    await ctx.addInitScript(() => { try { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); } catch(_){} });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await openDock(page);
    const tools = await page.$$eval("#actRow > *", (els) => els.filter((e) => e.getClientRects().length).map((e) => e.id));
    await page.tap("#more"); await page.waitForTimeout(400);
    const items = await menuItems(page);
    R.check("no speech synthesis: four tools, and Read aloud stays in More", tools.join() === "tocBtn,gear,lamp,more" && items.includes("Read aloud"), tools.join() + " / " + items.join(" | "));
    await ctx.close();
  });

  /* ---------- read aloud, the floating pieces, Escape order ---------- */
  const SPEECH = `(() => {
    const voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "Samantha" }];
    const synth = { getVoices(){ return voices; }, speak(u){ setTimeout(() => u.onstart && u.onstart({}), 1); setTimeout(() => u.onend && u.onend({}), 400000); },
      cancel(){}, pause(){}, resume(){}, addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
    HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
  })();`;
  await guard("read aloud", async () => {
    const ctx = await b.newContext(PHONE);
    await ctx.addInitScript(SPEECH);
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_prefs", JSON.stringify({ flow: "pages" })); } catch(_){} });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.waitForTimeout(400);
    await openDock(page); await page.tap("#speakBtn"); await page.waitForTimeout(900);
    const g = await page.evaluate(() => { const t = document.getElementById("tts").getBoundingClientRect(), s = document.getElementById("readFoot").getBoundingClientRect(), l = document.getElementById("dockBtn").getBoundingClientRect(), n = document.getElementById("leftNote");
      return { on: document.getElementById("tts").classList.contains("on"), ttsTop: t.top, ttsBottom: t.bottom, stripTop: s.top, stripBottom: s.bottom, stripH: s.height, lampBottom: l.bottom, note: getComputedStyle(n).display !== "none" && n.getClientRects().length > 0,
        label: (document.querySelector("#speakBtn .tool-l") || {}).textContent, viewBottom: document.getElementById("docView").getBoundingClientRect().bottom }; });
    R.check("read aloud: the player at the foot, the strip on it, the note hidden", g.on && near(g.ttsBottom, 844) && near(g.stripBottom, g.ttsTop) && near(g.stripH, 92) && !g.note, JSON.stringify(g));
    R.check("…the lamp 28px up the strip, the text above both", near(g.lampBottom, g.ttsTop - 28) && g.viewBottom <= g.stripTop + 1, JSON.stringify(g));
    R.check("…and the Read aloud tool says Stop", g.label === "Stop", g.label);
    R.check("…and the focus is on the lamp (reduced motion hides the dock at once)", (await focusId(page)) === "dockBtn", await focusId(page));
    await page.tap("#ttsSpeed"); await page.waitForTimeout(300);
    const top = await page.evaluate(() => { const p = document.getElementById("ttsSpeedPop"), r = p.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + 10); return !p.hidden && !!at && p.contains(at); });
    R.check("the speed popover is on top of the strip", top);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    const h0 = await page.evaluate(() => document.getElementById("tts").offsetHeight), n0 = await page.evaluate(() => window.__ll.state.totalPages);
    await openDock(page);
    const cov = await page.evaluate(() => { const t = document.getElementById("tts").getBoundingClientRect(), at = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return !!at && !!at.closest("#phoneDock"); });
    const h1 = await page.evaluate(() => document.getElementById("tts").offsetHeight), n1 = await page.evaluate(() => window.__ll.state.totalPages);
    R.check("the open dock covers the player; the player's height and the page count unchanged", cov && h1 === h0 && n1 === n0, JSON.stringify({ cov, h0, h1, n0, n1 }));
    await page.evaluate(() => window.__ll.Marks.toast("A toast")); await page.waitForTimeout(400);
    const tb = await page.evaluate(() => ({ toast: document.getElementById("toast").getBoundingClientRect().bottom, dock: document.getElementById("phoneDock").getBoundingClientRect().top }));
    R.check("a toast while the dock is open sits above it", tb.toast <= tb.dock + 1, JSON.stringify(tb));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.evaluate(() => window.__ll.Speak.stop()); await page.waitForTimeout(400);
    R.check("no page errors (read aloud)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await guard("floating", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.md");
    await page.evaluate(() => window.__ll.Auto.start()); await page.waitForTimeout(500);
    const ab = await page.evaluate(() => { const a = document.getElementById("autoBar").getBoundingClientRect(), l = document.getElementById("dockBtn").getBoundingClientRect(); return { bottom: a.bottom, right: a.right, lampTop: l.top, on: document.getElementById("autoBar").classList.contains("on") }; });
    R.check("the auto-scroll pill sits above the lamp, at the right", ab.on && ab.bottom <= ab.lampTop && near(ab.right, 378, 12), JSON.stringify(ab));
    await page.evaluate(() => window.__ll.Auto.stop && window.__ll.Auto.stop()); await page.waitForTimeout(300);
    await page.evaluate(() => window.llJournal.openCard()); await page.waitForTimeout(500);
    const fc = await page.evaluate(() => ({ on: !!document.querySelector("#finish.on"), bottom: document.getElementById("finish").getBoundingClientRect().bottom, stripTop: document.getElementById("readFoot").getBoundingClientRect().top }));
    R.check("the Finished card sits above the strip", fc.on && fc.bottom <= fc.stripTop + 1, JSON.stringify(fc));
    await openDock(page);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    R.check("Escape with the dock over the Finished card closes the dock only", !(await dockOpen(page)) && (await page.evaluate(() => !!document.querySelector("#finish.on"))));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    /* Previously… hangs from the top, under the status bar, and stops above the strip */
    /* the card needs reading history to fill it: a tall one in its place does for where it sits (on a
       short screen, where a card of today's 720px would run under the strip) */
    await page.setViewportSize({ width: 390, height: 640 }); await page.waitForTimeout(300);
    const rc = await page.evaluate(() => { let r = document.getElementById("recap"); if (!r){ r = document.createElement("div"); r.id = "recap"; document.body.appendChild(r); }
      r.innerHTML = "<p>line</p>".repeat(80); r.classList.add("on"); const b = r.getBoundingClientRect(), out = { top: b.top, bottom: b.bottom, stripTop: document.getElementById("readFoot").getBoundingClientRect().top };
      r.classList.remove("on"); return out; });
    R.check("Previously… hangs from the top and stops above the strip", rc.top <= 11 && rc.bottom <= rc.stripTop - 11, JSON.stringify(rc));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    R.check("no page errors (floating)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- zen, switching books, the modes, the copy ---------- */
  const zenOn = (page) => page.evaluate(() => document.body.classList.contains("zen"));
  await guard("zen", async () => {
    const { ctx, page } = await phonePage(b, url, { flow: "pages" });
    await openFixture(page, "sample.md");
    await openDock(page);
    await page.keyboard.press("z"); await page.waitForTimeout(500);
    const z = await page.evaluate(() => ({ zen: document.body.classList.contains("zen"), dock: document.body.classList.contains("dock-open"), op: getComputedStyle(document.getElementById("dockBtn")).opacity,
      note: getComputedStyle(document.getElementById("leftNote")).display !== "none", ring: getComputedStyle(document.querySelector("#dockBtn .ring")).display !== "none",
      line: getComputedStyle(document.getElementById("progress")).display !== "none", toast: (document.getElementById("toast") || {}).textContent || "" }));
    R.check("zen: the dock closes, a faint lamp, no note, no ring, no progress line", z.zen && !z.dock && z.op === "0.4" && !z.note && !z.ring && !z.line, JSON.stringify(z));
    R.check("zen toast: 'Zen mode — tap the lamp to leave'", z.toast === "Zen mode — tap the lamp to leave", z.toast);
    const v = await rect(page, "#docView");
    await page.touchscreen.tap(195, v.bottom - 20); await page.waitForTimeout(400);
    await page.touchscreen.tap(195, v.top + v.height / 2 + 7); await page.waitForTimeout(400);
    R.check("zen: the bottom strip and the middle open nothing", !(await dockOpen(page)) && (await zenOn(page)));
    const hint = await page.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
    R.check("zen: the middle tap's hint says to tap the lamp", hint === "Tap the lamp to leave zen mode", hint);
    /* a key that brings the focus to the lamp makes it clear */
    for (let i = 0; i < 40 && (await focusId(page)) !== "dockBtn"; i++) await page.keyboard.press("Tab");
    R.check("zen: the lamp is clear while a key has brought the focus to it", (await focusId(page)) === "dockBtn" && (await page.$eval("#dockBtn", (e) => getComputedStyle(e).opacity)) === "1");
    await page.tap("#dockBtn"); await page.waitForTimeout(500);
    R.check("zen: a tap on the lamp leaves zen, and opens nothing", !(await zenOn(page)) && !(await dockOpen(page)));
    /* zen from the More sheet: the focus comes back to the lamp after the tap, and it stays faint */
    await openDock(page); await page.tap("#more"); await page.waitForTimeout(300);
    await page.tap("#moreMenu button:has-text('Zen mode')"); await page.waitForTimeout(500);
    const fz = await page.evaluate(() => ({ zen: document.body.classList.contains("zen"), focus: document.activeElement && document.activeElement.id, op: getComputedStyle(document.getElementById("dockBtn")).opacity }));
    R.check("zen from the More sheet: the lamp has the focus and stays faint", fz.zen && fz.focus === "dockBtn" && fz.op === "0.4", JSON.stringify(fz));
    R.check("no page errors (zen)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await guard("switching books", async () => {
    const { ctx, page } = await phonePage(b, url);
    const path = require("path");
    /* an EPUB shows "Opening book…" while it is read; a Markdown file goes straight in */
    await page.setInputFiles("#fileInput", [path.join(__dirname, "fixtures", "sample.md"), path.join(__dirname, "fixtures", "sample.epub")]);
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 2 && document.getElementById("docView").style.display === "block", null, { timeout: 20000 });
    const tabOf = (ext) => page.evaluate((x) => window.__ll.Tabs.list().find((t) => t.name.endsWith(x)).id, ext);
    const read = () => page.waitForFunction(() => window.__ll.state.mode === "doc" && !window.__ll.state.opening, null, { timeout: 20000 });
    const md = await tabOf(".md"), epub = await tabOf(".epub");
    if ((await page.evaluate(() => window.__ll.Tabs.active())) !== md){ await page.evaluate((id) => window.__ll.Tabs.activate(id), md); await read(); }
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__hdrMax = 0; window.__sawStatus = false; const tick = () => { const h = document.querySelector("header").getBoundingClientRect().height; window.__hdrMax = Math.max(window.__hdrMax, h); if (document.body.dataset.mode === "status") window.__sawStatus = true; if (window.__watch) requestAnimationFrame(tick); }; window.__watch = true; requestAnimationFrame(tick); });
    await page.evaluate((id) => window.__ll.Tabs.activate(id), epub);
    await read(); await page.waitForTimeout(300);
    const sw = await page.evaluate(() => { window.__watch = false; return { max: window.__hdrMax, status: window.__sawStatus, pb: document.body.classList.contains("phonebar"), strip: document.getElementById("readFoot").getClientRects().length > 0 }; });
    R.check("switching books: through 'Opening book…', no header box at any frame", sw.max === 0 && sw.status && sw.pb && sw.strip, JSON.stringify(sw));
    /* a book that fails to open, and a format that can't be read: the header, the wordmark and Open come back */
    const pick = (name, bytes) => page.evaluate(([n, b]) => { const f = new File([new Uint8Array(b)], n); const dt = new DataTransfer(); dt.items.add(f); const inp = document.getElementById("fileInput"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true })); }, [name, bytes]);
    const back = async (what) => {
      await page.waitForFunction(() => document.body.dataset.mode === "status" && !window.__ll.state.opening, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => ({ mode: document.body.dataset.mode, pb: document.body.classList.contains("phonebar"), hdr: document.querySelector("header").getClientRects().length }));
      R.check(what + ": the header is back", s.mode === "status" && !s.pb && s.hdr > 0, JSON.stringify(s));
    };
    await pick("broken.pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0, 0, 0]);
    await back("a failed open");
    await page.evaluate((id) => window.__ll.Tabs.activate(id), md); await read(); await page.waitForTimeout(300);
    await pick("letter.rtf", [0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31, 0x7d]);
    await back("a format it can't read");
    await ctx.close();
  });
  await guard("modes", async () => {
    /* the contrast tone: 2px edges, 15px tool names */
    let { ctx, page } = await phonePage(b, url, { theme: "hicon" });
    await openFixture(page, "sample.md");
    await openDock(page);
    const hc = await page.evaluate(() => ({ bw: getComputedStyle(document.getElementById("dockBtn")).borderTopWidth, dock: getComputedStyle(document.getElementById("phoneDock")).borderTopWidth, fs: getComputedStyle(document.querySelector("#actRow .tool-l")).fontSize }));
    R.check("contrast tone: the lamp's and the dock's edges 2px, tool names 15px", hc.bw === "2px" && hc.dock === "2px" && hc.fs === "15px", JSON.stringify(hc));
    await ctx.close();
    /* reduced motion (every phone page here asks for it): no slide */
    const still = (d) => /^0s(, 0s)*$/.test(d);
    ({ ctx, page } = await phonePage(b, url));
    await openFixture(page, "sample.md");
    const rm = await page.$eval("#phoneDock", (e) => getComputedStyle(e).transitionDuration);
    R.check("reduced motion: the dock has no slide", still(rm), rm);
    await ctx.close();
    /* e-ink, on a phone that allows motion: the dock slides until e-ink is on */
    ctx = await b.newContext(Object.assign({}, PHONE, { reducedMotion: "no-preference" }));
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_prefs", JSON.stringify({ flow: "pages" })); } catch(_){} });
    page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    const slide = await page.$eval("#phoneDock", (e) => getComputedStyle(e).transitionDuration);
    await page.evaluate(() => window.__ll.Eink.set(true)); await page.waitForTimeout(300);
    const tr = await page.$eval("#phoneDock", (e) => getComputedStyle(e).transitionDuration);
    R.check("e-ink: the dock has no slide", !still(slide) && still(tr), slide + " → " + tr);
    await ctx.close();
    /* forced colours */
    ctx = await b.newContext(Object.assign({ forcedColors: "active" }, PHONE));
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); } catch(_){} });
    page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    const fc = await page.evaluate(() => { const probe = document.createElement("div"); probe.style.color = "Highlight"; document.body.appendChild(probe); const hl = getComputedStyle(probe).color; probe.remove();
      return { stroke: getComputedStyle(document.querySelector("#dockBtn .ring")).stroke, hl }; });
    R.check("forced colours: the ring is drawn in Highlight", fc.stroke === fc.hl, JSON.stringify(fc));
    await ctx.close();
    /* print: none of the phone's chrome */
    ({ ctx, page } = await phonePage(b, url));
    await openFixture(page, "sample.md");
    await openDock(page);
    await page.emulateMedia({ media: "print" }); await page.waitForTimeout(200);
    const pr = await page.evaluate(() => ["#readFoot", "#phoneDockScrim", "#phoneDock", "#moreMenu"].map((s) => getComputedStyle(document.querySelector(s)).display));
    R.check("print: the strip, the dock and the More sheet are not printed", pr.every((d) => d === "none"), pr.join(","));
    await ctx.close();
  });
  /* tool names at the narrowest width, English and Dutch, in the normal and the contrast tone */
  for (const [locale, theme] of [["en-GB", "day"], ["en-GB", "hicon"], ["nl-NL", "hicon"]]){
    await guard("names " + locale + " " + theme, async () => {
      const ctx = await b.newContext(Object.assign({ locale }, PHONE, { viewport: { width: 320, height: 640 } }));
      await ctx.addInitScript((t) => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_prefs", JSON.stringify({ theme: t })); } catch(_){} }, theme);
      const page = await newPage(ctx, url);
      await openFixture(page, "sample.md");
      await openDock(page);
      const t = await page.evaluate(() => [...document.querySelectorAll("#actRow .tool-l")].filter((l) => l.getClientRects().length).map((l) => { const b = l.parentElement.getBoundingClientRect(), r = l.getBoundingClientRect(), lh = parseFloat(getComputedStyle(l).lineHeight);
        return { t: l.textContent, lines: Math.round(r.height / lh), clip: r.left < b.left - 0.5 || r.right > b.right + 0.5 || l.scrollWidth > l.clientWidth + 1 }; }));
      const note = await page.evaluate(() => { const n = document.getElementById("leftNote"), l = document.getElementById("dockBtn").getBoundingClientRect(); return { right: n.getBoundingClientRect().right, lampLeft: l.left, over: n.scrollWidth > n.clientWidth + 1 }; });
      R.check("320px, " + locale + ", " + theme + ": tool names wrap to two lines at most, nothing clipped", t.every((x) => !x.clip && x.lines <= 2), JSON.stringify(t));
      R.check("320px, " + locale + ", " + theme + ": the note fits beside the lamp", note.right <= note.lampLeft && !note.over, JSON.stringify(note));
      await ctx.close();
    });
  }
  await guard("copy", async () => {
    const ctx = await b.newContext(PHONE);
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); } catch(_){} });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => /Tap the lamp/.test((document.getElementById("toast") || {}).textContent || ""), null, { timeout: 6000 }).catch(() => {});
    R.check("the first-document tip on a phone", ((await page.evaluate(() => (document.getElementById("toast") || {}).textContent)) || "") === "Tap a word for its meaning. Tap the lamp for your reading controls.");
    const hint = await page.evaluate(() => { const h = document.getElementById("flowHint"); return [...h.querySelectorAll("span")].filter((s) => s.getClientRects().length).map((s) => s.textContent).join(" | ") || h.textContent; });
    R.check("the flow hint on a phone tells of the lamp", /^Scroll: tap the lamp for your reading controls\. Pages: tap the left or right edge, or swipe sideways, to turn; swipe up or tap the lamp for your reading controls\.$/.test(hint), hint);
    await page.evaluate(() => window.__ll.Library.home()); await page.waitForTimeout(400);
    await page.evaluate(() => { document.getElementById("tips").hidden = false; });
    const tip = await page.evaluate(() => [...document.querySelectorAll("#tips .tip-row span")].filter((s) => s.getClientRects().length).map((s) => s.textContent));
    R.check("the start screen's third tip on a phone", tip.includes("While reading, tap the lamp for read aloud, stats, zen mode and more."), tip.join(" | "));
    await ctx.close();
  });

  /* ---------- a keyboard on a phone: Space presses the lamp, the open dock holds the page ---------- */
  await guard("keys", async () => {
    const { ctx, page } = await phonePage(b, url, { flow: "pages" });
    await openFixture(page, "sample.md");
    const pg = () => page.evaluate(() => window.__ll.state.page);
    const p0 = await pg();
    await page.focus("#dockBtn"); await page.keyboard.press(" "); await page.waitForTimeout(300);
    R.check("Space on the lamp opens the dock, and turns no page", (await dockOpen(page)) && (await pg()) === p0, JSON.stringify({ open: await dockOpen(page), page: await pg(), p0 }));
    for (const k of ["ArrowRight", "PageDown", "End", "ArrowLeft"]) await page.keyboard.press(k);
    await page.waitForTimeout(300);
    R.check("with the dock open the page keys turn nothing", (await pg()) === p0 && (await dockOpen(page)), String(await pg()));
    await page.focus("#tocBtn"); await page.keyboard.press(" "); await page.waitForTimeout(400);
    R.check("Space on Contents in the dock opens Contents and turns no page", (await page.evaluate(() => document.getElementById("side").classList.contains("open"))) && (await pg()) === p0, String(await pg()));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.focus("#main"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
    R.check("the keys turn the page again once the dock is shut", (await pg()) === p0 + 1, String(await pg()));
    /* the settings sheet (s) under a dock opened from the keyboard: the dock takes its place */
    await page.keyboard.press("s"); await page.waitForTimeout(400);
    await page.focus("#dockBtn"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const d = document.getElementById("phoneDock").getBoundingClientRect(), at = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
      return { sheet: document.getElementById("sheet").classList.contains("open"), dock: document.body.classList.contains("dock-open"), onTop: !!at && !!at.closest("#phoneDock") }; });
    R.check("the dock opened over the settings sheet closes the sheet and is on top", !st.sheet && st.dock && st.onTop, JSON.stringify(st));
    await ctx.close();
  });

  /* ---------- the notch and the home bar (emulated safe areas: 47px top, 34px bottom) ---------- */
  await guard("safe areas", async () => {
    const ctx = await b.newContext(PHONE);
    await ctx.addInitScript(SPEECH);
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); } catch(_){} });
    const page = await newPage(ctx, url);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34 } });
    await openFixture(page, "sample.md");
    const sc = await page.evaluate(() => { const f = document.getElementById("readFoot").getBoundingClientRect(), l = document.getElementById("dockBtn").getBoundingClientRect();
      return { stripH: f.height, lampBottom: l.bottom, mainTop: getComputedStyle(document.getElementById("main")).paddingTop }; });
    R.check("safe areas: the strip grows by the home bar, the lamp sits above it, the text starts below the notch", near(sc.stripH, 126) && near(sc.lampBottom, 844 - 34 - 28) && sc.mainTop === "47px", JSON.stringify(sc));
    await openDock(page);
    const dk = await page.evaluate(() => { const d = document.getElementById("phoneDock"), r = document.getElementById("actRow").getBoundingClientRect(); return { pad: getComputedStyle(d).paddingBottom, rowBottom: r.bottom }; });
    R.check("safe areas: the dock's tools stay above the home bar", dk.pad === "58px" && dk.rowBottom <= 844 - 34 - 24 + 1, JSON.stringify(dk));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    /* Pages flow while reading aloud: the player, at the very foot, keeps its button clear of the home bar */
    await page.evaluate(() => document.querySelector('#flowChips [data-flow="pages"]').click()); await page.waitForTimeout(500);
    await openDock(page); await page.tap("#speakBtn"); await page.waitForTimeout(900);
    const tt = await page.evaluate(() => ({ paged: document.body.classList.contains("paged"), pad: getComputedStyle(document.getElementById("tts")).paddingBottom, play: document.getElementById("ttsPlay").getBoundingClientRect().bottom }));
    R.check("safe areas, Pages flow, reading aloud: the player's buttons stay above the home bar", tt.paged && parseFloat(tt.pad) >= 34 && tt.play <= 844 - 34, JSON.stringify(tt));
    await page.evaluate(() => window.__ll.Speak.stop());
    await ctx.close();
  });

  /* ---------- the strip has its note and the lamp its name as soon as a book opens (Scroll flow, no scroll yet) ---------- */
  await guard("strip on open", async () => {
    const { ctx, page } = await phonePage(b, url);
    await openFixture(page, "sample.epub");
    await page.waitForTimeout(600);
    const o = await page.evaluate(() => ({ note: document.getElementById("leftNote").textContent, pct: document.getElementById("dockPct").textContent, y: window.scrollY }));
    R.check("a book just opened: the note and the lamp's percentage are there before any scroll", o.y === 0 && /left/.test(o.note) && /through the book/.test(o.pct), JSON.stringify(o));
    await ctx.close();
  });

  /* ---------- a mouse at 390px and a wide phone: no phone chrome ---------- */
  await guard("not a phone", async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.epub");
    R.check("390px with a mouse: the header, no strip, no dock", (await page.evaluate(() => document.querySelector("header").getClientRects().length > 0)) && !(await shown(page, "#readFoot")) && !(await shown(page, "#phoneDock")));
    /* the More menu open with the focus in it: a place() (every view change calls one) moves nothing */
    await page.click("#more"); await page.waitForTimeout(400); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(100);
    const mf = await page.evaluate(() => { const a = document.activeElement; window.__ll.PhoneBar.place(); window.__ll.PhoneBar.place(); return { same: document.activeElement === a, inMenu: !!a.closest("#moreMenu"), open: document.getElementById("moreMenu").classList.contains("open") }; });
    R.check("a mouse: place() leaves the open More menu and its focus alone", mf.same && mf.inMenu && mf.open, JSON.stringify(mf));
    await ctx.close();
  });

  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
