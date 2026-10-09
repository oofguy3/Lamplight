/* QoL on a phone held in one hand: the reading actions at the foot (PhoneBar), the title and its
   switcher, long presses on the speaker and the lamp, swipe down to close a bottom sheet, the
   settings as a bottom sheet, the bars in Pages flow (vertical swipes and the edge strips, never the
   dictionary from blank space), the one-row player's speed chip, Undo in the toast (bookmark, book,
   highlight), background sounds in one tap, the theme popover's Day/Night switch and its six looks,
   the rows that follow a switch, and the progress pill that fades.
     NODE_PATH=$(npm root -g) node tests/qol.js                                                    */
const path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");

const STUB = `(() => {
  const voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "Samantha" }];
  const synth = { getVoices(){ return voices; }, speak(u){ setTimeout(() => u.onstart && u.onstart({}), 20); }, cancel(){}, pause(){}, resume(){},
    addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; }, configurable: true, writable: true });
  try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); } catch(e){}
})();`;

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const FIX = (f) => path.join(__dirname, "fixtures", f);
  async function phoneCtx(opts){
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, opts || {}));
    await ctx.addInitScript(STUB);
    return ctx;
  }
  /* a finger through the debugger: Playwright's own touchscreen only taps */
  async function touch(page, pts, holdMs){
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
    if (holdMs) await page.waitForTimeout(holdMs);
    for (let i = 1; i < pts.length; i++){ await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pts[i].x, y: pts[i].y }] }); await page.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(450);
  }
  const line = (x1, y1, x2, y2, n) => Array.from({ length: (n || 8) + 1 }, (_, i) => ({ x: x1 + (x2 - x1) * i / (n || 8), y: y1 + (y2 - y1) * i / (n || 8) }));
  const centre = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const open = (page, sel, cls) => page.$eval(sel, (e, c) => e.classList.contains(c || "open"), cls);
  /* on a phone the reading tools live in the dock the lamp opens */
  const dock = async (page) => { await page.evaluate(() => window.__ll.PhoneBar.openDock()); await page.waitForTimeout(250); };

  /* ---------------- 1. the phone's bars ---------------- */
  let ctx = await phoneCtx();
  /* one page, in parts: a part that fails reports it, and the rest still run */
  const part = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); } };
  let page = null;
  await part("phone", async () => {
    page = await newPage(ctx, url);
    await page.setInputFiles("#fileInput", [FIX("sample.md"), FIX("sample.txt")]);
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 2 && document.getElementById("docView").style.display === "block", null, { timeout: 20000 });
    await page.waitForTimeout(500);
    await dock(page);
    const bar = await page.evaluate(() => {
      const row = document.getElementById("actRow"), r = (id) => document.getElementById(id).getBoundingClientRect();
      return { phone: document.body.classList.contains("phonebar"), ids: Array.from(row.children).map((e) => e.id), sizes: Array.from(row.children).map((e) => Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height)),
        rowBottom: Math.round(row.getBoundingClientRect().bottom), search: !!document.getElementById("searchBtn").offsetParent, searchTop: r("searchBtn").top < 60,
        tabs: getComputedStyle(document.getElementById("tabs")).display, title: document.getElementById("fname").textContent, titleFont: getComputedStyle(document.querySelector("#fname .fn-t")).fontFamily,
        role: document.getElementById("fname").getAttribute("role"), dockH: getComputedStyle(document.documentElement).getPropertyValue("--dockH").trim(), rowH: Math.round(row.getBoundingClientRect().height) };
    });
    /* the dock: the tools in its row, at least 48 px each, ids kept; nothing at the foot holds space (--dockH 0) */
    R.check("phone: Contents, Text, Read aloud, Theme and More move into the dock's tool row, each at least 48 px, their ids kept",
      bar.phone && bar.ids.join() === "tocBtn,gear,speakBtn,lamp,more" && bar.sizes.every((s) => s.split("x").every((v) => +v >= 48)) && bar.dockH === "0px" &&
      (await page.evaluate(() => document.getElementById("phoneDock").contains(document.getElementById("actRow")))), JSON.stringify(bar));
    R.check("phone: the dock's head has Search, and the tabs fold into the book's title (the title face, a button)",
      bar.search && bar.tabs === "none" && bar.title === "The Lamp" && /LL Title/.test(bar.titleFont) && bar.role === "button" &&
      (await page.evaluate(() => document.querySelector("#phoneDock .pd-head").contains(document.getElementById("searchBtn")))), JSON.stringify(bar));
    await page.evaluate(() => window.__ll.PhoneBar.closeDock()); await page.waitForTimeout(250);
    /* the row goes and comes back with the bar */
    await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0, 1200)); await page.waitForTimeout(300);
    /* no bar to hide on a phone: the lamp stays where it is while scrolling */
    const lampAt = () => page.evaluate(() => { const r = document.getElementById("dockBtn").getBoundingClientRect(); return { y: Math.round(r.top), shown: getComputedStyle(document.getElementById("readFoot")).display !== "none", hide: document.body.classList.contains("hidebar") }; });
    const gone = await lampAt();
    await page.mouse.wheel(0, -400); await page.waitForTimeout(400);
    const back = await lampAt();
    R.check("phone: scrolling either way leaves the lamp where it is, and nothing hides", gone.shown && back.shown && gone.y === back.y && !gone.hide && !back.hide, JSON.stringify([gone, back]));
    /* the lamp's ring and the note stand in for the progress pill and the 3px line on a phone */
    await page.evaluate(() => { window.scrollBy(0, 40); });
    await page.waitForTimeout(350);
    const pill = await page.evaluate(() => ({ pill: getComputedStyle(document.getElementById("progressInfo")).display, line: getComputedStyle(document.getElementById("progress")).display }));
    R.check("phone: no progress pill and no 3px line while scrolling (the lamp's ring has the place)", pill.pill === "none" && pill.line === "none", JSON.stringify(pill));
    /* the title opens the open books */
    await dock(page); await page.tap("#fname"); await page.waitForTimeout(500);
    const sw = await page.evaluate(() => ({ title: document.getElementById("sideTitle").textContent, rows: Array.from(document.querySelectorAll(".bk-name")).map((e) => e.textContent), cur: (document.querySelector(".bk-open[aria-current]") || {}).textContent || "" }));
    R.check("a tap on the title opens the open books, the one being read marked", sw.title === "Open books" && sw.rows.join("|") === "The Lamp|sample" && /The Lamp/.test(sw.cur), JSON.stringify(sw));
    await page.tap(".bk-row:not(.on) .bk-open");
    await page.waitForFunction(() => /sample\.txt/.test(document.title), null, { timeout: 10000 });
    await page.waitForTimeout(400);
    R.check("…and a tap on another switches to it and closes the sheet", !(await open(page, "#side")) && (await page.$eval("#fname", (f) => f.textContent)) === "sample");
  });
  await part("long presses", async () => {
    /* long presses */
    /* the hold is on the lamp button at the foot (the Theme tool in the dock has none) */
    await touch(page, [await centre(page, "#dockBtn")], 700);
    const lp = await page.evaluate(() => ({ theme: window.__ll.state.theme, pop: document.getElementById("pop").classList.contains("open"), dock: document.body.classList.contains("dock-open") }));
    R.check("a long press on the lamp switches to the night theme without opening the dock or the popover", lp.theme === "dusk" && !lp.pop && !lp.dock, JSON.stringify(lp));
    await page.waitForTimeout(400);
    await touch(page, [await centre(page, "#dockBtn")], 700);
    await page.waitForFunction(() => window.__ll.state.theme === "day", null, { timeout: 1500 }).catch(() => {});
    R.check("…and again back to the day theme", (await page.evaluate(() => window.__ll.state.theme)) === "day");
    await dock(page); await touch(page, [await centre(page, "#speakBtn")], 700);
    const ls = await page.evaluate(() => ({ side: document.getElementById("sideTitle").textContent, open: document.getElementById("side").classList.contains("open"), tts: document.getElementById("tts").classList.contains("on") }));
    R.check("a long press on the speaker opens the voices and does not start reading", ls.open && ls.side === "Read-aloud voices" && !ls.tts, JSON.stringify(ls));
    /* swipe a sheet down to close it */
    const head = await page.$eval("#side .side-title", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
    await touch(page, line(head.x, head.y, head.x, head.y + 40));
    const spring = await page.evaluate(() => ({ open: document.getElementById("side").classList.contains("open"), t: document.getElementById("side").style.transform }));
    await touch(page, line(head.x, head.y, head.x, head.y + 180));
    R.check("a short drag on a sheet's head springs back; past 80 px it closes the sheet", spring.open && spring.t === "" && !(await open(page, "#side")), JSON.stringify(spring));
    await dock(page); await page.tap("#speakBtn"); await page.waitForTimeout(400);
    R.check("a tap on the speaker still starts reading aloud", await open(page, "#tts", "on"));
    await page.evaluate(() => window.__ll.Speak.stop()); await page.waitForTimeout(300);
  });
  await part("settings sheet", async () => {
    /* the settings are a bottom sheet */
    await page.keyboard.press("s"); await page.waitForTimeout(450);
    const st = await page.evaluate(() => { const s = document.getElementById("sheet"), r = s.getBoundingClientRect(), row = document.querySelector(".sheet-tabs-row");
      const shown = Array.from(row.querySelectorAll("button")).filter((x) => x.offsetParent !== null);
      return { pos: getComputedStyle(s).position, bottom: Math.round(r.bottom), h: r.height, scrim: document.getElementById("sheetScrim").classList.contains("on"), title: getComputedStyle(document.querySelector(".sheet-title")).display !== "none",
        tabs: shown.map((x) => x.textContent), cols: new Set(shown.map((x) => Math.round(x.getBoundingClientRect().left))).size, icons: shown.every((x) => !!x.querySelector("svg")),
        close: Math.round(document.getElementById("sheetClose").getBoundingClientRect().width), pdfDim: document.getElementById("pdfGroup").classList.contains("dim"), y: window.scrollY }; });
    R.check("phone: Settings is a bottom sheet — at the foot, ≤ 85vh, a scrim, its title and a 48px close",
      st.pos === "fixed" && st.bottom === 844 && st.h <= 844 * 0.85 + 1 && st.scrim && st.title && st.close === 48, JSON.stringify(st));
    R.check("phone: the sections in a grid of icon and word, three to a row, PDF left out while a text is open", st.cols === 3 && st.icons && st.tabs.indexOf("PDF") < 0 && st.pdfDim && st.tabs.length === 5, JSON.stringify(st));
    const tt = await centre(page, ".sheet-title");
    await touch(page, line(tt.x, tt.y, tt.x, tt.y + 200));
    R.check("…and swiping its title down closes it", !(await open(page, "#sheet")) && !(await open(page, "#sheetScrim", "on")));
  });
  await part("undo", async () => {
    /* the toast's Undo: a bookmark */
    await page.keyboard.press("b"); await page.waitForTimeout(200);
    const t1 = await page.evaluate(() => ({ text: document.getElementById("toast").textContent, act: !!document.querySelector("#toast .toast-act"), marks: window.__ll.Marks.list ? window.__ll.Marks.list().length : null }));
    await page.tap("#toast .toast-act"); await page.waitForTimeout(250);
    const t2 = await page.evaluate(() => ({ text: document.getElementById("toast").textContent, n: document.querySelectorAll("#toast .toast-act").length }));
    R.check("Bookmark here offers Undo in the toast; Undo takes the bookmark away", /^BookmarkedUndo$/.test(t1.text) && t1.act && t2.text === "Bookmark removed" && t2.n === 0, JSON.stringify([t1, t2]));
    const bm = await page.evaluate(() => new Promise((res) => { const id = window.__ll.Library.currentId(); window.__ll.Library.tx("marks", "readonly", (s) => { const q = s.index("doc").getAll(id); q.onsuccess = () => res(q.result.length); }); }));
    R.check("…and nothing of it is kept", bm === 0, String(bm));
    /* …and a highlight removed from its popover comes back, drawn again */
    await page.evaluate(() => window.__ll.Marks.addHighlight(0, 12)); await page.waitForTimeout(200);
    await page.evaluate(() => { const m = document.querySelector("#doc mark.ll-mark"); m.scrollIntoView({ block: "center" }); m.click(); }); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#markPop button[data-act="remove"]').click()); await page.waitForTimeout(250);
    const h1 = await page.evaluate(() => ({ n: window.__ll.Marks.list().length, drawn: document.querySelectorAll("#doc mark.ll-mark").length, toast: document.getElementById("toast").textContent }));
    await page.tap("#toast .toast-act"); await page.waitForTimeout(250);
    const h2 = await page.evaluate(() => ({ n: window.__ll.Marks.list().length, drawn: document.querySelectorAll("#doc mark.ll-mark").length }));
    R.check("removing a highlight offers Undo, and Undo draws it again", h1.n === 0 && h1.drawn === 0 && /^Highlight removedUndo$/.test(h1.toast) && h2.n === 1 && h2.drawn > 0, JSON.stringify([h1, h2]));
  });
  await part("sounds", async () => {
    /* background sounds in one tap from the menu */
    await dock(page); await page.tap("#more"); await page.waitForTimeout(350);
    const mix0 = await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button[role=menuitem]")).some((x) => /Sound mix/.test(x.textContent)));
    await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button")).find((x) => /^Background sounds$/.test(x.querySelector("span").textContent)).click());
    await page.waitForFunction(() => document.getElementById("sndChips"), null, { timeout: 10000 }); await page.waitForTimeout(200);
    await page.tap('#sndChips [data-snd="rain"]'); await page.waitForTimeout(150);
    await page.tap('#sndChips [data-snd="fire"]'); await page.waitForTimeout(150);
    const s1 = await page.evaluate(() => ({ on: document.getElementById("sndOn").checked, pressed: Array.from(document.querySelectorAll("#sndChips [aria-pressed=true]")).map((x) => x.dataset.snd), state: document.getElementById("sndState").textContent, mixShut: !document.getElementById("sndMix").open }));
    R.check("the sounds panel: a tile starts its sound, another joins it; the switch shows it; the mix waits folded", s1.on && s1.pressed.join() === "rain,fire" && s1.state === "Rain and Fire are playing." && s1.mixShut, JSON.stringify(s1));
    await page.tap('#sndChips [data-snd="rain"]'); await page.waitForTimeout(150);
    R.check("…and a playing tile tapped again leaves the rest playing", (await page.evaluate(() => Array.from(document.querySelectorAll("#sndChips [aria-pressed=true]")).map((x) => x.dataset.snd).join())) === "fire");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await dock(page); await page.tap("#more"); await page.waitForTimeout(350);
    const lab = await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button")).filter((x) => /background sounds/i.test(x.textContent)).map((x) => x.querySelector("span").textContent + (x.classList.contains("on") ? "*" : "")));
    await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button")).find((x) => /^Stop background sounds$/.test(x.querySelector("span").textContent)).click());
    await page.waitForTimeout(250);
    const s2 = await page.evaluate(() => ({ on: window.llSounds.isOn(), toast: document.getElementById("toast").textContent }));
    await dock(page); await page.tap("#more"); await page.waitForTimeout(350);
    await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button")).find((x) => /^Background sounds$/.test(x.querySelector("span").textContent)).click());
    await page.waitForTimeout(300);
    const s3 = await page.evaluate(() => ({ on: window.llSounds.isOn(), side: document.getElementById("side").classList.contains("open"), toast: document.getElementById("toast").textContent }));
    R.check("while they play the menu says Stop background sounds (with the on dot) and stops them in one tap",
      lab.join() === "Stop background sounds*" && !s2.on && /^Background sounds offMix…$/.test(s2.toast), JSON.stringify([lab, s2]));
    R.check("…and Background sounds plays the last mix again in one tap, the panel a Mix… away", s3.on && !s3.side && /Fire — playing/.test(s3.toast), JSON.stringify(s3));
    /* the panel keeps an entry of its own once there is a mix (the first time, the tile itself opens it) */
    await dock(page); await page.tap("#more"); await page.waitForTimeout(350);
    const mix1 = await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#moreMenu button[role=menuitem]")).find((x) => /^Sound mix…$/.test(x.querySelector("span").textContent)); if (b) b.click(); return !!b; });
    await page.waitForTimeout(600);
    const mixSide = await page.evaluate(() => document.getElementById("side").classList.contains("open") ? document.getElementById("sideTitle").textContent : "");
    R.check("Sound mix… opens the panel once there is a mix to go back to, and is not there before", !mix0 && mix1 && mixSide === "Background sounds" && (await page.evaluate(() => window.llSounds.isOn())), JSON.stringify({ mix0, mix1, mixSide }));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.evaluate(() => window.llSounds.setOn(false));
  });
  await part("theme", async () => {
    /* the theme popover: Day | Night in its head, then the six looks, each a day theme and a night
       theme drawn side by side, Contrast's the high-contrast pair */
    await dock(page); await page.tap("#lamp"); await page.waitForTimeout(400);
    const tp = await page.evaluate(() => ({ dn: Array.from(document.querySelectorAll("#themePop .pop-head #qDN [data-dn]")).map((x) => x.textContent.trim() + (x.getAttribute("aria-pressed") === "true" ? "*" : "")),
      looks: Array.from(document.querySelectorAll("#qLooks .chip")).map((x) => x.dataset.look), hi: Array.from(document.querySelectorAll('#qLooks [data-look="hicon"] .pg')).map((x) => x.dataset.t),
      gone: ["qDayNight", "qRecentSec", "qHi", "qLight"].filter((id) => document.getElementById(id)),
      tileH: Math.round(document.querySelector("#qLooks .chip").getBoundingClientRect().height), cols: getComputedStyle(document.getElementById("qLooks")).gridTemplateColumns.split(" ").length,
      grid: getComputedStyle(document.getElementById("qLooks")).display, nameUnder: (() => { const c = document.querySelector("#qLooks .chip"), i = c.querySelector("i").getBoundingClientRect(), n = c.querySelector(".tile-n").getBoundingClientRect(); return n.top >= i.bottom && n.height > 10; })(),
      badge: (() => { const on = document.querySelector('#qLooks .chip[aria-pressed="true"]'); if (!on) return ""; const b = getComputedStyle(on, "::before"); return b.content + " " + b.width + " " + b.backgroundColor; })(),
      accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() }));
    R.check("the theme popover leads with the Day/Night switch (the half on screen pressed) and the six looks, Contrast the high-contrast pair; the pickers, Recent and the groups are gone",
      tp.dn.join() === "Day*,Night" && tp.looks.join() === "day,paper,sepia,sage,seaair,hicon" && tp.hi.join() === "hicon,hidark" && !tp.gone.length, JSON.stringify(tp));
    const hex = (h) => "rgb(" + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ") + ")";
    R.check("phone: the looks as a grid of preview tiles at least 44px tall, two to a row, the name under each and a check badge on the one on screen",
      tp.grid === "grid" && tp.cols === 2 && tp.tileH >= 44 && tp.nameUnder && /^"(\\2713|\u2713)" 20px /.test(tp.badge) && tp.badge.endsWith(hex(tp.accent)), JSON.stringify(tp));

    /* the rows that follow Extra dim */
    const d0 = await page.evaluate(() => ({ lvl: document.getElementById("qDimLevelRow").inert, night: document.getElementById("qDimNightRow").inert, cls: document.getElementById("qDimNightRow").classList.contains("dim-row") }));
    await page.tap("#qDim"); await page.waitForTimeout(150);
    const d1 = await page.evaluate(() => ({ lvl: document.getElementById("qDimLevelRow").inert, night: document.getElementById("qDimNightRow").inert, sheet: document.getElementById("dimNightRow").inert }));
    await page.tap("#qDim"); await page.waitForTimeout(150);
    R.check("Extra dim off: its level and Only at night step back and leave the Tab order; on: they come back", d0.lvl && d0.night && d0.cls && !d1.lvl && !d1.night && !d1.sheet, JSON.stringify([d0, d1]));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    /* Day and Night: one tap in the dock, which stays open */
    await dock(page); await page.tap("#dockNight");
    await page.waitForFunction(() => window.__ll.state.theme === "dusk", null, { timeout: 1500 }).catch(() => {});
    R.check("Night is one tap", (await page.evaluate(() => window.__ll.state.theme)) === "dusk" && (await page.$eval("#dockNight", (x) => x.getAttribute("aria-pressed"))) === "true" &&
      (await page.evaluate(() => document.body.classList.contains("dock-open"))));
    await page.tap("#dockDay"); await page.waitForFunction(() => window.__ll.state.theme === "day", null, { timeout: 1500 }).catch(() => {});
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  });
  await part("library", async () => {
    /* the library: a removed book comes back with Undo */
    await page.evaluate(() => window.__ll.Library.home()); await page.waitForTimeout(500);
    const n0 = await page.$$eval("#libList .lib-item", (e) => e.length);
    await page.tap("#libList .lib-item .lib-x"); await page.waitForTimeout(250);
    const n1 = await page.$$eval("#libList .lib-item", (e) => e.length), tx = await page.$eval("#toast", (t) => t.textContent);
    await page.tap("#toast .toast-act"); await page.waitForTimeout(250);
    const n2 = await page.$$eval("#libList .lib-item", (e) => e.length);
    R.check("removing a book takes it off the list at once, and the toast's Undo brings it back", n1 === n0 - 1 && n2 === n0 && /^Removed “.+”Undo$/.test(tx), JSON.stringify({ n0, n1, n2, tx }));
    await page.tap("#libList .lib-item .lib-x"); await page.waitForTimeout(4800);
    const kept = await page.evaluate(() => new Promise((res) => window.__ll.Library.tx("books", "readonly", (s) => { const q = s.getAll(); q.onsuccess = () => res(q.result.length); })));
    R.check("…without Undo it is gone for good once the toast has gone", kept === n0 - 1, String(kept));
    const lh = await page.evaluate(() => ({ journal: document.getElementById("libJournal").className, icon: !!document.querySelector("#libJournal svg"), clear: !!document.getElementById("libClear").closest(".lib-danger"), after: document.querySelector("#library .lib-danger").previousElementSibling.className }));
    R.check("the library: Reading journal a tonal button with its icon, Clear library apart after the list", /tonal/.test(lh.journal) && lh.icon && lh.clear && lh.after === "lib-foot", JSON.stringify(lh));
    R.check("phone: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
  });
  if (page) await page.close();
  await ctx.close();

  /* ---------------- 2. Pages flow: the dock, never the dictionary from blank space ---------------- */
  ctx = await phoneCtx();
  try {
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_prefs", JSON.stringify({ flow: "pages" })); } catch(e){} });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.waitForTimeout(600);
    const imm = () => page.evaluate(() => document.body.classList.contains("dock-open"));
    const shut = async () => { await page.evaluate(() => window.__ll.PhoneBar.closeDock()); await page.waitForTimeout(300); };
    const card = () => page.evaluate(() => document.getElementById("dictCard").classList.contains("open"));
    await touch(page, line(195, 520, 195, 300));
    const up = await imm();
    await touch(page, line(195, 300, 195, 520));
    R.check("Pages flow: a swipe up opens the dock, a swipe down on it closes it, no card", up && !(await imm()) && !(await card()));
    await page.waitForTimeout(400);
    const v2 = await page.evaluate(() => document.getElementById("docView").getBoundingClientRect());
    await page.touchscreen.tap(195, v2.bottom - 20); await page.waitForTimeout(500);
    R.check("a tap on the bottom edge of the page opens the dock and looks nothing up", (await imm()) && !(await card()));
    await shut();
    /* blank space between two paragraphs of the page on screen: the bars, not the nearest word */
    const gap = await page.evaluate(() => { const vr = document.getElementById("docView").getBoundingClientRect();
      const ps = Array.from(document.querySelectorAll("#doc p, #doc h2")).map((p) => p.getBoundingClientRect()).filter((r) => r.left >= vr.left - 1 && r.right <= vr.right + 1 && r.top > vr.top + 80 && r.bottom < vr.bottom - 80).sort((a, b) => a.top - b.top);
      for (let i = 0; i + 1 < ps.length; i++) if (ps[i + 1].top - ps[i].bottom > 8) return { x: vr.left + vr.width / 2, y: (ps[i].bottom + ps[i + 1].top) / 2 }; return null; });
    if (gap){
      await page.touchscreen.tap(gap.x, gap.y); await page.waitForTimeout(500);
      R.check("a tap on the blank between two paragraphs in the middle opens the dock, not a dictionary card", (await imm()) && !(await card()), JSON.stringify(gap));
      await shut();
    } else R.check("a gap between two paragraphs on the page", false);
    const w = await page.evaluate(() => { const vr = document.getElementById("docView").getBoundingClientRect(), tw = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())){ const re = /[A-Za-z]{5,}/g; let m;
        while ((m = re.exec(n.textContent))){ const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect();
          if (b.left > vr.left + vr.width * 0.37 && b.right < vr.left + vr.width * 0.63 && b.top > vr.top + 70 && b.bottom < vr.bottom - 70) return { x: b.left + b.width / 2, y: b.top + b.height / 2, word: m[0] }; } } return null; });
    if (w){ await page.touchscreen.tap(w.x, w.y); await page.waitForTimeout(700); R.check("a word in the middle of the page is still looked up", await card(), JSON.stringify(w)); await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    else R.check("a word in the middle of the page", false);
    const caption = await page.evaluate(() => [...document.querySelectorAll("#flowHint span")].filter((s) => s.getClientRects().length).map((s) => s.textContent).join(" "));
    R.check("the Reading caption says so (its phone wording, the one on screen)", /swipe up or tap the lamp for your reading controls/i.test(caption), caption);
    /* reading aloud in Pages flow: a one-row player at the foot with the strip on it; the page and
       the time left are the lamp's ring and the dock's (no page line) */
    await page.keyboard.press("r"); await page.waitForTimeout(500);
    const pl = await page.evaluate(() => { const t = document.getElementById("tts").getBoundingClientRect(), s = document.getElementById("readFoot").getBoundingClientRect();
      return { stripOn: Math.abs(s.bottom - t.top) <= 1, pager: getComputedStyle(document.getElementById("pager")).display, ttsH: Math.round(t.height), play: Math.round(document.getElementById("ttsPlay").getBoundingClientRect().width) }; });
    R.check("Pages flow while reading aloud: a one-row player at the foot with the strip on it, no page line", pl.stripOn && pl.pager === "none" && pl.ttsH < 90 && pl.play === 56, JSON.stringify(pl));
    R.check("pages: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("pages (exception)", false, String(err).split("\n")[0]); }
  await ctx.close();

  /* ---------------- 3. a narrow window with a mouse: read aloud stays in the bar ---------------- */
  ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await ctx.addInitScript(STUB);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    const nb = await page.evaluate(() => ({ phone: document.body.classList.contains("phonebar"), speak: !!document.getElementById("speakBtn").offsetParent, search: !!document.getElementById("searchBtn").offsetParent,
      overflow: document.documentElement.scrollWidth > window.innerWidth }));
    R.check("390px with a mouse: Read aloud keeps its slot in the bar, Search gives way (the panel's switcher, ⋯ and / reach it)", !nb.phone && nb.speak && !nb.search && !nb.overflow, JSON.stringify(nb));
    await page.keyboard.press("/"); await page.waitForTimeout(350);
    R.check("…and / still opens Search", (await page.$eval("#sideTitle", (t) => t.textContent)) === "Search");
    R.check("narrow: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("narrow (exception)", false, String(err).split("\n")[0]); }
  await ctx.close();

  await b.close(); server.close();
  process.exit(R.done());
})();
