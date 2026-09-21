/* Library, round two: pinned books, the up-next order, the finish forecast on the cards and the
   Continue card, and the Storage panel (what is kept on this device and the ways to let it go).
     NODE_PATH=$(npm root -g) node tests/library2.js      (LL_SHOTS=<dir> to choose where screenshots go) */
const path = require("path"), os = require("os"), fs = require("fs");
const { serve, browser, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-library2");

/* a reader with a fortnight behind them, so the forecast can say how many evenings are left */
const T0 = new Date("2026-09-16T10:00:00");
function dayKey(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function shift(n){ const d = new Date(T0.getTime()); d.setDate(d.getDate() + n); return dayKey(d); }
function history(){
  const days = {};
  for (let i = 1; i <= 10; i++) days[shift(-i)] = { ms: 20 * 60000, words: 4000, pages: 0, docs: [] };
  return { v: 1, goal: 10, days: days, books: {}, best: { streak: 0, day: "" }, notified: "" };
}
/* the browser's storage manager, faked: nothing is really made persistent in a test profile */
const STORAGE_STUB = `(function(){
  window.__persistCalls = 0; window.__persisted = false;
  try { localStorage.setItem("ll_persist", "granted"); } catch(e){}
  try {
    var s = navigator.storage;
    Object.defineProperty(s, "persist", { configurable: true, value: function(){ window.__persistCalls++; window.__persisted = true; return Promise.resolve(true); } });
    Object.defineProperty(s, "persisted", { configurable: true, value: function(){ return Promise.resolve(!!window.__persisted); } });
  } catch(e){}
})();`;

const cards = (page) => page.$$eval("#libList .lib-item", (els) => els.map((e) => ({
  name: e.querySelector(".lib-name").textContent,
  pinned: e.classList.contains("pinned"),
  pressed: e.querySelector(".lib-pin").getAttribute("aria-pressed"),
  pinTitle: e.querySelector(".lib-pin").getAttribute("title"),
  moves: e.querySelectorAll(".lib-move").length,
  left: (e.querySelector(".lib-left") || {}).textContent || ""
})));
const groups = (page) => page.$$eval("#libList .lib-group", (els) => els.map((e) => e.textContent));
const headLabel = (page) => page.$eval("#library .lib-head .label", (e) => e.firstChild.nodeValue.trim());
const cont = (page) => page.evaluate(() => {
  const c = document.getElementById("continueCard");
  if (!c) return null;
  return { lead: c.querySelector(".label").textContent, title: c.querySelector(".cc-title").textContent,
           left: (c.querySelector(".cc-left") || {}).textContent || "", go: c.querySelector(".cc-go").textContent.trim() };
});
const panelText = (page) => page.$eval("#sideBody", (b) => b.innerText);
const panelTitle = (page) => page.evaluate(() => document.getElementById("side").classList.contains("open") ? document.getElementById("sideTitle").textContent : "closed");
/* the app writes positions when the reader moves; nudge the page and wait for the save */
async function readSome(page, to){
  await page.evaluate((f) => window.scrollTo(0, document.documentElement.scrollHeight * f), to);
  await page.waitForTimeout(900);
}
const card = (page, i) => page.locator("#libList .lib-item").nth(i);
async function home(page){ await page.keyboard.press("h"); await page.waitForTimeout(400); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const errors = [];
  const note = (page, where) => (page._errors || []).forEach((e) => errors.push(where + ": " + e));

  async function context(w, h, theme, touch){
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch });
    await ctx.addInitScript(STORAGE_STUB);
    /* seeded once per tab: a reload after "Clear everything" must not put it all back */
    await ctx.addInitScript((d) => {
      try { if (sessionStorage.getItem("ll_seeded")) return; sessionStorage.setItem("ll_seeded", "1"); } catch(e){}
      try { localStorage.setItem("ll_stats", JSON.stringify(d.stats)); } catch(e){}
      try { if (d.theme) localStorage.setItem("ll_prefs", JSON.stringify({ theme: d.theme })); } catch(e){}
      try { localStorage.setItem("ll_tips", "seen"); } catch(e){}
    }, { stats: history(), theme });
    return ctx;
  }
  async function fresh(ctx){
    const page = await ctx.newPage();
    page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
    await page.goto(url, { waitUntil: "load" });
    return page;
  }

  /* ---------- 1. pinning, the order, and the Continue card ---------- */
  let ctx = await context(1200, 800, "day");
  let page = await fresh(ctx);
  await openFixture(page, "sample.md"); await readSome(page, 0.4);
  await openFixture(page, "sample.txt"); await readSome(page, 0.3);
  await openFixture(page, "sample.html"); await readSome(page, 0.2);
  await home(page);

  let list = await cards(page);
  R.check("three books, none pinned, each with a pin toggle", list.length === 3 && list.every((c) => c.pressed === "false" && c.moves === 0) &&
    list[0].name === "sample.html" && list[0].pinTitle === "Pin to the top", JSON.stringify(list.map((c) => c.name + "/" + c.pressed)));
  R.check("no group labels until something is pinned, the heading reads Recent", (await groups(page)).length === 0 && (await headLabel(page)) === "Recent");
  let c = await cont(page);
  R.check("the Continue card follows the book opened last", c && c.title === "sample.html" && c.lead === "Continue reading", JSON.stringify(c));

  /* the forecast, from the saved position and the reader's pace */
  R.check("each card carries a finish forecast", list.every((x) => /^about .+ left · ≈ \d+ more evenings?$/.test(x.left)), JSON.stringify(list.map((x) => x.left)));
  R.check("the Continue card carries it too", /^about .+ left · ≈ \d+ more evenings?$/.test(c.left), c.left);

  /* pin the oldest book: it moves to the top under "Pinned" */
  await card(page, 2).locator(".lib-pin").click();
  await page.waitForTimeout(150);
  list = await cards(page);
  R.check("a pinned book renders first, pressed, with move buttons", list[0].name === "sample.md" && list[0].pressed === "true" && list[0].pinned &&
    list[0].moves === 2 && list[1].moves === 0, JSON.stringify(list.map((x) => x.name + "/" + x.pressed + "/" + x.moves)));
  R.check("the Pinned and Recent labels appear and the heading becomes Library",
    (await groups(page)).join("|") === "Pinned|Recent" && (await headLabel(page)) === "Library", (await groups(page)).join("|"));
  c = await cont(page);
  R.check("the Continue card follows the pin and says Up next", c.title === "sample.md" && c.lead === "Up next" && c.go === "Continue", JSON.stringify(c));
  R.check("the pin toggle keeps the focus", await page.evaluate(() => document.activeElement.classList.contains("lib-pin")));

  /* the p key on a focused card pins and unpins */
  await card(page, 2).locator(".lib-open").focus();
  await page.keyboard.press("p"); await page.waitForTimeout(150);
  list = await cards(page);
  R.check("p on a focused card pins it under the first", list.filter((x) => x.pinned).length === 2 && list[1].name === "sample.txt" &&
    (await page.evaluate(() => document.activeElement.classList.contains("lib-open"))), JSON.stringify(list.map((x) => x.name + "/" + x.pinned)));
  await page.keyboard.press("p"); await page.waitForTimeout(150);
  list = await cards(page);
  R.check("p again unpins it", list.filter((x) => x.pinned).length === 1 && list[0].name === "sample.md", JSON.stringify(list.map((x) => x.name + "/" + x.pinned)));
  await page.keyboard.press("p"); await page.waitForTimeout(150);

  /* move up and down among the pinned */
  await card(page, 0).locator('[data-move="down"]').click();
  await page.waitForTimeout(150);
  list = await cards(page);
  R.check("Move down swaps the two pinned books", list[0].name === "sample.txt" && list[1].name === "sample.md", JSON.stringify(list.map((x) => x.name)));
  R.check("the Continue card follows the new order", (await cont(page)).title === "sample.txt");
  const ends = await page.$$eval('#libList .lib-move', (bs) => bs.map((x) => x.dataset.move + ":" + (x.disabled ? "off" : "on")));
  R.check("the first has no Move up and the last no Move down", ends.join() === "up:off,down:on,up:on,down:off", ends.join());
  await card(page, 1).locator('[data-move="up"]').click();
  await page.waitForTimeout(150);
  R.check("Move up puts it back", (await cards(page)).map((x) => x.name).slice(0, 2).join() === "sample.md,sample.txt");

  /* it all survives a reload */
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".lib-item").length === 3, null, { timeout: 10000 });
  list = await cards(page);
  R.check("pins and their order survive a reload", list[0].name === "sample.md" && list[1].name === "sample.txt" && list[2].name === "sample.html" &&
    list.filter((x) => x.pinned).length === 2, JSON.stringify(list.map((x) => x.name + "/" + x.pinned)));
  R.check("the Continue card is still Up next for the first pin", (await cont(page)).lead === "Up next");
  /* opening a pinned book turns "Up next" into "Continue reading" */
  await page.click("#continueCard");
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block", null, { timeout: 15000 });
  await readSome(page, 0.5);
  await home(page);
  c = await cont(page);
  R.check("once a pinned book has been opened the card says Continue reading", c.title === "sample.md" && c.lead === "Continue reading", JSON.stringify(c));
  await page.screenshot({ path: path.join(SHOTS, "library-desktop-day.png") });
  note(page, "pins");

  /* ---------- 2. the Storage panel ---------- */
  await page.evaluate(() => window.__ll.Library.tx("translations", "readwrite", function(st){
    st.put({ key: "doc1|en|es", blocks: { 0: "hola", 1: "adios" }, engine: "test", updated: Date.now() });
    st.put({ key: "s|en|es|lamp", text: "lámpara", updated: Date.now() });
    st.put({ key: "s|en|es|light", text: "luz", updated: Date.now() });
  }));
  await page.waitForTimeout(200);
  await page.click("#more"); await page.waitForTimeout(150);
  const inMenu = await page.evaluate(() => Array.from(document.querySelectorAll("#moreMenu button")).some((b) => /^Storage$/.test((b.querySelector("span") || {}).textContent || "")));
  R.check("the ⋯ menu lists Storage in the Lamplight group", inMenu);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#moreMenu button")).filter((x) => /^Storage$/.test((x.querySelector("span") || {}).textContent || ""))[0]; b.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#sideBody .so-row").length > 0, null, { timeout: 5000 });
  R.check("the menu opens the Storage panel", (await panelTitle(page)) === "Storage");
  let text = await panelText(page);
  R.check("rows for every kind of thing kept", /Books/.test(text) && /Reading positions/.test(text) && /Highlights and notes/.test(text) &&
    /Cached translations/.test(text) && /Reading stats/.test(text) && /Saved themes/.test(text) && /App files and dictionary/.test(text), text.replace(/\n/g, " | ").slice(0, 320));
  R.check("books are counted and sized", /Books\n3 files\n[\d.]+ (KB|MB)/.test(text), text.replace(/\n/g, " | ").slice(0, 120));
  R.check("translations are counted as documents and single words", /Cached translations\n1 document · 2 words and sentences/.test(text), text.replace(/\n/g, " | "));
  const statDays = Object.keys(await page.evaluate(() => window.llStats.snapshot().days)).length;
  R.check("reading positions and stats are counted", /Reading positions\n3 books/.test(text) &&
    new RegExp("Reading stats\\n" + statDays + " days").test(text), statDays + " | " + text.replace(/\n/g, " | "));
  const meter = await page.evaluate(() => { const m = document.querySelector("#sideBody .so-meter"); return m ? { label: m.getAttribute("aria-label"), role: m.getAttribute("role"), w: m.querySelector("i").style.width } : null; });
  R.check("a total with a labelled bar", meter && /used/.test(meter.label) && meter.role === "img" && /%$/.test(meter.w), JSON.stringify(meter));
  await page.waitForFunction(() => /App files and dictionary/.test(document.getElementById("sideBody").innerText) &&
    !/Measuring/.test(document.getElementById("sideBody").innerText), null, { timeout: 15000 }).catch(() => null);
  text = await panelText(page);
  R.check("the app cache is measured after the wait", /App files and dictionary\n\d+ files\n[\d.]+ (KB|MB)/.test(text), (text.match(/App files.*\n.*\n.*/) || [""])[0]);

  /* clearing the cached translations empties the store */
  await page.click('#sideBody [data-so="translations"]');
  await page.waitForTimeout(500);
  const trLeft = await page.evaluate(() => window.__ll.Library.tx("translations", "readonly", function(st){ return st.count(); }));
  text = await panelText(page);
  R.check("Clear cached translations empties the store and the row", trLeft === 0 && /Cached translations\n0 documents · 0 words and sentences/.test(text), trLeft + " | " + text.replace(/\n/g, " | ").slice(0, 200));

  /* a finished book is taken out */
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await card(page, 2).locator(".lib-open").click();
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block", null, { timeout: 15000 });
  await readSome(page, 1);
  await home(page);
  R.check("a book read to the end shows as finished", (await page.$$eval("#libList .lib-done", (e) => e.length)) === 1);
  await page.evaluate(() => window.llStorage.openPanel());
  await page.waitForFunction(() => document.querySelectorAll("#sideBody .so-row").length > 0, null, { timeout: 5000 });
  text = await panelText(page);
  R.check("the Books row counts the finished one", /Books\n3 files · 1 finished/.test(text), text.replace(/\n/g, " | ").slice(0, 120));
  await page.click('#sideBody [data-so="finished"]');
  await page.waitForTimeout(600);
  R.check("Remove finished books takes it out of the library", (await page.$$eval("#libList .lib-item", (e) => e.length)) === 2 &&
    /Books\n2 files$/m.test(await panelText(page)), (await panelText(page)).replace(/\n/g, " | ").slice(0, 120));

  /* highlights and notes go together, after a confirmation */
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await card(page, 0).locator(".lib-open").click();
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block", null, { timeout: 15000 });
  await page.keyboard.press("b"); await page.waitForTimeout(400);
  await page.evaluate(() => window.llStorage.openPanel());
  await page.waitForFunction(() => document.querySelectorAll("#sideBody .so-row").length > 0, null, { timeout: 5000 });
  R.check("a bookmark shows in the marks row", /Highlights and notes\n1 mark/.test(await panelText(page)), (await panelText(page)).replace(/\n/g, " | ").slice(0, 200));
  page.once("dialog", (d) => d.dismiss());
  await page.click('#sideBody [data-so="marks"]'); await page.waitForTimeout(400);
  R.check("cancelling keeps the marks", /Highlights and notes\n1 mark/.test(await panelText(page)));
  page.once("dialog", (d) => d.accept());
  await page.click('#sideBody [data-so="marks"]'); await page.waitForTimeout(700);
  R.check("confirming deletes them all", /Highlights and notes\n0 marks/.test(await panelText(page)), (await panelText(page)).replace(/\n/g, " | ").slice(0, 200));

  /* persistence */
  text = await panelText(page);
  R.check("the persistence line says storage may be cleared", /Storage may be cleared by the browser when space is low\./.test(text), text.replace(/\n/g, " | ").slice(-200));
  await page.click('#sideBody [data-so="persist"]');
  await page.waitForTimeout(600);
  const calls = await page.evaluate(() => window.__persistCalls);
  text = await panelText(page);
  R.check("Request persistent storage calls the browser and the line changes", calls === 1 &&
    /Storage is persistent — the browser won’t clear it on its own\./.test(text) && !/data-so="persist"/.test(await page.$eval("#sideBody", (b) => b.innerHTML)),
    calls + " | " + text.replace(/\n/g, " | ").slice(-200));

  /* reset reading stats reuses the Stats confirmation */
  page.once("dialog", (d) => d.accept());
  await page.click('#sideBody [data-so="stats"]'); await page.waitForTimeout(700);
  R.check("Reset reading stats clears them", /Reading stats\n0 days/.test(await panelText(page)) &&
    Object.keys(await page.evaluate(() => window.llStats.snapshot().days)).length === 0, (await panelText(page)).replace(/\n/g, " | ").slice(0, 200));
  note(page, "storage");
  await ctx.close();

  /* ---------- 3. clear everything ---------- */
  ctx = await context(1200, 800, "dusk");
  page = await fresh(ctx);
  await openFixture(page, "sample.md"); await readSome(page, 0.4);
  await home(page);
  await page.evaluate(() => window.llStorage.openPanel());
  await page.waitForFunction(() => document.querySelectorAll("#sideBody .so-row").length > 0, null, { timeout: 5000 });
  page.once("dialog", (d) => d.dismiss());
  await page.click('#sideFoot [data-so="wipe"]'); await page.waitForTimeout(400);
  R.check("Clear everything asks first: the first no keeps the library", (await page.$$eval("#libList .lib-item", (e) => e.length)) === 1);
  page.on("dialog", (d) => d.accept());
  await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 20000 }), page.click('#sideFoot [data-so="wipe"]')]);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => Promise.all([
    window.__ll.Library.tx("books", "readonly", function(st){ return st.count(); }),
    window.__ll.Library.tx("positions", "readonly", function(st){ return st.count(); }),
    window.__ll.Library.tx("marks", "readonly", function(st){ return st.count(); })
  ]).then(function(n){
    var prefs = null; try { prefs = JSON.parse(localStorage.getItem("ll_prefs") || "null"); } catch(e){}
    return { items: document.querySelectorAll("#libList .lib-item").length, stores: n.join(),
             stats: localStorage.getItem("ll_stats"), theme: prefs && prefs.theme,
             hero: getComputedStyle(document.querySelector("#empty .hero")).display };
  }));
  R.check("Clear everything empties the library, the stores, the stats and the theme, then reloads",
    after.items === 0 && after.stores === "0,0,0" && !after.stats && after.theme !== "dusk" && after.hero !== "none", JSON.stringify(after));
  note(page, "wipe");
  await ctx.close();

  /* ---------- 4. screenshots: a pinned library and the panel, desktop and phone, light and dark ---------- */
  for (const [name, theme, w, h] of [["desktop-day", "day", 1200, 800], ["desktop-dusk", "dusk", 1200, 800],
                                     ["phone-day", "day", 390, 844], ["phone-dusk", "dusk", 390, 844]]){
    const c2 = await context(w, h, theme, w < 600);
    const p2 = await fresh(c2);
    await openFixture(p2, "sample.md"); await readSome(p2, 0.4);
    await openFixture(p2, "sample.txt"); await readSome(p2, 0.25);
    await openFixture(p2, "sample.html"); await readSome(p2, 0.15);
    await home(p2);
    await p2.evaluate(() => { const ids = Array.from(document.querySelectorAll("#libList .lib-item")).map((e) => e.dataset.id); window.__ll.Library.pin(ids[2], true); window.__ll.Library.pin(ids[1], true); });
    await p2.waitForTimeout(300);
    await p2.screenshot({ path: path.join(SHOTS, "home-" + name + ".png"), fullPage: w < 600 });
    await p2.evaluate(() => window.llStorage.openPanel());
    await p2.waitForFunction(() => document.querySelectorAll("#sideBody .so-row").length > 0, null, { timeout: 5000 }).catch(() => null);
    await p2.waitForTimeout(900);
    await p2.screenshot({ path: path.join(SHOTS, "storage-" + name + ".png") });
    const shot = await p2.evaluate(() => ({ rows: document.querySelectorAll("#sideBody .so-row").length,
      over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    R.check("screenshots " + name, shot.rows === 7 && !shot.over, JSON.stringify(shot));
    note(p2, name);
    await c2.close();
  }

  R.check("no page errors", !errors.length, errors.join(" | "));
  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})();
