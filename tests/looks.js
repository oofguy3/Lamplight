/* The theme picker: six looks, each a day theme and a night theme that belong together, a Day/Night
   switch in its head, and the reader's own themes under Mine. A tap on a look makes it the reader's
   pair and shows its theme for the half on screen; Day and Night change the half; a pair that is no
   look gets a tile of its own, first. Settings › Theme shows the same tiles above its Day theme and
   Night theme lists, which keep the pair two themes: a change to the half on screen shows at once,
   and a Day/Night hold carries over to it.
     NODE_PATH=$(npm root -g) node tests/looks.js */
const fs = require("fs"), path = require("path");
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
/* the Day theme and Night theme lists: each one's option groups (label and values), its disabled options and its value */
const lists = (page) => page.evaluate(() => Object.fromEntries(["autoDay", "autoNight"].map((id) => {
  const s = document.getElementById(id);
  return [id, { groups: [...s.querySelectorAll("optgroup")].map((g) => ({ label: g.label, ids: [...g.querySelectorAll("option")].map((o) => o.value) })),
    off: [...s.options].filter((o) => o.disabled).map((o) => o.value), value: s.value }];
})));
const NAMES = ["Day & Dusk", "Paper & Ink", "Sepia & Cocoa", "Sage & Forest", "Sea air & Canals", "Contrast"];
const DAYS = ["day", "paper", "sepia", "sage", "seaair", "hicon"], NIGHTS = ["dusk", "ink", "cocoa", "forest", "canals", "hidark"];
/* the Dutch for "Mine" as i18n.js has it, whichever apostrophe that is */
const MINE_NL = (/"Mine":\s*"([^"]*)"/.exec(fs.readFileSync(path.join(__dirname, "..", "i18n.js"), "utf8")) || [])[1];
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
async function openSettings(page){ await page.evaluate(() => window.llPop.sheet(true)); await page.waitForTimeout(400); }
/* the pair's own tile is first and the one pressed, named `name`, with the six looks after it */
const pairFirst = (lk, name) => lk.length === 7 && lk[0].id === "pair" && lk[0].name === name && lk[0].on && lk.filter((l) => l.on).length === 1 && lk.slice(1).map((l) => l.id).join() === DAYS.join();

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

    /* ---------------- Settings › Theme, and the Day theme and Night theme lists (§4.2, §5.5) ---------------- */
    await guard("settings", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      await openSettings(page);
      const set = await page.evaluate(() => {
        const c = document.getElementById("themeChips"), lab = document.getElementById("tg-custom");
        const mine = c && c.querySelector(':scope > .looks.q-mine[role="group"][aria-labelledby="tg-custom"]');
        return { dn: !!document.querySelector('#themeGroup > #sDN [data-dn="day"]') && !!document.querySelector('#themeGroup > #sDN [data-dn="night"]'),
          looks: !!(c && c.querySelector(':scope > .looks[role="group"][aria-labelledby="themeL"] > .tile.look')), mine: lab ? lab.textContent : null, add: !!(mine && mine.querySelector(".chip-new")) };
      });
      const lk = await looksIn(page, "#themeChips");
      R.check("Settings › Theme has the switch, six looks and Mine", set.dn && set.looks && set.mine === "Mine" && set.add && lk.map((l) => l.id).join() === DAYS.join() &&
        lk.map((l) => l.name).join("|") === NAMES.join("|") && lk.filter((l) => l.on).map((l) => l.id).join() === "day", JSON.stringify({ set, lk }));
      const order = await page.evaluate(() => {
        const els = ["sDN", "themeChips", "dnSubL", "autoRow"].map((id) => document.getElementById(id));
        return els.every((e) => e && e.closest("#themeGroup")) && els.every((e, i) => !i || !!(els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      R.check("Settings › Theme's order", order);
      const grid = await page.evaluate(() => { const gs = [...document.querySelectorAll("#themeChips > .looks")], is = [...document.querySelectorAll("#themeChips .tile > i")];
        return { cols: gs.map((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length), min: is.length ? Math.min(...is.map((i) => i.getBoundingClientRect().height)) : 0 }; });
      R.check("Settings: two columns, tiles ≥ 44px", grid.cols.join() === "2,2" && grid.min >= 44, JSON.stringify(grid));
      /* the lists keep the pair two themes: the other half's theme is refused, and nothing changes */
      const before = await prefs(page);
      await page.evaluate(() => { const A = window.__ll.AutoTheme; A.setPair("night", "day"); A.setPair("day", "dusk"); A.setPair("day", "gone7"); });
      const after = await prefs(page), s0 = await st(page);
      R.check('setPair("night","day") on day/dusk changes nothing', after === before && s0.theme === "day" && s0.autoDay === "day" && s0.autoNight === "dusk", before + " → " + after);
      /* each list disables the other half's theme, and follows when a look changes the pair */
      const l1 = await lists(page);
      await page.click('#themeChips [data-look="paper"]'); await page.waitForTimeout(150);
      const l2 = await lists(page), s1 = await st(page);
      R.check("lists: the other half's theme is disabled", l1.autoDay.off.join() === "dusk" && l1.autoNight.off.join() === "day" && l1.autoDay.value === "day" && l1.autoNight.value === "dusk" &&
        s1.autoDay === "paper" && s1.autoNight === "ink" && l2.autoDay.off.join() === "ink" && l2.autoNight.off.join() === "paper" && l2.autoDay.value === "paper" && l2.autoNight.value === "ink",
        JSON.stringify({ l1: [l1.autoDay.off, l1.autoNight.off], l2: [l2.autoDay.off, l2.autoNight.off, l2.autoDay.value, l2.autoNight.value], s1 }));
      await ctx.close();
    });
    await guard("settings, the lists' groups", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", customs: [{ id: "t3a", name: "Reading lamp", bg: "#F4ECD8", ink: "#2A2118", autoInk: false, accent: "#7A3E12" }] } });
      const page = await open(ctx, url, NOON);
      await openSettings(page);
      const l = await lists(page), ids = await page.evaluate(() => Object.keys(window.llThemes.THEMES));
      /* both lists: Light and Dark open with the looks' day and night themes, every built-in is offered once (the
         others after the twelve), and Mine holds the reader's own */
      const ok = (x) => x.groups.map((g) => g.label).join() === "Light,Dark,Mine" && x.groups[0].ids.slice(0, 6).join() === DAYS.join() && x.groups[1].ids.slice(0, 6).join() === NIGHTS.join() &&
        x.groups[2].ids.join() === "c:t3a" && ids.every((k) => x.groups[0].ids.concat(x.groups[1].ids).filter((v) => v === k).length === 1) && x.groups[0].ids.length + x.groups[1].ids.length === ids.length;
      R.check("lists: Light, Dark, Mine groups with the twelve first", ok(l.autoDay) && ok(l.autoNight), JSON.stringify(l.autoDay.groups.map((g) => g.label + ":" + g.ids.slice(0, 7).join(" "))));
      await ctx.close();
    });
    await guard("settings, a mixed pair", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "day", autoDay: "day", autoNight: "cocoa" } });
      const page = await open(ctx, url, NOON);
      await openSettings(page);
      const lk = await looksIn(page, "#themeChips");
      R.check('a mixed pair (day/cocoa seeded, theme day) shows "Day & Cocoa" first, pressed, in #themeChips', pairFirst(lk, "Day & Cocoa"), JSON.stringify(lk));
      await ctx.close();
    });
    await guard("settings, Dutch", async () => {
      const ctx = await context(b, { locale: "nl-NL" }, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      await openSettings(page);
      const lab = await page.evaluate(() => { const l = document.querySelector("#themeChips > .sub-label#tg-custom"); return l ? l.textContent : null; });
      R.check("Settings' Mine label is in Dutch on a Dutch device", !!MINE_NL && /^Mijn thema/.test(MINE_NL) && lab === MINE_NL, lab + " / " + MINE_NL);
      await ctx.close();
    });
    await guard("settings, More theme settings…", async () => {
      /* the popover's foot link lands on the pressed tile in #themeChips; with none pressed (a theme outside
         the pair, which only the raw select leaves) on its first tile, not on the switch before it */
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      const landed = async () => {
        await openTheme(page);
        await page.click("#themeMore"); await page.waitForTimeout(500);
        const f = await page.evaluate(() => { const a = document.activeElement; return a && a.closest("#themeChips") ? (a.dataset.look || a.dataset.theme) + ":" + a.getAttribute("aria-pressed") : a && (a.id || a.outerHTML.slice(0, 60)); });
        await page.evaluate(() => window.llPop.sheet(false)); await page.waitForTimeout(300);
        return f;
      };
      const f1 = await landed();
      await page.evaluate(() => window.llThemes.select("paper"));
      const f2 = await landed();
      R.check("More theme settings… puts focus on the pressed tile in #themeChips, or on its first tile when none is pressed", f1 === "day:true" && f2 === "day:false", f1 + " " + f2);
      await ctx.close();
    });
    await guard("settings, list changes, Auto off", async () => {
      let ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      let page = await open(ctx, url, NOON);
      await openSettings(page);
      await page.selectOption("#autoDay", "paper"); await page.waitForTimeout(150);
      const s = await st(page), set = await looksIn(page, "#themeChips");
      await page.evaluate(() => window.llPop.sheet(false)); await page.waitForTimeout(300);
      await openTheme(page);
      const pop = await looksIn(page, "#qLooks");
      R.check('Auto off, Day on screen: Day theme → Paper shows Paper, pair paper/dusk, the pair tile "Paper & Dusk" first and pressed',
        s.theme === "paper" && s.autoDay === "paper" && s.autoNight === "dusk" && pairFirst(set, "Paper & Dusk") && pairFirst(pop, "Paper & Dusk"), JSON.stringify({ s, set: set.slice(0, 2), pop: pop.slice(0, 2) }));
      await ctx.close();
      ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "dusk" } });
      page = await open(ctx, url, NOON);
      await openSettings(page);
      await page.selectOption("#autoDay", "paper"); await page.waitForTimeout(150);
      const d = await st(page), dset = await looksIn(page, "#themeChips");
      R.check("Auto off, Dusk on screen: Day theme → Paper changes only the pair", d.theme === "dusk" && d.autoDay === "paper" && d.autoNight === "dusk" && !d.hold && pairFirst(dset, "Paper & Dusk"), JSON.stringify({ d, dset: dset.slice(0, 2) }));
      await ctx.close();
    });
    await guard("settings, list changes, Auto on", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00" } });
      const page = await open(ctx, url, NOON);
      await openSettings(page);
      await page.click('#sDN [data-dn="night"]'); await page.waitForTimeout(150);
      const held = (await st(page)).hold;
      await page.selectOption("#autoNight", "ink"); await page.waitForTimeout(150);
      const s = await st(page);
      /* the 30 s check comes round with the hold in force: Ink stays */
      await page.clock.fastForward("00:31"); await page.waitForTimeout(100);
      const s2 = await st(page);
      R.check("Auto on (time, noon) with Night held: Night theme → Ink shows Ink and keeps the hold (same until), now on ink",
        !!held && held.theme === "dusk" && held.period === "day" && s.theme === "ink" && s.autoDay === "day" && s.autoNight === "ink" && !!s.hold && s.hold.theme === "ink" && s.hold.until === held.until && s.hold.period === "day" &&
        s2.theme === "ink" && !!s2.hold && s2.hold.theme === "ink", JSON.stringify({ held, s, s2 }));
      await page.selectOption("#autoDay", "sepia"); await page.waitForTimeout(150);
      const d = await st(page);
      R.check("Auto on with Night held: Day theme → Sepia leaves the screen and the hold", d.theme === "ink" && d.autoDay === "sepia" && d.autoNight === "ink" && !!d.hold && d.hold.theme === "ink" && d.hold.until === held.until && d.hold.period === "day",
        JSON.stringify(d));
      await ctx.close();
    });
    await guard("settings, one fade", async () => {
      /* with motion on, a list change to the half on screen cross-fades once: switching then finds the new
         theme already on screen and starts no second fade, which would cut the first one short */
      const ctx = await context(b, { reducedMotion: "no-preference" }, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00" } });
      const page = await open(ctx, url, NOON);
      await page.evaluate(() => {
        window.__vt = [];
        const orig = document.startViewTransition && document.startViewTransition.bind(document);
        if (orig) document.startViewTransition = (cb) => { const rec = { skipped: false }; window.__vt.push(rec); const t = orig(cb); t.ready.catch(() => { rec.skipped = true; }); return t; };
      });
      await openSettings(page);
      await page.selectOption("#autoDay", "paper"); await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({ vt: window.__vt, theme: window.__ll.state.theme }));
      R.check("a list change to the half on screen cross-fades once (Auto on, motion on)", r.theme === "paper" && r.vt.length === 1 && !r.vt[0].skipped, JSON.stringify(r));
      await ctx.close();
    });
    await guard("settings, the popover's hours", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00" } });
      const page = await open(ctx, url, NOON);
      await openTheme(page);
      await page.click('#qDN [data-dn="night"]'); await page.waitForTimeout(150);
      const held = (await st(page)).hold;
      await page.evaluate(() => { const el = document.getElementById("qFrom"); el.value = "20:00"; el.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitForTimeout(150);
      const s = await st(page), from = await page.evaluate(() => window.__ll.state.nightFrom + "/" + JSON.parse(localStorage.getItem("ll_prefs")).nightFrom);
      R.check("the popover's hours end a hold", !!held && held.theme === "dusk" && s.hold === null && s.theme === "day" && from === "20:00/20:00", JSON.stringify({ held, s, from }));
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
