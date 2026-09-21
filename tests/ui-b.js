/* UI-B: the ⋯ menu (groups, icons, keys, the phone sheet), the side panel's switcher between the
   document panels, the dock (read-aloud bar over the page-turn bar, --dockH, the readout) and
   the toasts. Headless Chromium has no voices, so speech is stubbed. Screenshots go to $LL_SHOTS
   (default: the OS temp dir). */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-ui-b");

const STUB = `(function(){
  var voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "Samantha" },
                { name: "Daniel", lang: "en-GB", localService: true, default: false, voiceURI: "Daniel" }];
  var synth = { getVoices: function(){ return voices.slice(); },
    speak: function(u){ setTimeout(function(){ if (u.onstart) u.onstart({}); }, 1); setTimeout(function(){ if (u.onend) u.onend({}); }, 400000); },
    cancel: function(){}, pause: function(){}, resume: function(){}, addEventListener: function(){}, removeEventListener: function(){},
    speaking: false, pending: false, paused: false };
  function Utterance(t){ this.text = t; this.voice = null; this.lang = ""; this.pitch = 1; this.rate = 1; this.volume = 1; this.onend = null; this.onerror = null; this.onstart = null; }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, writable: true, value: synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: Utterance });
  HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
})();`;

/* WCAG contrast of two computed colours ("rgb(r, g, b)") */
function lum(c){
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (!m) return null;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
}
function contrast(a, b){ const la = lum(a), lb = lum(b); if (la === null || lb === null) return 0; return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  async function context(w, h, theme){
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    await ctx.addInitScript(STUB);
    if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("ll_prefs", JSON.stringify({ theme: t })); } catch(_){} }, theme);
    return ctx;
  }
  const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };
  const isOpen = (page, sel) => page.$eval(sel, (el) => el.classList.contains("open"));
  const menuItems = (page) => page.$$eval("#moreMenu button[role=menuitem]", (bs) => bs.map((b) => ({ label: b.querySelector("span").textContent, icon: !!b.querySelector(".mi svg"), key: (b.querySelector("kbd") || {}).textContent || "", on: b.classList.contains("on"), h: b.getBoundingClientRect().height })));
  const groups = (page) => page.$$eval("#moreMenu .menu-group", (gs) => gs.map((g) => g.querySelector(".label").textContent));
  const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || (a.querySelector("span") || {}).textContent || a.tagName) : ""; });

  /* ---------------- 1. the menu on a desktop ---------------- */
  const desk = await context(1200, 800);
  try {
    const page = await newPage(desk, url);
    await page.click("#more"); await page.waitForTimeout(100);
    let items = await menuItems(page);
    R.check("start screen: the app group with Open a file… and Settings", items.some((i) => i.label === "Open a file…" && i.key === "O") && items.some((i) => i.label === "Settings" && i.key === "S"), items.map((i) => i.label).join(" / "));
    R.check("start screen: one group, no columns", (await groups(page)).join() === "Lamplight" && !(await page.$eval("#moreMenu", (m) => m.classList.contains("wide"))));
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    await openFixture(page, "sample.md");
    await page.click("#more"); await page.waitForTimeout(150);
    const g = await groups(page);
    R.check("reading: the groups in order — navigate, marks, reading, tools, app", g.join(" | ") === "Navigate | Bookmarks | Reading | Tools | Lamplight", g.join(" | "));
    items = await menuItems(page);
    R.check("every entry has an icon (the translate entries are the card's)", items.filter((i) => !/^Translate|^Show original/.test(i.label)).every((i) => i.icon), items.filter((i) => !i.icon).map((i) => i.label).join(", "));
    R.check("rows are 44 px", items.every((i) => Math.round(i.h) >= 44), JSON.stringify(items.map((i) => Math.round(i.h))));
    R.check("key hints as pills: C, /, I, B, N, R, L, A, Z, O, G, ?, S", ["C", "/", "I", "B", "N", "R", "L", "A", "Z", "O", "G", "?", "S"].every((k) => items.some((i) => i.key === k)), items.map((i) => i.key).join(" "));
    const order = items.map((i) => i.label);
    R.check("Contents, Search, About first; Open a file…, Library, …, Settings last", order[0] === "Contents" && order[1] === "Search" && order[2] === "About this text" && order.indexOf("Open a file…") > order.indexOf("Print…") && order[order.length - 1] === "Settings", order.join(" / "));
    const box = await page.evaluate(() => { const m = document.getElementById("moreMenu").getBoundingClientRect(), b = document.getElementById("more").getBoundingClientRect(); return { top: m.top, bottom: m.bottom, right: m.right, w: m.width, btnBottom: b.bottom, btnRight: b.right, cols: document.querySelectorAll("#moreMenu .menu-col").length, role: document.getElementById("moreMenu").getAttribute("role") }; });
    R.check("drops under the ⋯ button, right-aligned, role=menu, two columns for a long menu, fits the window", box.top > box.btnBottom && Math.abs(box.right - box.btnRight) < 2 && box.role === "menu" && box.cols === 2 && box.bottom <= 800 && box.w >= 270, JSON.stringify(box));
    R.check("focus lands on the first item", (await active(page)) === "Contents", await active(page));
    await page.keyboard.press("ArrowDown"); R.check("ArrowDown moves to the next item", (await active(page)) === "Search", await active(page));
    await page.keyboard.press("End"); R.check("End goes to the last item", (await active(page)) === "Settings", await active(page));
    await page.keyboard.press("ArrowDown"); R.check("ArrowDown wraps to the first", (await active(page)) === "Contents", await active(page));
    await page.keyboard.press("ArrowUp"); R.check("ArrowUp wraps to the last", (await active(page)) === "Settings", await active(page));
    await page.keyboard.press("Home"); R.check("Home goes to the first", (await active(page)) === "Contents", await active(page));
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    R.check("Escape closes the menu and focus returns to ⋯", !(await isOpen(page, "#moreMenu")) && (await active(page)) === "more" && (await page.$eval("#more", (b) => b.getAttribute("aria-expanded"))) === "false", await active(page));
    /* Escape closes only the menu when the sheet is open under it */
    await page.keyboard.press("s"); await page.waitForTimeout(200);
    await page.click("#more"); await page.waitForTimeout(100);
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    R.check("Escape over the sheet closes the menu only", !(await isOpen(page, "#moreMenu")) && (await isOpen(page, "#sheet")));
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    /* Enter activates; a toggle that is on gets its dot */
    await page.click("#more"); await page.waitForTimeout(100);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    R.check("five ArrowDowns reach Read aloud", (await active(page)) === "Read aloud", await active(page));
    await page.keyboard.press("Enter"); await page.waitForTimeout(300);
    R.check("Enter runs the entry: read aloud starts, the menu closes", (await page.$eval("#tts", (t) => t.classList.contains("on"))) && !(await isOpen(page, "#moreMenu")));
    await page.click("#more"); await page.waitForTimeout(100);
    items = await menuItems(page);
    R.check("Stop reading aloud carries the dot", items.some((i) => i.label === "Stop reading aloud" && i.on), items.filter((i) => i.on).map((i) => i.label).join(", "));
    await shot(page, "menu-1200-day");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__ll.Speak.stop());
    /* Settings from the menu opens the sheet */
    await page.click("#more"); await page.click("#moreMenu button:has-text('Settings')"); await page.waitForTimeout(200);
    R.check("Settings opens the sheet", await isOpen(page, "#sheet"));
    await page.keyboard.press("Escape");
    R.check("desktop menu: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("desktop menu (exception)", false, String(err).split("\n")[0]); }
  await desk.close();

  /* ---------------- 2. the menu on a phone: a sheet of tiles ---------------- */
  const phone = await context(390, 844, "dusk");
  try {
    const page = await newPage(phone, url);
    await openFixture(page, "sample.md");
    await page.click("#more"); await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const r = document.getElementById("moreMenu").getBoundingClientRect(), sc = document.getElementById("moreScrim");
      const tiles = Array.from(document.querySelectorAll("#moreMenu button[role=menuitem]")).map((b) => b.getBoundingClientRect());
      const cols = new Set(tiles.map((t) => Math.round(t.left))).size;
      return { bottom: r.bottom, left: r.left, width: r.width, height: r.height, inner: window.innerHeight, iw: window.innerWidth,
        minH: Math.min.apply(null, tiles.map((t) => t.height)), cols, kbd: getComputedStyle(document.querySelector("#moreMenu kbd")).display,
        grab: !!document.querySelector("#moreMenu .menu-grab"), scrim: !!sc && getComputedStyle(sc).display !== "none", scrollable: document.getElementById("moreMenu").scrollHeight > document.getElementById("moreMenu").clientHeight };
    });
    R.check("phone: a bottom sheet — at the viewport's foot, full width, at most 70vh, scrollable", Math.abs(m.bottom - m.inner) < 1 && m.left === 0 && m.width === m.iw && m.height <= m.inner * 0.7 + 1 && m.scrollable, JSON.stringify(m));
    R.check("phone: tiles ≥ 44 px in three columns, key hints hidden, a handle and a scrim", m.minH >= 44 && m.cols === 3 && m.kbd === "none" && m.grab && m.scrim, JSON.stringify(m));
    R.check("phone: focus on the first tile, arrows move through them", (await active(page)) === "Contents" && (await (async () => { await page.keyboard.press("ArrowRight"); return (await active(page)) === "Search"; })()));
    await shot(page, "menu-390-dusk");
    await page.mouse.click(195, 100); await page.waitForTimeout(200);
    R.check("phone: a tap on the scrim closes it and focus returns to ⋯", !(await isOpen(page, "#moreMenu")) && (await active(page)) === "more", await active(page));
    await page.click("#more"); await page.waitForTimeout(200);
    await page.click("#moreMenu .menu-grab"); await page.waitForTimeout(200);
    R.check("phone: the handle closes it", !(await isOpen(page, "#moreMenu")));
    /* a toast is as wide as its words (up to the margins), not the half of the screen right of the middle */
    await page.evaluate(() => { window.__ll.Marks.toast("Zen mode — press z or Esc to leave"); window.__ll.Updates.offer(); }); await page.waitForTimeout(250);
    const tw = await page.evaluate(() => { const t = document.getElementById("toast").getBoundingClientRect(), u = document.getElementById("updateToast").getBoundingClientRect(); return { toastW: Math.round(t.width), toastH: Math.round(t.height), centre: Math.round(t.left + t.width / 2), updW: Math.round(u.width), updH: Math.round(u.height), updLeft: Math.round(u.left), iw: window.innerWidth }; });
    R.check("phone: the zen toast is one line, centred; the update offer spans the width with two lines at most", tw.toastW >= 250 && tw.toastH < 44 && Math.abs(tw.centre - tw.iw / 2) <= 1 && tw.updW >= 340 && tw.updH < 70 && tw.updLeft >= 16, JSON.stringify(tw));
    await page.click("#updateLater"); await page.waitForTimeout(100);
    R.check("phone menu: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("phone menu (exception)", false, String(err).split("\n")[0]); }
  await phone.close();

  /* ---------------- 3. the side panel: one drawer, a switcher between the document panels ---------------- */
  const side = await context(1200, 800);
  try {
    const page = await newPage(side, url);
    await openFixture(page, "sample.md");
    const sw = () => page.evaluate(() => ({ open: document.getElementById("side").classList.contains("open"), title: document.getElementById("sideTitle").textContent,
      hidden: document.getElementById("sideSwitch").hidden, items: Array.from(document.querySelectorAll("#sideSwitch button")).map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")),
      icons: document.querySelectorAll("#sideSwitch button svg").length, closeIcon: !!document.querySelector("#sideClose svg") }));
    await page.keyboard.press("c"); await page.waitForTimeout(350);
    let s = await sw();
    R.check("Contents shows the switcher: Contents*, Search, Notes, About, with icons, an icon close", s.open && !s.hidden && s.items.join(",") === "Contents*,Search,Notes,About" && s.icons === 4 && s.closeIcon, JSON.stringify(s));
    const fits = await page.evaluate(() => Array.from(document.querySelectorAll("#sideSwitch button")).every((b) => b.scrollWidth <= b.clientWidth + 1));
    R.check("the switcher's labels fit their pills", fits);
    await shot(page, "panel-switch-1200-day");
    /* switch in place: the drawer never closes */
    await page.evaluate(() => { window.__sideClosed = 0; new MutationObserver(() => { if (!document.getElementById("side").classList.contains("open")) window.__sideClosed++; }).observe(document.getElementById("side"), { attributes: true, attributeFilter: ["class"] }); });
    await page.click("#sideSwitch button[data-panel=find]"); await page.waitForTimeout(250);
    s = await sw();
    R.check("clicking Search swaps the panel in place: still open, titled Search, Search selected", s.open && s.title === "Search" && s.items.join(",") === "Contents,Search*,Notes,About" && (await page.evaluate(() => window.__sideClosed)) === 0 && !!(await page.$("#findInput")), JSON.stringify(s));
    R.check("focus moved into the new panel", (await active(page)) === "findInput", await active(page));
    await page.click("#sideSwitch button[data-panel=about]"); await page.waitForTimeout(250);
    s = await sw();
    R.check("then About", s.open && s.title === "About this text" && s.items[3] === "About*", JSON.stringify(s));
    await page.click("#sideSwitch button[data-panel=marks]"); await page.waitForTimeout(250);
    s = await sw();
    R.check("then Notes", s.open && s.title === "Bookmarks & notes" && s.items[2] === "Notes*" && (await page.evaluate(() => window.__sideClosed)) === 0, JSON.stringify(s));
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    R.check("Escape closes the drawer", !(await sw()).open);
    /* tool panels have no switcher */
    await page.evaluate(() => window.llFonts.openPanel()); await page.waitForTimeout(350);
    s = await sw();
    R.check("the Fonts panel shows no switcher, its group labels carry .sec", s.open && s.hidden && s.title === "Fonts" && (await page.$$eval("#sideBody .font-group.sec", (e) => e.length)) > 0, JSON.stringify(s));
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    await page.keyboard.press("g"); await page.waitForTimeout(350);
    s = await sw();
    R.check("Reading stats: no switcher, its labels carry .sec", s.open && s.hidden && (await page.$$eval("#sideBody .label.sec", (e) => e.length)) >= 4, JSON.stringify(s));
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    await page.keyboard.press("i"); await page.waitForTimeout(600);
    R.check("About: the switcher, its headings carry .sec", !(await sw()).hidden && (await page.$$eval("#sideBody .about-h.sec", (e) => e.length)) >= 3);
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    /* the drawer is modal: Tab stays inside it, and what opens elsewhere closes it first */
    R.check("the drawer is a div with role=dialog (no aside carrying a dialog role)", await page.$eval("#side", (s) => s.tagName === "DIV" && s.getAttribute("role") === "dialog" && s.getAttribute("aria-modal") === "true"));
    await page.keyboard.press("c"); await page.waitForTimeout(350);
    let inside = true;
    for (let k = 0; k < 12; k++){ await page.keyboard.press("Tab"); if (!(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest("#side"))))) inside = false; }
    R.check("Tab twelve times from Contents never leaves the drawer", inside, await active(page));
    R.check("the page behind the drawer is inert", await page.evaluate(() => document.querySelector("header").inert === true && document.getElementById("main").inert === true));
    await page.keyboard.press("s"); await page.waitForTimeout(300);
    R.check("s opens the sheet and closes the drawer rather than opening under it", (await isOpen(page, "#sheet")) && !(await sw()).open && (await page.evaluate(() => document.querySelector("header").inert !== true)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    /* a panel with no controls (Keyboard shortcuts) scrolls from the keyboard: its body takes focus */
    await page.evaluate(() => window.scrollTo(0, 300)); await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("?"); await page.waitForTimeout(400);
    R.check("Keyboard shortcuts: focus lands on the scrolling body, a named region", (await active(page)) === "sideBody" && (await page.$eval("#sideBody", (b) => b.getAttribute("role") === "region" && b.getAttribute("aria-labelledby") === "sideTitle" && b.tabIndex === 0)), await active(page));
    await page.keyboard.press("PageDown"); await page.waitForTimeout(400);
    const sc = await page.evaluate(() => ({ body: document.getElementById("sideBody").scrollTop, win: window.scrollY }));
    R.check("PageDown scrolls the panel, not the page behind it", sc.body > 0 && sc.win === y0, JSON.stringify(sc) + " y0 " + y0);
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    await page.keyboard.press("p"); await page.waitForTimeout(500);
    const pg0 = await page.$eval("#pgInfo", (e) => e.textContent);
    await page.keyboard.press("?"); await page.waitForTimeout(400);
    await page.keyboard.press("PageDown"); await page.waitForTimeout(300);
    R.check("in Pages flow PageDown in the panel does not turn the page", (await page.$eval("#pgInfo", (e) => e.textContent)) === pg0 && (await page.evaluate(() => document.getElementById("sideBody").scrollTop > 0)));
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    await page.keyboard.press("p"); await page.waitForTimeout(400);
    R.check("side panel: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("side panel (exception)", false, String(err).split("\n")[0]); }
  await side.close();

  /* ---------------- 4. the dock: read-aloud bar over the page-turn bar; the readout ---------------- */
  const dockCtx = await context(1200, 800);
  try {
    const page = await newPage(dockCtx, url);
    await openFixture(page, "sample.md");
    const pg = () => page.$eval("#pgInfo", (e) => e.textContent);
    await page.keyboard.press("p"); await page.waitForTimeout(450);
    R.check("pages flow: the readout starts with the fraction and ends with the time left", /^1 \/ \d+ · .* · .*left$/.test(await pg()) || /^1 \/ \d+ · .*left$/.test(await pg()), await pg());
    R.check("scroll flow's pill stays off in Pages flow", !(await page.$eval("#progressInfo", (e) => e.classList.contains("on"))));
    /* the pager and the title follow one rule: the section at the page's first character */
    const secOf = () => page.evaluate(() => ({ pager: (document.querySelector("#pgInfo .pg-sec") || {}).textContent || "", title: document.getElementById("fname").dataset.sec || "" }));
    await page.keyboard.press("End"); await page.waitForTimeout(700);
    let t = await pg(), s = await secOf();
    R.check("the last page names a late chapter after the fraction, the same one the title names", /^\d+ \/ \d+ · Chapter [34]/.test(t) && s.pager === " · " + s.title, t + " vs " + JSON.stringify(s));
    await page.keyboard.press("Home"); await page.waitForTimeout(700);
    s = await secOf();
    R.check("the first page reads The Lamp in both readouts", s.title === "The Lamp" && s.pager === " · The Lamp", JSON.stringify(s));
    let n = 0, agree = true;
    while (n++ < 12 && !/Chapter 2/.test(await pg())){
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
      s = await secOf(); if (s.pager !== " · " + s.title) agree = false;
    }
    t = await pg();
    R.check("moving into chapter 2 shows Chapter 2", /^\d+ \/ \d+ · Chapter 2/.test(t), t);
    R.check("on every page turned the pager's section equalled the title's", agree);
    const chevrons = await page.evaluate(() => ["prevPg", "nextPg", "ttsPrev", "ttsNext", "ttsStop", "autoStop", "autoPlay", "autoSlower", "autoFaster"].every((id) => !!document.getElementById(id).querySelector("svg")));
    R.check("the bars' buttons are icons", chevrons);
    await page.keyboard.press("r"); await page.waitForTimeout(500);
    const d = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect(), tts = r("tts"), pager = r("pager"), dock = r("dock"), view = r("docView"), head = document.querySelector("header").getBoundingClientRect();
      return { tts: { top: tts.top, bottom: tts.bottom, h: tts.height }, pager: { top: pager.top, bottom: pager.bottom, h: pager.height }, dock: { top: dock.top, bottom: dock.bottom, h: dock.height },
        dockH: getComputedStyle(document.documentElement).getPropertyValue("--dockH").trim(), viewH: view.height, viewBottom: view.bottom, headH: head.height, inner: window.innerHeight,
        playIcon: !!document.querySelector("#ttsPlay svg"), play: document.getElementById("ttsPlay").getAttribute("aria-label") };
    });
    R.check("read aloud on: the bar sits over the pager, neither overlaps, the dock is at the foot", d.tts.bottom <= d.pager.top + 0.5 && Math.abs(d.pager.bottom - d.inner) < 1 && d.tts.top >= d.dock.top - 0.5, JSON.stringify(d));
    R.check("--dockH is their combined height", d.dockH === Math.round(d.dock.h) + "px" && Math.abs(d.dock.h - (d.tts.h + d.pager.h)) < 1, d.dockH + " vs " + d.tts.h + " + " + d.pager.h);
    R.check("the pages clear the dock: header + view + dock ≈ the window", Math.abs(d.headH + d.viewH + d.dock.h + 26 - d.inner) <= 3 && d.viewBottom <= d.dock.top + 1, JSON.stringify({ head: d.headH, view: d.viewH, dock: d.dock.h, inner: d.inner }));
    R.check("the play button shows the pause icon while reading", d.playIcon && d.play === "Pause", d.play);
    await page.evaluate(() => window.__ll.Speak.pause());
    R.check("…and the play icon when paused", await page.evaluate(() => !!document.querySelector("#ttsPlay svg") && document.getElementById("ttsPlay").getAttribute("aria-label") === "Play"));
    await page.keyboard.press("a"); await page.waitForTimeout(150);
    const a = await page.evaluate(() => { const r = document.getElementById("autoBar").getBoundingClientRect(), dock = document.getElementById("dock").getBoundingClientRect(); return { above: r.bottom <= dock.top, gap: dock.top - r.bottom, playIcon: !!document.querySelector("#autoPlay svg"), label: document.getElementById("autoPlay").getAttribute("aria-label") }; });
    R.check("the auto-scroll pill floats above the dock with a pause icon", a.above && a.gap >= 10 && a.gap <= 16 && a.playIcon && a.label === "Pause", JSON.stringify(a));
    await page.evaluate(() => window.__ll.Marks.toast("Bookmarked")); await page.waitForTimeout(150);
    const tb = await page.evaluate(() => { const r = document.getElementById("toast").getBoundingClientRect(), ab = document.getElementById("autoBar").getBoundingClientRect(); return { aboveAuto: r.bottom <= ab.top, text: document.getElementById("toast").textContent }; });
    R.check("while auto-scroll runs a toast steps up above its pill", tb.aboveAuto && tb.text === "Bookmarked", JSON.stringify(tb));
    await shot(page, "dock-pages-1200-day");
    await page.keyboard.press("a"); await page.waitForTimeout(100);
    await page.evaluate(() => window.__ll.Speak.stop()); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ dockH: getComputedStyle(document.documentElement).getPropertyValue("--dockH").trim(), pagerH: document.getElementById("pager").getBoundingClientRect().height }));
    R.check("read aloud off: --dockH is the pager alone", after.dockH === Math.round(after.pagerH) + "px", JSON.stringify(after));
    /* zen keeps the bar, drops the pager: the dock follows */
    await page.keyboard.press("r"); await page.waitForTimeout(300);
    await page.keyboard.press("z"); await page.waitForTimeout(450);
    const z = await page.evaluate(() => ({ dockH: getComputedStyle(document.documentElement).getPropertyValue("--dockH").trim(), ttsH: document.getElementById("tts").getBoundingClientRect().height, pagerH: getComputedStyle(document.documentElement).getPropertyValue("--pagerH").trim() }));
    R.check("zen: the dock is the read-aloud bar alone, --pagerH is 0", z.dockH === Math.round(z.ttsH) + "px" && z.pagerH === "0px", JSON.stringify(z));
    await page.keyboard.press("z"); await page.waitForTimeout(300);
    await page.evaluate(() => window.__ll.Speak.stop());
    /* a PDF: the readout keeps the fraction first, and a spread shows both of its pages side by side */
    await openFixture(page, "sample.pdf"); await page.waitForTimeout(300);
    R.check("pdf: the readout starts with the page fraction", /^\d+(–\d+)? \/ \d+/.test(await pg()), await pg());
    if (!(await page.evaluate(() => document.body.classList.contains("paged")))){ await page.keyboard.press("p"); }
    await page.waitForTimeout(600);
    const sp = await page.evaluate(() => ({ disp: getComputedStyle(document.getElementById("pdf")).display, pg: document.getElementById("pgInfo").textContent,
      cv: Array.from(document.querySelectorAll("#pdf canvas")).map((c) => { const r = c.getBoundingClientRect(); return { left: Math.round(r.left), bottom: Math.round(r.bottom) }; }), ih: window.innerHeight }));
    R.check("pdf spread: two pages side by side, both on screen, the readout counting both", sp.disp === "flex" && sp.cv.length === 2 && sp.cv[0].left < sp.cv[1].left && sp.cv.every((c) => c.bottom <= sp.ih) && /^1–2 \//.test(sp.pg), JSON.stringify(sp));
    await page.keyboard.press("p"); await page.waitForTimeout(400);
    R.check("dock: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("dock (exception)", false, String(err).split("\n")[0]); }
  await dockCtx.close();

  /* ---------------- 4b. the dock grows without a resize: the pages follow; --headH follows the tabs strip ---------------- */
  const growCtx = await context(760, 800);
  try {
    const page = await newPage(growCtx, url);
    await openFixture(page, "sample.md");
    const dock = () => page.evaluate(() => { const d = document.getElementById("dock").getBoundingClientRect(), v = document.getElementById("docView").getBoundingClientRect(); return { wrap: document.getElementById("tts").classList.contains("tts-wrap"), dockH: getComputedStyle(document.documentElement).getPropertyValue("--dockH").trim(), dockTop: d.top, dockHpx: Math.round(d.height), viewBottom: v.bottom }; });
    await page.keyboard.press("p"); await page.waitForTimeout(450);
    const g0 = await dock();
    /* read aloud joins the pager in the dock, with no resize to prompt a new measurement */
    await page.evaluate(() => { window.__ll.Speak.start(); }); await page.waitForTimeout(450);
    const g1 = await dock();
    R.check("starting read aloud makes the dock taller and --dockH follows", g1.dockHpx > g0.dockHpx + 20 && g1.dockH === g1.dockHpx + "px", JSON.stringify([g0, g1]));
    R.check("the pages are laid out again to clear the taller dock", g1.viewBottom <= g1.dockTop + 0.5, JSON.stringify(g1));
    /* the sleep timer's chip joins the compact bar without costing it a second row */
    await page.evaluate(() => window.llSpeak.setSleep(15)); await page.waitForTimeout(400);
    const gs = await dock();
    R.check("the sleep timer's chip fits the row and leaves --dockH where it was", !gs.wrap && gs.dockHpx === g1.dockHpx && gs.dockH === gs.dockHpx + "px", JSON.stringify(gs));
    await page.evaluate(() => window.llSpeak.setSleep(0)); await page.waitForTimeout(400);
    await page.evaluate(() => window.__ll.Speak.stop()); await page.waitForTimeout(450);
    const g2 = await dock();
    R.check("stopping gives the room back to the pages", g2.dockHpx === g0.dockHpx && Math.abs(g2.dockTop - g2.viewBottom - 12) <= 1, JSON.stringify([g0, g2]));
    R.check("dock growth: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("dock growth (exception)", false, String(err).split("\n")[0]); }
  await growCtx.close();
  const tabsCtx = await context(390, 844);
  try {
    const page = await newPage(tabsCtx, url);
    await page.setInputFiles("#fileInput", [path.join(__dirname, "fixtures", "sample.md"), path.join(__dirname, "fixtures", "sample.txt")]);
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 2 && document.getElementById("docView").style.display === "block", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.mouse.move(200, 500); await page.mouse.wheel(0, 60); await page.waitForTimeout(400);
    const h = await page.evaluate(() => ({ headH: getComputedStyle(document.documentElement).getPropertyValue("--headH").trim(), header: document.querySelector("header").offsetHeight + "px",
      pillTop: document.getElementById("progressInfo").getBoundingClientRect().top, tabsBottom: document.getElementById("tabs").getBoundingClientRect().bottom, on: document.getElementById("progressInfo").classList.contains("on") }));
    R.check("phone, two tabs: --headH is the taller header and the progress pill sits under the tabs strip", h.headH === h.header && h.on && h.pillTop >= h.tabsBottom, JSON.stringify(h));
    await page.close();
  } catch (err){ R.check("tabs strip height (exception)", false, String(err).split("\n")[0]); }
  await tabsCtx.close();

  /* ---------------- 5. toasts: one style, readable on the hard themes ---------------- */
  for (const theme of ["candle", "terminal", "newsprint", "hidark"]){
    const ctx = await context(1200, 800, theme);
    try {
      const page = await newPage(ctx, url);
      await openFixture(page, "sample.md");
      await page.evaluate(() => {
        window.__ll.Marks.toast("Bookmarked");
        window.__ll.Updates.offer();   /* the real update toast, which reports its height */
        const s = document.createElement("div"); s.id = "trStatus"; s.className = "on"; s.innerHTML = '<span class="tr-msg">Translating… 3 of 12</span><button type="button" class="tr-x">Cancel</button>';
        document.body.appendChild(s);
        window.scrollTo(0, 400); window.__ll.Progress.tick();
      });
      await page.waitForTimeout(200);
      const c = await page.evaluate(() => {
        const cs = (el) => getComputedStyle(el);
        const pick = (id) => { const el = document.getElementById(id), s = cs(el); return { color: s.color, bg: s.backgroundColor, radius: s.borderTopLeftRadius, border: s.borderTopWidth, shadow: s.boxShadow !== "none", bottom: s.bottom }; };
        const btn = (sel) => { const el = document.querySelector(sel), s = cs(el); return { color: s.color, bg: s.backgroundColor, radius: s.borderTopLeftRadius }; };
        const rt = (id) => document.getElementById(id).getBoundingClientRect();
        return { toast: pick("toast"), update: pick("updateToast"), tr: pick("trStatus"), pill: pick("progressInfo"), reload: btn("#updateReload"), later: btn("#updateLater"), cancel: btn("#trStatus .tr-x"),
          panel: cs(document.body).getPropertyValue("--panel").trim(), rects: { toast: rt("toast").bottom, dockTop: rt("dock").top, tr: rt("trStatus").bottom, toastTop: rt("toast").top, updateTop: rt("updateToast").top, updateBottom: rt("updateToast").bottom },
          under: (() => { const r = rt("toast"), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el ? (el.closest("#updateToast") ? "updateToast" : (el.id || el.tagName)) : ""; })(), laterIcon: !!document.querySelector("#updateLater svg") };
      });
      const same = (x) => x.radius === "12px" && x.border === "1px" && x.shadow && x.bg === c.toast.bg;
      R.check(theme + ": the toast, the update toast, the translate pill and the progress pill share one style", same(c.toast) && same(c.update) && same(c.tr) && same(c.pill), JSON.stringify(c));
      const ratios = { toast: contrast(c.toast.color, c.toast.bg), update: contrast(c.update.color, c.update.bg), tr: contrast(c.tr.color, c.tr.bg), pill: contrast(c.pill.color, c.pill.bg), later: contrast(c.later.color, c.update.bg), cancel: contrast(c.cancel.color, c.tr.bg), reload: contrast(c.reload.color, c.reload.bg) };
      R.check(theme + ": text on every toast ≥ 4.5:1 (the accent chip ≥ 3:1)", Object.keys(ratios).every((k) => k === "reload" ? ratios[k] >= 3 : ratios[k] >= 4.5), JSON.stringify(ratios));
      R.check(theme + ": the buttons are chips, Later carries the shared close icon", c.reload.radius === "999px" && c.later.radius === "999px" && c.cancel.radius === "999px" && c.laterIcon, JSON.stringify([c.reload.radius, c.later.radius, c.cancel.radius]));
      R.check(theme + ": the translate pill sits above the toast, both above the foot", c.rects.tr < c.rects.toastTop && c.rects.toast <= 800 - 18, JSON.stringify(c.rects));
      R.check(theme + ": the toast steps up over the update offer instead of hiding behind it", c.rects.toast <= c.rects.updateTop && c.rects.updateBottom <= 800 - 18 && c.under !== "updateToast", JSON.stringify({ toast: c.rects.toast, updateTop: c.rects.updateTop, under: c.under }));
      await page.click("#updateLater"); await page.waitForTimeout(100);
      R.check(theme + ": Later removes the offer and its height", await page.evaluate(() => !document.getElementById("updateToast") && !document.body.style.getPropertyValue("--updateH")));
      await shot(page, "toasts-1200-" + theme);
      await page.close();
    } catch (err){ R.check("toasts " + theme + " (exception)", false, String(err).split("\n")[0]); }
    await ctx.close();
  }

  /* ---------------- 5b. the menu's key hints and the search list's current row read on the hard themes ---------------- */
  /* text on a translucent tint: the tint over what is behind it, then the text over that */
  const TINTED = `(el, tint, behind) => {
    const parse = (s) => { if (/^color\\(srgb/.test(s)){ const m = s.match(/[\\d.]+/g).map(Number); return { rgb: m.slice(0, 3).map((c) => c * 255), a: m.length > 3 ? m[3] : 1 }; }
      const m = (s.match(/[\\d.]+/g) || [0, 0, 0]).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
    const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const base = parse(getComputedStyle(behind).backgroundColor).rgb, bg = over(parse(getComputedStyle(tint).backgroundColor), base), fg = over(parse(getComputedStyle(el).color), bg);
    const [x, y] = [lum(fg), lum(bg)]; return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
  }`;
  for (const theme of ["day", "dusk", "newsprint", "terminal", "ink", "slate"]){
    const ctx = await context(1200, 800, theme);
    try {
      const page = await newPage(ctx, url);
      await openFixture(page, "sample.md");
      await page.click("#more"); await page.waitForTimeout(150);
      const kbd = await page.evaluate((src) => { const f = eval(src), k = document.querySelector("#moreMenu kbd"); return f(k, k, document.getElementById("moreMenu")); }, TINTED);
      R.check(theme + ": the menu's key pills read at ≥ 4.5:1", kbd >= 4.5, String(kbd));
      await page.keyboard.press("Escape");
      await page.keyboard.press("/"); await page.waitForTimeout(300);
      await page.keyboard.type("chair"); await page.waitForTimeout(600);
      await page.keyboard.press("Enter"); await page.waitForTimeout(400);
      const f = await page.evaluate((src) => { const f = eval(src), row = document.querySelector(".find-item.cur"), side = document.getElementById("side");
        return row ? { where: f(row.querySelector(".find-where"), row, side), match: f(row.querySelector("b"), row, side) } : null; }, TINTED);
      R.check(theme + ": the current search result's location and match read at ≥ 4.5:1", f && f.where >= 4.5 && f.match >= 4.5, JSON.stringify(f));
      await page.keyboard.press("Escape");
      await page.close();
    } catch (err){ R.check("tints " + theme + " (exception)", false, String(err).split("\n")[0]); }
    await ctx.close();
  }

  /* ---------------- 6. pictures: the four themes, desktop and phone ---------------- */
  for (const [w, h, tag] of [[1200, 800, "1200"], [390, 844, "390"]]){
    for (const theme of ["day", "dusk", "newsprint", "terminal"]){
      const ctx = await context(w, h, theme);
      try {
        const page = await newPage(ctx, url);
        await openFixture(page, "sample.md");
        await page.click("#more"); await shot(page, "menu-" + tag + "-" + theme);
        await page.keyboard.press("Escape"); await page.waitForTimeout(100);
        await page.keyboard.press("c"); await shot(page, "panel-" + tag + "-" + theme);
        await page.keyboard.press("Escape"); await page.waitForTimeout(350);
        await page.keyboard.press("p"); await page.waitForTimeout(400);
        await page.keyboard.press("ArrowRight"); await page.waitForTimeout(250);
        await page.keyboard.press("r"); await page.waitForTimeout(400);
        await page.evaluate(() => window.__ll.Marks.toast("Bookmarked")); await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(SHOTS, "dock-toast-" + tag + "-" + theme + ".png") });
        R.check("pictures " + tag + " " + theme + ": no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
        await page.close();
      } catch (err){ R.check("pictures " + tag + " " + theme + " (exception)", false, String(err).split("\n")[0]); }
      await ctx.close();
    }
  }

  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})();
