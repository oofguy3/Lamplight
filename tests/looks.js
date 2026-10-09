/* The theme picker: six looks, each a day theme and a night theme that belong together, a Day/Night
   switch in its head, and the reader's own themes under Mine. A tap on a look makes it the reader's
   pair and shows its theme for the half on screen; Day and Night change the half; a pair that is no
   look gets a tile of its own, first.
     NODE_PATH=$(npm root -g) node tests/looks.js */
const { serve, browser, openFixture, makeReport } = require("./lib");

const st = (page) => page.evaluate(() => { const s = window.__ll.state; return { theme: s.theme, autoDay: s.autoDay, autoNight: s.autoNight, auto: s.auto, hold: s.dnHold }; });
const prefs = (page) => page.evaluate(() => localStorage.getItem("ll_prefs"));
/* the look tiles in a grid, in order: { id, name, on } */
const looksIn = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s + " .tile.look")].map((t) => ({ id: t.dataset.look, name: (t.querySelector(".tile-n") || {}).textContent, on: t.getAttribute("aria-pressed") === "true" })), sel);
/* a tile's name: its text, whether it is wider than its box, and whether the box cuts it there with an
   ellipsis (on one line, clipped); `css` shows the three values */
const nameCut = (page, sel) => page.evaluate((s) => {
  const n = document.querySelector(s + " .tile-n");
  if (!n) return null;
  const cs = getComputedStyle(n);
  return { name: n.textContent, sw: n.scrollWidth, cw: n.clientWidth, wider: n.scrollWidth > n.clientWidth,
    cut: /^(hidden|clip)$/.test(cs.overflowX) && cs.whiteSpace === "nowrap" && cs.textOverflow === "ellipsis", css: [cs.overflowX, cs.whiteSpace, cs.textOverflow].join(" ") };
}, sel);
/* a Day/Night switch's state: "day:true,night:false" */
const dnIn = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s + " [data-dn]")].map((b) => b.dataset.dn + ":" + b.getAttribute("aria-pressed")).join(","), sel);
const NAMES = ["Day & Dusk", "Paper & Ink", "Sepia & Cocoa", "Sage & Forest", "Sea air & Canals", "Contrast"];
const NOON = new Date(2026, 9, 9, 12, 0, 0);
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const errors = [];

