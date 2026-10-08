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