/* a context whose storage is seeded once per tab: a reload keeps what the page saved since */
async function context(b, opts, seed){
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" }, opts || {}));
  if (seed) await ctx.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    for (const k of Object.keys(s)) localStorage.setItem(k, typeof s[k] === "string" ? s[k] : JSON.stringify(s[k]));
    sessionStorage.setItem("__seeded", "1");
  }, seed);
  return ctx;
}
/* a page, its clock held at `clock` when given, with every toast's text kept in window.__toasts */
async function open(ctx, url, clock){
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  if (clock) await page.clock.install({ time: clock });
  await page.goto(url, { waitUntil: "load" });
  await watchToasts(page);
  return page;
}
async function watchToasts(page){
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver((muts) => muts.forEach((m) => { const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (t && t.id === "toast" && t.textContent) window.__toasts.push(t.textContent); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
const popOpen = (page) => page.evaluate(() => document.getElementById("pop").classList.contains("open") && !document.getElementById("themePop").hidden);
async function openTheme(page){
  if (!(await popOpen(page))) await page.click("#lamp");
  await page.waitForFunction(() => document.getElementById("pop").classList.contains("open") && !document.getElementById("themePop").hidden, null, { timeout: 5000 });
  await page.waitForTimeout(100);
}
async function tapLook(page, id){ await openTheme(page); await page.click('#qLooks [data-look="' + id + '"]'); await page.waitForTimeout(120); }

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  /* a section that throws (a part not found) fails as one check instead of ending the run */
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); } };
  try {
    /* ---------------- picker ---------------- */
    await guard("picker, desktop", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      await openTheme(page);
      const head = await page.evaluate(() => { const h = document.querySelector("#themePop .pop-head"); return { text: h ? h.textContent : "", dn: !!(h && h.querySelector("#qDN")) }; });
      const dn = await dnIn(page, "#qDN");
      R.check("popover: head has Theme and a Day/Night switch, Day pressed", head.text.indexOf("Theme") >= 0 && head.dn && dn === "day:true,night:false", JSON.stringify(head) + " " + dn);
      const lk = await looksIn(page, "#qLooks");
      R.check("popover: six looks in order", lk.map((l) => l.id).join() === "day,paper,sepia,sage,seaair,hicon" && lk.map((l) => l.name).join("|") === NAMES.join("|"), JSON.stringify(lk));
      R.check("popover: Day & Dusk is pressed, and is the only one", lk.length === 6 && lk.filter((l) => l.on).map((l) => l.id).join() === "day", JSON.stringify(lk));
      const mine = await page.evaluate(() => { const s = document.getElementById("qMineSec"), l = document.getElementById("qMineL"); return { sec: !!s, label: l ? l.textContent.trim() : null, inSec: !!(s && l && s.contains(l)), add: !!document.querySelector("#qMineSec #qMine .chip-new") }; });
      R.check("popover: Mine has New theme", mine.sec && mine.inSec && mine.label === "Mine" && mine.add, JSON.stringify(mine));
      R.check("popover: opens with focus on the pressed look", (await page.evaluate(() => document.activeElement && document.activeElement.dataset.look)) === "day", await page.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 80)));
      const gone = await page.evaluate(() => ["qPrev", "qRecentSec", "qGroups", "qLight", "qDark", "qColour", "qColl", "qHi", "qMake", "qDayNight", "qDaySel", "qNightSel"].filter((id) => document.getElementById(id)));
      R.check("popover: the old parts are gone", gone.length === 0, gone.join(", "));
      const grid = await page.evaluate(() => { const g = document.getElementById("qLooks"), is = [...document.querySelectorAll("#qLooks .tile.look > i")];
        return { cols: g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0, n: is.length, min: is.length ? Math.min(...is.map((i) => i.getBoundingClientRect().height)) : 0 }; });
      R.check("popover: two columns, tiles ≥ 44px", grid.cols === 2 && grid.n === 6 && grid.min >= 44, JSON.stringify(grid));
      const label = await page.evaluate(() => { const t = document.querySelector('#qLooks .tile.look[aria-pressed="true"]'); return t ? t.getAttribute("aria-label") : null; });
      R.check('the pressed look\'s accessible name is "Day & Dusk, current theme"', label === "Day & Dusk, current theme", label);
      await ctx.close();
    });
    await guard("picker, phone", async () => {
      const ctx = await context(b, PHONE, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      await openTheme(page);
      await page.waitForTimeout(300);
      const fit = await page.evaluate(() => { const lab = document.querySelector("#themePop .q-auto .plabel").getBoundingClientRect(), pop = document.getElementById("pop").getBoundingClientRect();
        return { label: Math.round(lab.bottom), visible: Math.round(Math.min(pop.bottom, innerHeight)), scrolled: document.getElementById("pop").scrollTop }; });
      R.check("phone sheet, fresh profile: Day and night label is visible without scrolling", fit.scrolled === 0 && fit.label <= fit.visible, JSON.stringify(fit));
      await ctx.close();
    });
    await guard("picker, Dutch at 320px", async () => {
      /* Dutch, 320px, the contrast tone (Review Focus 2): the head and the sheet fit, and a name too
         long for its tile ends in an ellipsis inside it. At the regular weight the longest look name,
         "Zeelucht & Grachten", just fits, so the seed is a mixed pair, Sea air by day and Contrast
         dark by night, with Contrast dark on screen: the pressed tile, first, is the pair's, its name
         "Zeelucht & Contrast donker" in bold and far wider than the tile */
      const ctx = await context(b, { viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true, locale: "nl-NL" }, { ll_prefs: { auto: "off", theme: "hidark", autoDay: "seaair", autoNight: "hidark" } });
      const page = await open(ctx, url);
      await openTheme(page);
      await page.waitForTimeout(300);
      const fit = await page.evaluate(() => {
        const pop = document.getElementById("pop"), head = document.querySelector("#themePop .pop-head"), dn = document.getElementById("qDN");
        return { tone: document.documentElement.dataset.tone, pop: pop.scrollWidth <= pop.clientWidth, head: !!head && head.scrollWidth <= head.clientWidth, dn: !!dn && dn.scrollWidth <= dn.clientWidth };
      });
      const pair = await nameCut(page, '#qLooks [data-look="pair"][aria-pressed="true"]');
      R.check("Dutch, 320px, contrast tone: no sideways scroll, long name ellipsized", fit.tone === "contrast" && fit.pop && fit.head && fit.dn &&
        !!pair && pair.name === "Zeelucht & Contrast donker" && pair.wider && pair.cut, JSON.stringify({ fit, pair }));
      /* the same head in Settings › Theme: "Thema" and the switch on one row, inside the group (the
         sheet's other groups are not this test's business) */
      await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      await page.evaluate(() => window.llPop.sheet(true)); await page.waitForTimeout(400);
      const set = await page.evaluate(() => {
        const g = document.getElementById("themeGroup"), l = g && g.querySelector(":scope > .label"), d = document.getElementById("sDN");
        const lr = l && l.getBoundingClientRect(), dr = d && d.getBoundingClientRect();
        return { row: !!(lr && dr) && dr.top < lr.bottom && dr.bottom > lr.top && dr.left >= lr.right - 0.5, group: !!g && g.scrollWidth <= g.clientWidth, dn: !!d && d.scrollWidth <= d.clientWidth, right: !!(d && g) && dr.right <= g.getBoundingClientRect().right + 0.5 };
      });
      R.check("Dutch, 320px, contrast tone: Settings' Thema and its switch share a row inside the group", set.row && set.group && set.dn && set.right, JSON.stringify(set));
      /* the longest look name itself: pressed, so in bold, it no longer fits, and is cut the same way */
      await page.evaluate(() => window.llPop.sheet(false)); await page.waitForTimeout(400);
      await tapLook(page, "seaair"); await page.waitForTimeout(200);
      const sea = await nameCut(page, '#qLooks [data-look="seaair"][aria-pressed="true"]');
      const seaPop = await page.evaluate(() => { const p = document.getElementById("pop"); return p.scrollWidth <= p.clientWidth; });
      R.check('Dutch, 320px: "Zeelucht & Grachten", pressed, ends in an ellipsis inside its tile', !!sea && sea.name === "Zeelucht & Grachten" && sea.wider && sea.cut && seaPop, JSON.stringify({ sea, seaPop }));
      await ctx.close();
    });

    /* ---------------- a look (§5.1) ---------------- */
    await guard("a look, Auto off", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      await tapLook(page, "paper");
      let s = await st(page);
      R.check("Auto off, Day on screen: Paper & Ink shows Paper, pair paper/ink, no toast", s.theme === "paper" && s.autoDay === "paper" && s.autoNight === "ink" && (await toasts(page)).length === 0, JSON.stringify(s) + JSON.stringify(await toasts(page)));
      await page.click('#qDN [data-dn="night"]'); await page.waitForTimeout(120);
      const ink = (await st(page)).theme;
      await tapLook(page, "sepia");
      s = await st(page);
      R.check("Auto off, Ink on screen: Sepia & Cocoa shows Cocoa", ink === "ink" && s.theme === "cocoa" && s.autoDay === "sepia" && s.autoNight === "cocoa", ink + " " + JSON.stringify(s));
      const before = await prefs(page);
      await tapLook(page, "sepia");
      const after = await prefs(page);
      R.check("a tap on the pressed look changes nothing", after === before && (await st(page)).theme === "cocoa", before + " → " + after);
      /* opened again with Sepia & Cocoa pressed, the third tile: the focus is on it, not on the first */
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      await openTheme(page);
      const f = await page.evaluate(() => { const a = document.activeElement; return { look: a && a.dataset.look, on: a && a.getAttribute("aria-pressed"), first: document.querySelector("#qLooks .chip")?.dataset.look }; });
      R.check("popover: opened over Sepia & Cocoa, focus is on its tile, not the first", f.look === "sepia" && f.on === "true" && f.first === "day", JSON.stringify(f));
      await ctx.close();
    });
    await guard("a look, Auto on", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00" } });
      const page = await open(ctx, url, NOON);
      await tapLook(page, "sage");
      let s = await st(page);
      R.check("Auto on (time, noon), no hold: Sage & Forest shows Sage", s.theme === "sage" && s.autoDay === "sage" && s.autoNight === "forest" && !s.hold, JSON.stringify(s));
      await page.click('#qDN [data-dn="night"]'); await page.waitForTimeout(120);
      const held = (await st(page)).hold;
      await tapLook(page, "seaair");
      s = await st(page);
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(200);
      const re = await st(page);
      R.check("Auto on with a Night hold: Sea air & Canals shows Canals; dnHold.theme is canals, with the same until and period; after reload Canals",
        !!held && held.theme === "forest" && s.theme === "canals" && s.autoDay === "seaair" && s.autoNight === "canals" && !!s.hold && s.hold.theme === "canals" && s.hold.until === held.until && s.hold.period === held.period &&
        re.theme === "canals" && !!re.hold && re.hold.theme === "canals", JSON.stringify({ held, s, re }));
      await ctx.close();
    });

    /* ---------------- switches (§5.3) ---------------- */
    await guard("switches, popover", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      await openTheme(page);
      await page.click('#qDN [data-dn="night"]'); await page.waitForTimeout(120);
      const a = (await st(page)).theme, ad = await dnIn(page, "#qDN");
      await page.click('#qDN [data-dn="day"]'); await page.waitForTimeout(120);
      const c = (await st(page)).theme, cd = await dnIn(page, "#qDN");
      R.check("Night in the popover's head shows Dusk; Day back to Day", a === "dusk" && ad === "day:false,night:true" && c === "day" && cd === "day:true,night:false", [a, ad, c, cd].join(" "));
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await page.keyboard.press("t"); await page.waitForTimeout(150);
      const after = { theme: (await st(page)).theme, q: await dnIn(page, "#qDN"), s: await dnIn(page, "#sDN"), dock: await page.evaluate(() => document.getElementById("dockDay").getAttribute("aria-pressed") + "/" + document.getElementById("dockNight").getAttribute("aria-pressed")) };
      R.check("the switches follow t", after.theme === "dusk" && after.q === "day:false,night:true" && after.s === "day:false,night:true" && after.dock === "false/true", JSON.stringify(after));
      await ctx.close();
    });
    await guard("switches, e-ink", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", eink: true } });
      const page = await open(ctx, url);
      await openTheme(page);
      const hid = await page.evaluate(() => ["qDN", "sDN"].map((id) => { const d = document.getElementById(id); return id + ":" + !!(d && d.hidden && getComputedStyle(d).display === "none"); }).join(","));
      R.check("e-ink hides #qDN and #sDN", hid === "qDN:true,sDN:true", hid);
      await ctx.close();
    });
    await guard("switches, Settings", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      await page.keyboard.press("s"); await page.waitForTimeout(400);
      await page.click('#sDN [data-dn="night"]'); await page.waitForTimeout(150);
      const s = { theme: (await st(page)).theme, dn: await dnIn(page, "#sDN"), pair: (await st(page)).autoDay + "/" + (await st(page)).autoNight };
      R.check("Settings' Night shows Dusk", s.theme === "dusk" && s.dn === "day:false,night:true" && s.pair === "day/dusk", JSON.stringify(s));
      await ctx.close();
    });

    /* ---------------- the pair tile (§5.2) ---------------- */
    await guard("pair tile", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "day", autoDay: "day", autoNight: "cocoa" } });
      const page = await open(ctx, url, NOON);
      await openTheme(page);
      const lk = await looksIn(page, "#qLooks");
      R.check('a mixed pair (day/cocoa seeded, theme day) shows "Day & Cocoa" first, pressed, in #qLooks',
        lk.length === 7 && lk[0].id === "pair" && lk[0].name === "Day & Cocoa" && lk[0].on && lk.filter((l) => l.on).length === 1 && lk.slice(1).map((l) => l.id).join() === "day,paper,sepia,sage,seaair,hicon", JSON.stringify(lk));
      /* Enter on a look: the pair tile goes, the grid is drawn again, and focus stays on the look (Review Focus 1) */
      await page.focus('#qLooks [data-look="paper"]');
      await page.keyboard.press("Enter"); await page.waitForTimeout(150);
      const f = await page.evaluate(() => { const a = document.activeElement; return { look: a && a.dataset.look, on: a && a.getAttribute("aria-pressed"), inGrid: !!(a && a.closest("#qLooks")), pair: !!document.querySelector('#qLooks [data-look="pair"]'), theme: window.__ll.state.theme }; });
      R.check("Enter on Paper & Ink over a mixed pair: focus is on the pressed tile", f.look === "paper" && f.on === "true" && f.inGrid && !f.pair && f.theme === "paper", JSON.stringify(f));
      await ctx.close();
    });
    await guard("pair tile, a look over a look", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      await tapLook(page, "sage");
      const s = await st(page), t = await toasts(page);
      R.check("a look over a look pair: no toast", s.theme === "sage" && s.autoDay === "sage" && s.autoNight === "forest" && t.length === 0, JSON.stringify(s) + JSON.stringify(t));
      await ctx.close();
    });

    /* ---------------- the tiles' drawing stays in the tiles ---------------- */
    await guard("a book's own class pg", async () => {
      /* a book keeps its own class names (an EPUB chapter's markup goes through DOMPurify, which
         keeps class), so a paragraph of class "pg" in a book must not be drawn as a tile's page */
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      await openFixture(page, "sample.epub");
      await page.evaluate(() => {
        const at = document.querySelector("#doc .ll-chapter") || document.getElementById("doc"), para = document.createElement("p");
        para.className = "pg"; para.id = "pgProbe";
        para.innerHTML = "She was <em>not</em> <q>fine</q>, <b>truly</b>, <s>gone</s> or <u>here</u>.";
        at.appendChild(para);
      });
      /* each child's position and top, whether the bold word keeps the paragraph's size, the bold word's
         ::before and the quote's */
      const read = () => page.evaluate(() => {
        const para = document.getElementById("pgProbe"), bold = para.querySelector("b");
        return { set: [...para.children].map((c) => c.tagName.toLowerCase() + ":" + getComputedStyle(c).position + "/" + getComputedStyle(c).top).join(","),
          size: getComputedStyle(bold).fontSize === getComputedStyle(para).fontSize, aa: getComputedStyle(bold, "::before").content, quote: getComputedStyle(para.querySelector("q"), "::before").content };
      });
      const desk = await read();
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
      const phone = await read();
      const text = (p) => p.set === "em:static/auto,q:static/auto,b:static/auto,s:static/auto,u:static/auto" && p.size && p.aa === "none" && p.quote === "open-quote";
      R.check('a book\'s paragraph of class "pg" stays text, also on a phone: nothing lifted out of the line, no "Aa", its quote marks kept',
        text(desk) && text(phone), JSON.stringify({ desk, phone }));
      await ctx.close();
    });

    R.check("no page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
  } finally {
    await b.close(); server.close();
  }
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
