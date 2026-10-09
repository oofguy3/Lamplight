/* The theme picker: six looks, each a day theme and a night theme that belong together, a Day/Night
   switch in its head, and the reader's own themes under Mine. A tap on a look makes it the reader's
   pair and shows its theme for the half on screen; Day and Night change the half; a pair that is no
   look gets a tile of its own, first, and a look tapped over it offers Undo. Settings › Theme shows
   the same tiles above its Day theme and Night theme lists, which keep the pair two themes: a change
   to the half on screen shows at once, and a Day/Night hold carries over to it. An own theme picked,
   made or copied takes the place of the theme on screen in its half, and deleting one shows that
   half's fallback; a built-in picked by id brings its look. After every choice the theme on screen is
   one of the pair's two themes, and the two differ. A first run follows the phone's dark mode, in the
   contrast pair on a device that asks for more contrast. On load, a reader of a retired theme moves to the
   nearest kept one, and what earlier versions left (a pair that is one theme twice, a theme on screen
   outside the pair, a hold on neither half) is folded back into that rule. Once, a notice then says
   what became of the retired themes the reader can still see, and offers them back as the reader's
   own, where they were, keeping the half on screen; it never shows beside the e-ink offer, toasts
   step up over it, and speed reading hides it and the offers until it closes. Every built-in applies the
   colours of the spec's table, and nothing is left of the textures and Plain background. Outside the
   table, the first paint is Day's, the title bar's colour in the markup and the manifest is Dusk's
   page, the editors' swatches come from the set, and the contrast and dark tones have their own ring,
   sliders, Day and Night buttons and yellow highlight. The lamp's focus ring clears its ring, and the
   dock's handle shows its focus ring in every tone, at once with reduced motion and in e-ink; under
   forced colours a focused slider is outlined instead.
     NODE_PATH=$(npm root -g) node tests/looks.js */
const { serve, browser, openFixture, dayNight, makeReport, parseColor } = require("./lib");

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
/* a light theme of the reader's own, "c:t3a", and a dark one, "c:t6d" */
const LAMP = { id: "t3a", name: "Reading lamp", bg: "#F4ECD8", ink: "#2A2118", autoInk: false, accent: "#7A3E12" };
const EMBERS = { id: "t6d", name: "Embers", bg: "#1E1611", ink: "#EADBC8", autoInk: false, accent: "#D9964A" };
/* spec §7.1, where each retired theme goes, copied here rather than read from the app's own table */
const MOVES = Object.fromEntries(Object.entries({
  day: "linen peach handmade tulips bookcloth laid polder vellum blossom rose newsprint", sepia: "parchment coffee", sage: "mint",
  seaair: "winter sky mist lavender delft", dusk: "rain vermeer aurora ocean midnight plum", ink: "noir terminal",
  cocoa: "autumn candle ember rembrandt cabin nighttrain amber", forest: "moss graphite", canals: "library slate"
}).flatMap(([to, ids]) => ids.split(" ").map((id) => [id, to])));
/* spec §3.1, each built-in's colours, copied here rather than read from the app's own table */
const COLS = ["bg", "panel", "raise", "ink", "muted", "line", "accent", "lamp"];
const TABLE = Object.fromEntries(Object.entries({
  day:    "#F5EFE3 #FBF8F0 #FEFCF8 #2D2924 #645F58 #DED8CB #2C5D45 #875C0C",
  dusk:   "#0D121C #141A26 #1C2330 #DAD7CF #A6A39B #2A313E #D8A24A #D8A24A",
  paper:  "#FAFAF7 #FFFFFF #FFFFFF #141414 #5C5C58 #DCDCD5 #A8261F #A8261F",
  ink:    "#000000 #151413 #1F1E1C #D6D2C5 #A3A097 #302F2C #E87A69 #E87A69",
  sepia:  "#F0E4CB #F7EDD8 #FAF4E6 #2E1E11 #695544 #DFCDAE #7C2623 #855510",
  cocoa:  "#261914 #30201A #3A2920 #EEDFCB #AEA394 #49372C #D8A067 #D8A067",
  sage:   "#DFE7D8 #EAF0E5 #F4F7F0 #1A261F #4E5C51 #C7D2BE #9C4925 #124830",
  forest: "#0E1A13 #14221A #1A2B21 #D4DACC #9DA595 #283B2E #7AB785 #7AB785",
  seaair: "#DCEDF0 #E9F5F6 #F4FAFA #112126 #41545A #C2DCE0 #0B5A74 #984121",
  canals: "#0E1F22 #13292D #193337 #D0DCD8 #9DB1B0 #24403F #E58E6C #F2C66B",
  hicon:  "#FFFFFF #FFFFFF #FFFFFF #000000 #3A3A3A #000000 #0033CC #0033CC",
  hidark: "#000000 #000000 #000000 #F2F2F2 #D0D0D0 #F2F2F2 #FFC72C #FFC72C"
}).map(([id, s]) => [id, Object.fromEntries(s.split(" ").map((c, i) => [COLS[i], c]))]));
/* what a stored profile became once loaded: the theme, the pair, the hold and themeWas, in the state
   (with the half of the theme on screen) and as boot saved them */
const moved = (page) => page.evaluate(() => {
  const pick = (o) => ({ theme: o.theme, autoDay: o.autoDay, autoNight: o.autoNight, hold: o.dnHold, was: o.themeWas });
  const s = window.__ll.state;
  return { s: Object.assign(pick(s), { dn: window.llThemes.dnOf(s.theme) }), saved: pick(JSON.parse(localStorage.getItem("ll_prefs") || "{}")) };
});
/* the Dutch for "Mine", with the curly apostrophe the glossary asks for (spec §11) */
const MINE_NL = "Mijn thema’s";
const NOON = new Date(2026, 9, 9, 12, 0, 0);
/* 22:00 the same day, and the end of a hold made then (On a schedule, night 21:00–07:00) */
const NIGHT = new Date(2026, 9, 9, 22, 0, 0), NEXT_7 = new Date(2026, 9, 10, 7, 0, 0).getTime();
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
/* a page, its clock set to `clock` when given, with every toast's text kept in window.__toasts. A `still` page's
   clock stands still from before its boot, and through reloads: no timer of the app's fires, so the notice (800 ms
   on) can neither clear themeWas before a read nor save the page over a profile stored for the next load */
async function open(ctx, url, clock, still){
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  if (clock || still) await page.clock.install({ time: clock || NOON });
  if (still) await page.clock.pauseAt((clock || NOON).getTime() + 1000);
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
/* the toast on screen: its message and its button's label, or null when none shows */
const toastNow = (page) => page.evaluate(() => {
  const t = document.getElementById("toast");
  if (!t || !t.classList.contains("on")) return null;
  return { text: [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim(), act: ((t.querySelector(".toast-act") || {}).textContent || "").trim() };
});
/* confirm() is answered yes, prompt() with `name` */
const answer = (page, name) => page.on("dialog", (d) => d.accept(d.type() === "prompt" ? name : undefined));
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
/* how many pixels differ between two screenshots of the same box (decoded and compared in the page) */
const changedPixels = (page, a, b) => page.evaluate(async ([x, y]) => {
  const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = "data:image/png;base64," + s; });
  const imgs = await Promise.all([load(x), load(y)]), c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = imgs[0].width; c.height = imgs[0].height;
  const [p, q] = imgs.map((img) => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; });
  let n = 0;
  for (let k = 0; k < p.length; k += 4) if (p[k] !== q[k] || p[k + 1] !== q[k + 1] || p[k + 2] !== q[k + 2]) n++;
  return n;
}, [a.toString("base64"), b.toString("base64")]);

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
    await guard("switches, Settings' Now line", async () => {
      /* the line under the lists names the theme on screen: it follows a Day/Night switch, and an own theme
         that is already a half, which shows the way the switch would show it (Follow phone, a light phone) */
      let ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      let page = await open(ctx, url, NOON);
      await openSettings(page);
      await page.click('#sDN [data-dn="night"]'); await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.getElementById("autoHint").textContent);
      await ctx.close();
      ctx = await context(b, null, { ll_prefs: { auto: "system", theme: "day", autoDay: "day", autoNight: "c:t3a", customs: [LAMP] } });
      page = await open(ctx, url, NOON);
      await openSettings(page);
      await page.click('#themeChips [data-theme="c:t3a"]'); await page.waitForTimeout(150);
      const own = { theme: (await st(page)).theme, hint: await page.evaluate(() => document.getElementById("autoHint").textContent) };
      R.check('Settings\' Now line follows the theme on screen: Night gives "Now: Dusk, day and night", and an own theme that is already a half "Now: Reading lamp, while your phone is set to light"',
        sw === "Now: Dusk, day and night" && own.theme === "c:t3a" && own.hint === "Now: Reading lamp, while your phone is set to light", JSON.stringify({ sw, own }));
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
      /* `old`: what is left of the nine headed groups, their labels and their single built-in tiles (§4.5) */
      const set = await page.evaluate(() => {
        const c = document.getElementById("themeChips"), lab = document.getElementById("tg-custom");
        const mine = c && c.querySelector(':scope > .looks.q-mine[role="group"][aria-labelledby="tg-custom"]');
        return { dn: !!document.querySelector('#themeGroup > #sDN [data-dn="day"]') && !!document.querySelector('#themeGroup > #sDN [data-dn="night"]'),
          looks: !!(c && c.querySelector(':scope > .looks[role="group"][aria-labelledby="themeL"] > .tile.look')), mine: lab ? lab.textContent : null, add: !!(mine && mine.querySelector(".chip-new")),
          old: document.querySelectorAll('#themeChips .chip-group, #themeChips .chip-group-label, #themeChips .chip[data-theme]:not([data-theme^="c:"])').length };
      });
      const lk = await looksIn(page, "#themeChips");
      R.check("Settings › Theme has the switch, six looks and Mine", set.dn && set.looks && set.mine === "Mine" && set.add && set.old === 0 && lk.map((l) => l.id).join() === DAYS.join() &&
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
      const ctx = await context(b, null, { ll_prefs: { auto: "off", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      await openSettings(page);
      const l = await lists(page), ids = await page.evaluate(() => Object.keys(window.llThemes.THEMES));
      /* both lists: Light and Dark hold the looks' day and night themes, every built-in once, and Mine holds
         the reader's own */
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
      R.check("Settings' Mine label is in Dutch on a Dutch device", lab === MINE_NL, lab);
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
    await guard("settings, focus through a redraw", async () => {
      /* a change of the pair draws the tiles again, and the focus stays on the tile that had it (§10.2).
         Settings holds the looks and Mine in one grid, whose first pressed tile is the pair's, above
         Mine: an own theme's tile there keeps the focus all the same, as it does in the popover's Mine.
         A tile that has gone (the pair's own, once the pair is a look) hands it to the pressed one.
         AutoTheme.setPair stands in for any change of the pair made while a tile has the focus */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "c:t3a", autoDay: "c:t3a", autoNight: "dusk", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      const setPair = (which, k) => page.evaluate(([w, t]) => window.__ll.AutoTheme.setPair(w, t), [which, k]);
      /* the focused tile: what it shows, whether it is pressed, and which grid it is in */
      const focused = () => page.evaluate(() => {
        const a = document.activeElement;
        return a ? (a.dataset.look || a.dataset.theme || a.tagName) + ":" + a.getAttribute("aria-pressed") + " in " +
          (a.closest("#themeChips > .q-mine") ? "Settings' Mine" : a.closest("#themeChips > .looks") ? "Settings' looks" : a.closest("#qMine") ? "the popover's Mine" : a.closest("#qLooks") ? "the popover's looks" : "neither") : null;
      });
      await openSettings(page);
      await page.focus('#themeChips .q-mine [data-theme="c:t3a"]');
      await setPair("night", "ink"); await page.waitForTimeout(150);
      const mine = await focused(), pairName = (await looksIn(page, "#themeChips"))[0].name;
      await page.focus('#themeChips [data-look="pair"]');
      await setPair("night", "dusk"); await page.waitForTimeout(150);
      const pair = await focused();
      await setPair("day", "day"); await page.waitForTimeout(150);
      const gone = await focused();
      await setPair("day", "c:t3a"); await page.waitForTimeout(150);
      await page.evaluate(() => window.llPop.sheet(false)); await page.waitForTimeout(300);
      await openTheme(page);
      await page.focus('#qMine [data-theme="c:t3a"]');
      await setPair("night", "ink"); await page.waitForTimeout(150);
      const pop = await focused();
      R.check("a redraw keeps focus on the tile that had it, in Settings' Mine too, or on the pressed one when that tile has gone",
        pairName === "Reading lamp & Ink" && mine === "c:t3a:true in Settings' Mine" && pair === "pair:true in Settings' looks" && gone === "day:true in Settings' looks" && pop === "c:t3a:true in the popover's Mine",
        JSON.stringify({ pairName, mine, pair, gone, pop }));
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
    await guard("settings, a theme outside the pair", async () => {
      /* a theme outside the pair (only the raw llThemes.select leaves one) is neither half, except that
         Contrast counts as Day. A list that makes it a half changes only the pair, the screen stays, and
         every Day/Night switch (the popover's, Settings', the dock's) then marks that half (§4.4): Cocoa
         outside Day/Dusk made the day theme, Day; Contrast made the night theme, Night */
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url, NOON);
      const marks = () => page.evaluate(() => ["qDN", "sDN"].map((id) => [...document.querySelectorAll("#" + id + " [data-dn]")].map((x) => x.dataset.dn + ":" + x.getAttribute("aria-pressed")).join(","))
        .concat(document.getElementById("dockDay").getAttribute("aria-pressed") + "/" + document.getElementById("dockNight").getAttribute("aria-pressed")).join(" "));
      const NONE = "day:false,night:false day:false,night:false false/false", DAY = "day:true,night:false day:true,night:false true/false", NIGHT = "day:false,night:true day:false,night:true false/true";
      await openSettings(page);
      await page.evaluate(() => window.llThemes.select("cocoa")); await page.waitForTimeout(100);
      const c0 = await marks();
      await page.selectOption("#autoDay", "cocoa"); await page.waitForTimeout(150);
      const c1 = await marks(), cs = await st(page);
      await page.selectOption("#autoDay", "day"); await page.waitForTimeout(150);
      await page.evaluate(() => window.llThemes.select("hicon")); await page.waitForTimeout(100);
      const h0 = await marks();
      await page.selectOption("#autoNight", "hicon"); await page.waitForTimeout(150);
      const h1 = await marks(), hs = await st(page);
      R.check("a list that makes the theme on screen a half marks that half in every switch",
        c0 === NONE && cs.theme === "cocoa" && cs.autoDay === "cocoa" && cs.autoNight === "dusk" && c1 === DAY &&
        h0 === DAY && hs.theme === "hicon" && hs.autoDay === "day" && hs.autoNight === "hicon" && h1 === NIGHT, JSON.stringify({ c0, c1, cs, h0, h1, hs }));
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

    /* ---------------- own themes (§5.4) ---------------- */
    await guard("own themes, Auto off", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      await openTheme(page);
      await page.click('#qMine [data-theme="c:t3a"]'); await page.waitForTimeout(150);
      /* read with the popover still open: the pair tile comes without a reopen, in Settings too */
      const s = await st(page), pop = await looksIn(page, "#qLooks"), set = await looksIn(page, "#themeChips"), t = await toasts(page);
      const mine = await page.evaluate(() => ["#qMine", "#themeChips .q-mine"].map((g) => { const x = document.querySelector(g + ' [data-theme="c:t3a"]'); return x ? x.getAttribute("aria-pressed") : "none"; }).join());
      R.check('own theme, Auto off, Day on screen: it shows, pair c:t3a/dusk, the pair tile "Reading lamp & Dusk" first and pressed, its Mine tile pressed, no toast',
        s.theme === "c:t3a" && s.autoDay === "c:t3a" && s.autoNight === "dusk" && pairFirst(pop, "Reading lamp & Dusk") && pairFirst(set, "Reading lamp & Dusk") && mine === "true,true" && t.length === 0,
        JSON.stringify({ s, pop: pop.slice(0, 2), set: set.slice(0, 2), mine, t }));
      await ctx.close();
    });
    await guard("own themes, Auto on", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      await openTheme(page);
      await page.click('#qDN [data-dn="night"]'); await page.waitForTimeout(150);
      const held = (await st(page)).hold;
      await page.click('#qMine [data-theme="c:t3a"]'); await page.waitForTimeout(150);
      const s = await st(page), t = await toasts(page);
      /* the 30 s check comes round with the hold in force: the own theme stays */
      await page.clock.fastForward("00:31"); await page.waitForTimeout(100);
      const s2 = await st(page);
      R.check('own theme, Auto on (time, noon) with Night held: autoNight becomes it, the hold keeps its until, now on it; the first-pick toast says "is now your night theme"',
        !!held && held.theme === "dusk" && held.period === "day" && s.theme === "c:t3a" && s.autoDay === "day" && s.autoNight === "c:t3a" && !!s.hold && s.hold.theme === "c:t3a" && s.hold.until === held.until && s.hold.period === "day" &&
        s2.theme === "c:t3a" && t.some((x) => x.indexOf("Day and night is on: Reading lamp is now your night theme.") >= 0), JSON.stringify({ held, s, s2, t }));
      await ctx.close();
    });
    await guard("own themes, already the other half", async () => {
      /* Reading lamp is the night theme of Day/Reading lamp. A tap on its tile and a tap on Night, each in a tab
         of its own, end the same way: Reading lamp on screen, held at noon, the pair as it was */
      const seed = { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "day", autoDay: "day", autoNight: "c:t3a", customs: [LAMP] } };
      const after = async (sel) => {
        const ctx = await context(b, null, seed);
        const page = await open(ctx, url, NOON);
        await openTheme(page);
        await page.click(sel); await page.waitForTimeout(150);
        const r = { s: await st(page), dn: await dnIn(page, "#qDN"), t: await toasts(page) };
        await ctx.close();
        return r;
      };
      const own = await after('#qMine [data-theme="c:t3a"]'), night = await after('#qDN [data-dn="night"]');
      R.check("own theme that is already the other half: the pair stays; it shows as Night would",
        own.s.theme === "c:t3a" && own.s.autoDay === "day" && own.s.autoNight === "c:t3a" && !!own.s.hold && own.s.hold.theme === "c:t3a" && own.dn === "day:false,night:true" && own.t.length === 0 &&
        JSON.stringify(own.s) === JSON.stringify(night.s) && own.dn === night.dn, JSON.stringify({ own, night }));
    });

    /* ---------------- focus through a choice that draws the tiles again ---------------- */
    await guard("focus, an own theme", async () => {
      /* Enter on an own theme's tile brings the pair's tile in ahead of the looks, so the grids are drawn again:
         the focus stays on the own theme's tile, now pressed (Review Focus 1), in the popover and in Settings */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      const focused = () => page.evaluate(() => {
        const a = document.activeElement, g = a && a.closest ? a.closest("#qMine, #themeChips") : null;
        return (a && a.dataset.theme) + ":" + (a && a.getAttribute("aria-pressed")) + " in " + (g ? g.id : "neither") + ", pair tile " + !!document.querySelector((g && g.id === "qMine" ? "#qLooks" : "#themeChips") + ' [data-look="pair"]');
      });
      await openTheme(page);
      await page.focus('#qMine [data-theme="c:t3a"]');
      await page.keyboard.press("Enter"); await page.waitForTimeout(150);
      const pop = await focused();
      /* back to Day & Dusk, then the same in Settings */
      await page.click('#qLooks [data-look="day"]'); await page.waitForTimeout(150);
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      await openSettings(page);
      await page.focus('#themeChips [data-theme="c:t3a"]');
      await page.keyboard.press("Enter"); await page.waitForTimeout(150);
      const set = await focused();
      R.check("Enter on an own theme: the pair tile appears, and the focus stays on the own theme's tile, pressed, in the popover and in Settings",
        pop === "c:t3a:true in qMine, pair tile true" && set === "c:t3a:true in themeChips, pair tile true", JSON.stringify({ pop, set }));
      await ctx.close();
    });
    await guard("focus, the actions row", async () => {
      /* Rename, Duplicate and Delete in the row under Mine draw the tiles and the row again: the focus stays on
         the action pressed, or, after Delete, whose row goes with the theme, moves to the pressed look */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "c:t3a", autoDay: "c:t3a", autoNight: "dusk", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      answer(page, "Lamp renamed");
      const focused = () => page.evaluate(() => { const a = document.activeElement;
        return !a ? null : a.closest("#qActs") ? "act:" + a.dataset.act : a.closest("#qLooks") ? "look:" + a.dataset.look + ":" + a.getAttribute("aria-pressed") : a.tagName; });
      await openTheme(page);
      await page.click('#qMine .mine-ed[data-acts="c:t3a"]'); await page.waitForTimeout(100);
      const enter = async (act) => { await page.focus('#qActs [data-act="' + act + '"]'); await page.keyboard.press("Enter"); await page.waitForTimeout(150); return focused(); };
      const ren = await enter("rename"), dup = await enter("dup"), del = await enter("del");
      const s = await st(page), names = await page.evaluate(() => window.llThemes.customs().map((c) => c.name).join("|"));
      R.check("the popover's Rename and Duplicate keep the focus on the action pressed; Delete moves it to the pressed look",
        ren === "act:rename" && dup === "act:dup" && del === "look:day:true" && names === "Lamp renamed copy" && s.theme === "day" && s.autoDay === "day", JSON.stringify({ ren, dup, del, names, s }));
      await ctx.close();
    });

    /* ---------------- deleting an own theme (§5.6) ---------------- */
    await guard("delete, Auto on", async () => {
      /* Reading lamp is the day theme, on screen at 22:00 under a Day hold. Deleted from the popover's ⋯, the day
         half falls back to Day, which shows, and the hold moves to it; Undo puts everything back */
      const hold = { theme: "c:t3a", period: "night", until: NEXT_7 };
      const ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "c:t3a", autoDay: "c:t3a", autoNight: "dusk", customs: [LAMP], dnHold: hold } });
      const page = await open(ctx, url, NIGHT);
      answer(page);
      const s0 = await st(page);
      await openTheme(page);
      await page.click('#qMine .mine-ed[data-acts="c:t3a"]'); await page.waitForTimeout(100);
      await page.click('#qActs [data-act="del"]'); await page.waitForTimeout(150);
      const s1 = await st(page), saved1 = JSON.parse(await prefs(page)), t1 = await toastNow(page);
      await page.click("#toast .toast-act"); await page.waitForTimeout(150);
      const s2 = await st(page), saved2 = JSON.parse(await prefs(page)), ids = await page.evaluate(() => window.llThemes.customs().map((c) => c.id).join());
      await page.clock.fastForward("00:31"); await page.waitForTimeout(100);
      const s3 = await st(page);
      const same = (h, theme) => !!h && h.theme === theme && h.period === "night" && h.until === NEXT_7;
      R.check("deleting the own theme on screen (the day half, Auto on, Day held at night) shows Day, the hold now on day; Undo restores the theme, pair, screen and hold",
        s0.theme === "c:t3a" && same(s0.hold, "c:t3a") &&
        s1.theme === "day" && s1.autoDay === "day" && s1.autoNight === "dusk" && same(s1.hold, "day") && saved1.theme === "day" && same(saved1.dnHold, "day") && !!t1 && t1.text === "Deleted “Reading lamp”" && t1.act === "Undo" &&
        ids === "t3a" && s2.theme === "c:t3a" && s2.autoDay === "c:t3a" && s2.autoNight === "dusk" && same(s2.hold, "c:t3a") && saved2.theme === "c:t3a" && saved2.autoDay === "c:t3a" && same(saved2.dnHold, "c:t3a") &&
        s3.theme === "c:t3a", JSON.stringify({ s0, s1, t1, s2, ids, s3 }));
      await ctx.close();
    });
    await guard("delete, Dusk/own", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "dusk", autoDay: "dusk", autoNight: "c:t3a", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      answer(page);
      await page.evaluate(() => window.llThemes.remove(window.llThemes.customs()[0])); await page.waitForTimeout(150);
      const s = await st(page), saved = JSON.parse(await prefs(page));
      R.check("deleting the night own theme over Dusk/own (Dusk as the day theme, on screen): the pair becomes day/dusk and the day half shows Day",
        s.theme === "day" && s.autoDay === "day" && s.autoNight === "dusk" && saved.theme === "day" && saved.autoDay === "day" && saved.autoNight === "dusk", JSON.stringify({ s, saved: [saved.theme, saved.autoDay, saved.autoNight] }));
      await ctx.close();
    });
    await guard("delete, Settings' editor", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "c:t3a", autoDay: "c:t3a", autoNight: "dusk", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      answer(page);
      await openSettings(page);
      await page.click("#cDel"); await page.waitForTimeout(200);
      const f = await page.evaluate(() => { const a = document.activeElement; return { inChips: !!(a && a.closest("#themeChips")), look: a && a.dataset.look, on: a && a.getAttribute("aria-pressed"), theme: window.__ll.state.theme }; });
      R.check("Delete in Settings' editor leaves focus on the pressed tile", f.inChips && f.look === "day" && f.on === "true" && f.theme === "day", JSON.stringify(f));
      await ctx.close();
    });

    /* ---------------- Settings' editor: Duplicate and Save as new (§5.4) ---------------- */
    await guard("Settings' editor, Duplicate and Save as new", async () => {
      /* Reading lamp is the night theme, on screen. Each copy takes its place in the night half at once: the
         state has changed by the time the click returns, and no cross-fade starts (motion is on here) */
      const ctx = await context(b, { reducedMotion: "no-preference" }, { ll_prefs: { auto: "off", theme: "c:t3a", autoDay: "day", autoNight: "c:t3a", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      answer(page, "Lamp two");
      /* every cross-fade counted (the browser has view transitions, or the count would prove nothing) */
      const counting = await page.evaluate(() => {
        window.__vt = 0;
        const orig = document.startViewTransition && document.startViewTransition.bind(document);
        if (orig) document.startViewTransition = (cb) => { window.__vt++; return orig(cb); };
        return !!orig;
      });
      await openSettings(page);
      const click = (id) => page.evaluate((x) => {
        document.getElementById(x).click();
        const s = window.__ll.state, c = window.llThemes.customs(), last = c[c.length - 1];
        return { theme: s.theme, day: s.autoDay, night: s.autoNight, last: "c:" + last.id, name: last.name, n: c.length };
      }, id);
      const dup = await click("cDup"), sav = await click("cSaveAs"), vt = await page.evaluate(() => window.__vt);
      const ok = (r, n, name) => r.n === n && r.name === name && r.theme === r.last && r.night === r.last && r.day === "day";
      R.check("Duplicate shows the copy as the half on screen; Save as new likewise; both instant", ok(dup, 2, "Reading lamp copy") && ok(sav, 3, "Lamp two") && counting && vt === 0, JSON.stringify({ dup, sav, counting, vt }));
      await ctx.close();
    });

    /* ---------------- picking by id (§5.8) ---------------- */
    await guard("by id", async () => {
      let ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      let page = await open(ctx, url, NOON);
      const api = await page.evaluate(() => { const T = window.llThemes; return { looks: Array.isArray(T.LOOKS) && T.LOOKS.map((l) => l.id).join(), look: typeof T.look, gone: ["CYCLE", "groups", "pickerGroups", "previous"].filter((k) => k in T),
        missing: ["THEMES", "contrast", "resolve", "current", "customs", "select", "pick", "create", "fix", "remove", "maker", "dnOf", "setDayNight", "hold"].filter((k) => !(k in T)) }; });
      R.check("llThemes has LOOKS and look; CYCLE, groups, pickerGroups and previous are gone", api.looks === DAYS.join() && api.look === "function" && !api.gone.length && !api.missing.length, JSON.stringify(api));
      await page.evaluate(() => window.llThemes.pick("ink")); await page.waitForTimeout(100);
      const off = await st(page);
      const bg = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--bg"));
      const before = await prefs(page), bg0 = await bg();
      await page.evaluate(() => window.llThemes.select("gone7")); await page.waitForTimeout(100);
      const gone = { s: await st(page), same: (await prefs(page)) === before, bg: [bg0, await bg()] };
      R.check('select("gone7") changes nothing and saves nothing', gone.s.theme === "ink" && gone.same && !!gone.bg[0] && gone.bg[0] === gone.bg[1], JSON.stringify(gone));
      await ctx.close();
      ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00" } });
      page = await open(ctx, url, NOON);
      await page.evaluate(() => window.llThemes.pick("ink")); await page.waitForTimeout(100);
      const on = await st(page);
      R.check('pick("ink") gives paper/ink with Ink on screen; at noon with Auto on, a hold on ink',
        off.theme === "ink" && off.autoDay === "paper" && off.autoNight === "ink" && !off.hold && on.theme === "ink" && on.autoDay === "paper" && on.autoNight === "ink" && !!on.hold && on.hold.theme === "ink" && on.hold.period === "day",
        JSON.stringify({ off, on }));
      await ctx.close();
      ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "day", autoDay: "day", autoNight: "cocoa" } });
      page = await open(ctx, url, NOON);
      await page.evaluate(() => window.llThemes.pick("day")); await page.waitForTimeout(100);
      const dd = await st(page);
      R.check('pick("day") on a day/cocoa pair gives day/dusk', dd.theme === "day" && dd.autoDay === "day" && dd.autoNight === "dusk", JSON.stringify(dd));
      await ctx.close();
    });

    /* ---------------- the pair tile's Undo (§5.2) ---------------- */
    await guard("pair tile, Undo", async () => {
      let ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "day", autoDay: "day", autoNight: "cocoa" } });
      let page = await open(ctx, url, NOON);
      await tapLook(page, "sepia");
      const s = await st(page), t = await toastNow(page);
      R.check('Sepia & Cocoa replaces a day/cocoa pair: toast "Sepia & Cocoa for day and night" with Undo',
        s.theme === "sepia" && s.autoDay === "sepia" && s.autoNight === "cocoa" && !!t && t.text === "Sepia & Cocoa for day and night" && t.act === "Undo", JSON.stringify({ s, t }));
      await ctx.close();
      /* at 22:00 with Day held on day: the look carries the hold over to Sepia, which changes the live hold, so
         only a copy taken before the tap can put the hold on day back */
      ctx = await context(b, null, { ll_prefs: { auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "day", autoDay: "day", autoNight: "cocoa", dnHold: { theme: "day", period: "night", until: NEXT_7 } } });
      page = await open(ctx, url, NIGHT);
      const s0 = await st(page);
      await tapLook(page, "sepia");
      const s1 = await st(page);
      /* the click on Undo, outside the popover, closes it: the pair's tile is back in Settings, and in the
         popover once it opens again */
      await page.click("#toast .toast-act"); await page.waitForTimeout(150);
      const s2 = await st(page), saved = JSON.parse(await prefs(page)), set = await looksIn(page, "#themeChips");
      await openTheme(page);
      const pop = await looksIn(page, "#qLooks");
      await page.clock.fastForward("00:31"); await page.waitForTimeout(100);
      const s3 = await st(page);
      const held = (h, theme) => !!h && h.theme === theme && h.period === "night" && h.until === NEXT_7;
      R.check("Undo restores day/cocoa, the screen and the hold",
        s0.theme === "day" && held(s0.hold, "day") && s1.theme === "sepia" && held(s1.hold, "sepia") &&
        s2.theme === "day" && s2.autoDay === "day" && s2.autoNight === "cocoa" && held(s2.hold, "day") && saved.theme === "day" && saved.autoNight === "cocoa" && held(saved.dnHold, "day") &&
        pairFirst(set, "Day & Cocoa") && pairFirst(pop, "Day & Cocoa") && s3.theme === "day", JSON.stringify({ s0, s1, s2, s3, set: set.slice(0, 1), pop: pop.slice(0, 1) }));
      await ctx.close();
    });
    await guard("pair tile, Undo after a second look", async () => {
      /* a second look tapped while the first one's toast is up: the toast names the look now on screen, and its
         Undo still goes back to the pair that was no look. Once that toast has gone (its time ran out, or another
         toast took its place), a look over a look shows none */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "day", autoDay: "day", autoNight: "cocoa" } });
      const page = await open(ctx, url, NOON);
      await tapLook(page, "sepia");
      await tapLook(page, "paper");
      const s1 = await st(page), t1 = await toastNow(page);
      await page.click("#toast .toast-act"); await page.waitForTimeout(150);
      const s2 = await st(page);
      R.check('a second look while the toast is up: it reads "Paper & Ink for day and night", and Undo restores day/cocoa with Day',
        s1.theme === "paper" && s1.autoDay === "paper" && s1.autoNight === "ink" && !!t1 && t1.text === "Paper & Ink for day and night" && t1.act === "Undo" &&
        s2.theme === "day" && s2.autoDay === "day" && s2.autoNight === "cocoa", JSON.stringify({ s1, t1, s2 }));
      await tapLook(page, "sepia");
      await page.clock.fastForward("00:05"); await page.waitForTimeout(100);
      const out = await toastNow(page);
      await tapLook(page, "sage");
      const t2 = await toastNow(page);
      await page.evaluate(() => window.__ll.AutoTheme.setPair("night", "cocoa"));
      await tapLook(page, "paper");
      const t3 = await toastNow(page);
      await page.evaluate(() => window.__ll.Marks.toast("Something else"));
      await tapLook(page, "seaair");
      const t4 = await toastNow(page), s4 = await st(page);
      R.check("once that toast has gone, or another has taken its place, a look over a look shows none",
        out === null && t2 === null && !!t3 && t3.text === "Paper & Ink for day and night" && !!t4 && t4.text === "Something else" && t4.act === "" && s4.theme === "seaair" && s4.autoNight === "canals",
        JSON.stringify({ out, t2, t3, t4, s4 }));
      await ctx.close();
    });

    /* ---------------- the rule for every choice (§5.0) ---------------- */
    for (const auto of ["off", "time"]){
      await guard("invariant, Auto " + auto, async () => {
        const ctx = await context(b, null, { ll_prefs: { auto, nightFrom: "21:00", nightTo: "07:00", customs: [LAMP] } });
        const page = await open(ctx, url, NOON);
        answer(page, "Lamp three");
        const bad = [], trail = [];
        const step = async (label, fn) => {
          await fn(); await page.waitForTimeout(150);
          const s = await st(page);
          trail.push(label + ": " + s.theme + " " + s.autoDay + "/" + s.autoNight);
          if (!((s.theme === s.autoDay || s.theme === s.autoNight) && s.autoDay !== s.autoNight)) bad.push(label + " " + JSON.stringify(s));
        };
        await step("look Paper & Ink", () => tapLook(page, "paper"));
        await step("Night", () => page.click('#qDN [data-dn="night"]'));
        await step("own theme", () => page.click('#qMine [data-theme="c:t3a"]'));
        await step("Settings' Duplicate", async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(150); await openSettings(page); await page.click("#cDup"); });
        await step("Settings' Save as new", () => page.click("#cSaveAs"));
        await step("list Day theme → Sage", () => page.selectOption("#autoDay", "sage"));
        await step("look Sea air & Canals", () => page.click('#themeChips [data-look="seaair"]'));
        await step("t", () => page.keyboard.press("t"));
        await step("delete the own theme", () => page.evaluate(() => window.llThemes.remove(window.llThemes.customs().filter((c) => c.id === "t3a")[0])));
        await step("list Night theme → Cocoa", () => page.selectOption("#autoNight", "cocoa"));
        await step("Day", () => page.click('#sDN [data-dn="day"]'));
        R.check("the invariant, Auto " + auto + ": after every choice the theme on screen is a half of the pair, and the halves differ", bad.length === 0 && trail.length === 11, (bad.length ? bad.join(" | ") + " … " : "") + trail.join(" · "));
        await ctx.close();
      });
    }

    /* ---------------- Recent goes (§4.5) ---------------- */
    await guard("Recent", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off", customs: [LAMP] }, ll_theme_recent: ["sepia"] });
      const page = await open(ctx, url, NOON);
      const recent = () => page.evaluate(() => localStorage.getItem("ll_theme_recent"));
      const r0 = await recent();
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(150);
      const r1 = await recent();
      await tapLook(page, "paper");
      await page.click('#qMine [data-theme="c:t3a"]'); await page.waitForTimeout(150);
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await page.keyboard.press("t"); await page.waitForTimeout(150);
      const r2 = await recent(), s = await st(page);
      R.check("ll_theme_recent is removed at boot and never written", r0 === null && r1 === null && r2 === null && s.theme === "ink" && s.autoDay === "c:t3a", JSON.stringify({ r0, r1, r2, s }));
      await ctx.close();
    });

    /* ---------------- first run (§6) ---------------- */
    /* with no ll_prefs, Day and night starts on Follow phone and the theme on screen is the half the phone asks
       for, set before the first theme is applied, so the page never applies Day and then Dusk (before app.js
       runs it has app.css's Day, §9.1); a device that asks for more contrast starts in the contrast pair. A
       stored profile keeps its own setting, even one with no auto field, and Clear everything makes the next
       load a first run. Every --bg the page sets on its root is noted from before app.js runs */
    const firstRun = async (opts, seed) => {
      const ctx = await context(b, opts, seed);
      await ctx.addInitScript(() => {
        window.__bgs = [];
        const set = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function(k, v){
          if (k === "--bg" && this === document.documentElement.style) window.__bgs.push(String(v).toUpperCase());
          return set.apply(this, arguments);
        };
      });
      return { ctx, page: await open(ctx, url) };
    };
    /* Auto, the theme and the pair; Settings' pressed Auto chip ("system:Follow phone") and its now line; the
       --bg values set so far; the tone; the pressed look in Settings; and what is stored */
    const firstState = (page) => page.evaluate(() => {
      const s = window.__ll.state, chip = document.querySelector('#autoChips .chip[aria-pressed="true"]'), look = document.querySelector('#themeChips .tile.look[aria-pressed="true"]');
      const saved = JSON.parse(localStorage.getItem("ll_prefs") || "null");
      return { auto: s.auto, theme: s.theme, autoDay: s.autoDay, autoNight: s.autoNight, chips: chip ? chip.dataset.auto + ":" + chip.textContent.trim() : null,
        now: document.getElementById("autoHint").textContent, bgs: window.__bgs.slice(), tone: document.documentElement.dataset.tone, look: look ? look.dataset.look : null,
        saved: saved && { auto: saved.auto, theme: saved.theme, autoDay: saved.autoDay, autoNight: saved.autoNight } };
    });
    await guard("first run, a light phone", async () => {
      const { ctx, page } = await firstRun(PHONE);
      const f = await firstState(page);
      await openTheme(page);
      const q = await page.evaluate(() => { const c = document.querySelector('#qAuto .chip[aria-pressed="true"]'); return { auto: c ? c.dataset.auto : null, now: document.getElementById("qNow").textContent }; });
      R.check("fresh, light phone: auto system, Day, chips show Follow phone", f.auto === "system" && f.theme === "day" && f.autoDay === "day" && f.autoNight === "dusk" && f.look === "day" &&
        f.chips === "system:Follow phone" && q.auto === "system" && f.now === "Now: Day, while your phone is set to light" && q.now === f.now, JSON.stringify({ f, q }));
      await ctx.close();
    });
    await guard("first run, a dark phone", async () => {
      const { ctx, page } = await firstRun(Object.assign({ colorScheme: "dark" }, PHONE));
      const f = await firstState(page);
      R.check("fresh, dark phone (colorScheme dark): Dusk", f.auto === "system" && f.theme === "dusk" && f.autoDay === "day" && f.autoNight === "dusk" && f.tone === "dark" &&
        f.chips === "system:Follow phone" && f.now === "Now: Dusk, while your phone is set to dark", JSON.stringify(f));
      R.check("fresh, dark phone: Dusk is the first theme the page applies, not Day and then Dusk", f.bgs.length > 0 && f.bgs.every((c) => c === "#0D121C"), f.bgs.join(" "));
      await ctx.close();
    });
    await guard("first run, more contrast", async () => {
      const light = await firstRun({ contrast: "more" });
      const l = await firstState(light.page);
      await light.ctx.close();
      const dark = await firstRun({ contrast: "more", colorScheme: "dark" });
      const d = await firstState(dark.page);
      await dark.ctx.close();
      R.check("fresh, prefers-contrast more, light: hicon with hicon/hidark", l.auto === "system" && l.theme === "hicon" && l.autoDay === "hicon" && l.autoNight === "hidark" &&
        l.tone === "contrast" && l.look === "hicon", JSON.stringify(l));
      R.check("fresh, prefers-contrast more, dark: hidark with hicon/hidark, the first theme applied", d.auto === "system" && d.theme === "hidark" && d.autoDay === "hicon" && d.autoNight === "hidark" &&
        d.tone === "contrast" && d.look === "hicon" && d.bgs.length > 0 && d.bgs.every((c) => c === "#000000"), JSON.stringify(d));
    });
    await guard("first run, a stored profile", async () => {
      /* a light phone: a first run would show Day */
      const { ctx, page } = await firstRun(null, { ll_prefs: { theme: "dusk" } });
      const f = await firstState(page);
      R.check('an existing profile with no auto field ({theme: "dusk"}) stays off, with Dusk on screen', f.auto === "off" && f.theme === "dusk" && f.autoDay === "day" && f.autoNight === "dusk" &&
        f.chips === "off:Off" && f.bgs.length > 0 && f.bgs.every((c) => c === "#0D121C"), JSON.stringify(f));
      await ctx.close();
    });
    await guard("first run, after Clear everything", async () => {
      /* the Storage panel's Clear everything (both questions answered yes) empties the device and reloads */
      const { ctx, page } = await firstRun(null, { ll_prefs: { auto: "off", theme: "dusk" } });
      const before = await firstState(page);
      page.on("dialog", (d) => d.accept());
      await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 20000 }), page.evaluate(() => window.llStorage.act("wipe")).catch(() => {})]);
      await page.waitForTimeout(300);
      const after = await firstState(page);
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(150);
      const again = await firstState(page);
      R.check("Clear everything then reload: auto system", before.auto === "off" && before.theme === "dusk" && after.auto === "system" && after.theme === "day" && after.autoDay === "day" &&
        after.autoNight === "dusk" && after.chips === "system:Follow phone", JSON.stringify({ before, after }));
      R.check("a first run's Follow phone is stored: the next load is no first run, and keeps it", !!after.saved && after.saved.auto === "system" && after.saved.theme === "day" &&
        again.auto === "system" && again.theme === "day", JSON.stringify({ saved: after.saved, again }));
      await ctx.close();
    });

    /* ---------------- moving readers (§7.2) ---------------- */
    /* each case stores a profile and loads it once. A pair case puts one of the pair's own themes on screen (its
       day theme, unless the theme on screen is what the case is about), so the fold of a theme outside the pair
       (step 7) cannot stand in for the rule under test. A hold is seeded at noon with the period that holds
       then. What the load gave is read live and as boot saved it, with the clock standing still, so the notice
       cannot clear themeWas first */
    const loadAs = async (seed, clock) => {
      const ctx = await context(b, null, { ll_prefs: seed });
      const page = await open(ctx, url, clock, true);
      const r = await moved(page);
      await ctx.close();
      return r;
    };
    const both = (r, fn) => fn(r.s) && fn(r.saved);
    /* the end of a hold made at noon: On a schedule (night 21:00–07:00) the next boundary, and with Follow phone
       12 hours on, midnight */
    const AT_21 = new Date(2026, 9, 9, 21, 0, 0).getTime(), MIDNIGHT = new Date(2026, 9, 10, 0, 0, 0).getTime();
    await guard("moving readers, every retired id", async () => {
      /* one tab: the profile is stored afresh before each load. The clock stands still, so the notice the load before
         set off (800 ms on) cannot save that page's state over the profile just stored */
      const ctx = await context(b, null);
      const page = await open(ctx, url, null, true);
      const wrong = [];
      for (const [id, to] of Object.entries(MOVES)){
        await page.evaluate((p) => localStorage.setItem("ll_prefs", JSON.stringify(p)), { auto: "off", theme: id });
        await page.reload({ waitUntil: "load" });
        const r = await moved(page);
        if (r.s.theme !== to || r.saved.theme !== to) wrong.push(id + " → " + r.s.theme + "/" + r.saved.theme);
      }
      R.check("every retired id as theme (Auto off) loads as its target", Object.keys(MOVES).length === 38 && wrong.length === 0, wrong.join(", "));
      await ctx.close();
    });
    await guard("moving readers, pairs", async () => {
      /* Follow phone on a light phone at noon, Night held until midnight: the hold moves with its half, and shows */
      const a = await loadAs({ auto: "system", theme: "linen", autoDay: "linen", autoNight: "candle", dnHold: { theme: "candle", period: "day", until: MIDNIGHT } }, NOON);
      R.check("pair linen/candle → day/cocoa; hold on candle (Auto on, until tomorrow) → cocoa, same until",
        both(a, (x) => x.autoDay === "day" && x.autoNight === "cocoa" && x.theme === "cocoa" && !!x.hold && x.hold.theme === "cocoa" && x.hold.period === "day" && x.hold.until === MIDNIGHT), JSON.stringify(a));
      const lp = await loadAs({ auto: "off", theme: "linen", autoDay: "linen", autoNight: "peach" });
      const ce = await loadAs({ auto: "off", theme: "candle", autoDay: "candle", autoNight: "ember" });
      R.check("move-made one theme twice: linen/peach → day/seaair; candle/ember → cocoa/dusk",
        both(lp, (x) => x.theme === "day" && x.autoDay === "day" && x.autoNight === "seaair") && both(ce, (x) => x.theme === "cocoa" && x.autoDay === "cocoa" && x.autoNight === "dusk"), JSON.stringify({ lp, ce }));
      const pp = await loadAs({ auto: "off", theme: "peach", autoDay: "linen", autoNight: "peach" });
      R.check("the theme on screen follows its half: theme peach over linen/peach → seaair on screen (night half)",
        both(pp, (x) => x.theme === "seaair" && x.autoDay === "day" && x.autoNight === "seaair") && pp.s.dn === "night", JSON.stringify(pp));
      const ph = await loadAs({ auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "peach", autoDay: "linen", autoNight: "peach", dnHold: { theme: "peach", period: "day", until: AT_21 } }, NOON);
      R.check("a hold follows its half: Auto on (time, noon), Night held on peach over linen/peach → hold on seaair, Sea air on screen",
        both(ph, (x) => x.theme === "seaair" && x.autoDay === "day" && x.autoNight === "seaair" && !!x.hold && x.hold.theme === "seaair" && x.hold.period === "day" && x.hold.until === AT_21), JSON.stringify(ph));
    });
    await guard("moving readers, collapsed pairs and the fold", async () => {
      const dd = await loadAs({ auto: "off", theme: "day", autoDay: "day", autoNight: "day" });
      const ee = await loadAs({ auto: "off", theme: "ember", autoDay: "ember", autoNight: "ember" });
      const cc = await loadAs({ auto: "off", theme: "c:t3a", autoDay: "c:t3a", autoNight: "c:t3a", customs: [LAMP] });
      R.check("legacy collapsed: day/day → day/dusk; ember/ember → sepia/cocoa; c:x/c:x (light) → c:x/dusk",
        both(dd, (x) => x.theme === "day" && x.autoDay === "day" && x.autoNight === "dusk") && both(ee, (x) => x.theme === "cocoa" && x.autoDay === "sepia" && x.autoNight === "cocoa") &&
        both(cc, (x) => x.theme === "c:t3a" && x.autoDay === "c:t3a" && x.autoNight === "dusk"), JSON.stringify({ dd, ee, cc }));
      const dk = await loadAs({ auto: "off", theme: "c:t6d", autoDay: "c:t6d", autoNight: "c:t6d", customs: [EMBERS] });
      R.check("legacy collapsed, a dark own theme: c:y/c:y → day/c:y, still on screen, in the night half",
        both(dk, (x) => x.theme === "c:t6d" && x.autoDay === "day" && x.autoNight === "c:t6d") && dk.s.dn === "night", JSON.stringify(dk));
      const pa = await loadAs({ auto: "off", theme: "paper" });
      R.check("fold: theme paper with day/dusk (Auto off) → paper/dusk", both(pa, (x) => x.theme === "paper" && x.autoDay === "paper" && x.autoNight === "dusk"), JSON.stringify(pa));
      const fo = await loadAs({ auto: "off", theme: "forest" });
      R.check("fold: a dark theme outside the pair (forest over day/dusk) → day/forest", both(fo, (x) => x.theme === "forest" && x.autoDay === "day" && x.autoNight === "forest"), JSON.stringify(fo));
      const hi = await loadAs({ auto: "off", theme: "hicon" }), hd = await loadAs({ auto: "off", theme: "hidark" });
      R.check("fold: theme hicon with day/dusk → hicon/hidark", both(hi, (x) => x.theme === "hicon" && x.autoDay === "hicon" && x.autoNight === "hidark"), JSON.stringify(hi));
      R.check("fold: theme hidark with day/dusk → hicon/hidark, Contrast dark on screen", both(hd, (x) => x.theme === "hidark" && x.autoDay === "hicon" && x.autoNight === "hidark"), JSON.stringify(hd));
      /* the fold's order: a pair that is one theme twice is repaired first, and then a theme outside it takes its
         half. The other way round, Forest would take the night half of Cocoa/Cocoa and leave Cocoa, a dark
         theme, as the day theme */
      const fe = await loadAs({ auto: "off", theme: "forest", autoDay: "ember", autoNight: "ember" });
      R.check("fold after the collapsed-pair repair: forest over ember/ember → sepia/forest", both(fe, (x) => x.theme === "forest" && x.autoDay === "sepia" && x.autoNight === "forest"), JSON.stringify(fe));
    });
    await guard("moving readers, an own theme outside the pair", async () => {
      /* Review Focus 5: an own theme on screen outside the pair, Auto off, at the upgrade. It takes the half its
         page colour says; on screen after the load, the pair's tile shows it pressed, and so does its Mine tile */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "c:t3a", customs: [LAMP] } });
      const page = await open(ctx, url, NOON);
      const mineOn = (sel) => page.evaluate((s) => { const x = document.querySelector(s); return x ? x.getAttribute("aria-pressed") : "none"; }, sel);
      const r = await moved(page), set = await looksIn(page, "#themeChips"), setMine = await mineOn('#themeChips .q-mine [data-theme="c:t3a"]');
      await openTheme(page);
      const pop = await looksIn(page, "#qLooks"), popMine = await mineOn('#qMine [data-theme="c:t3a"]');
      R.check("fold: a light own theme on screen outside day/dusk → c:x/dusk, still on screen, its Mine tile pressed",
        both(r, (x) => x.theme === "c:t3a" && x.autoDay === "c:t3a" && x.autoNight === "dusk") && pairFirst(set, "Reading lamp & Dusk") && pairFirst(pop, "Reading lamp & Dusk") && setMine === "true" && popMine === "true",
        JSON.stringify({ r, set: set.slice(0, 2), pop: pop.slice(0, 2), setMine, popMine }));
      await ctx.close();
    });
    await guard("moving readers, holds and unknown ids", async () => {
      const ho = await loadAs({ auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "day", dnHold: { theme: "paper", period: "day", until: AT_21 } }, NOON);
      R.check("a hold on a theme outside the pair is dropped", both(ho, (x) => x.hold === null && x.theme === "day" && x.autoDay === "day" && x.autoNight === "dusk"), JSON.stringify(ho));
      /* the fold's order: Contrast dark on screen outside the pair, and held, brings the contrast pair before a
         hold on neither half is dropped, so by then the hold is on a half and stays, with Contrast dark on
         screen at noon. Dropping first would end the hold, and Contrast would show */
      const hk = await loadAs({ auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "hidark", dnHold: { theme: "hidark", period: "day", until: AT_21 } }, NOON);
      R.check("a hold on Contrast dark outside day/dusk survives the fold: hicon/hidark, still held, Contrast dark on screen",
        both(hk, (x) => x.autoDay === "hicon" && x.autoNight === "hidark" && x.theme === "hidark" && !!x.hold && x.hold.theme === "hidark" && x.hold.period === "day" && x.hold.until === AT_21), JSON.stringify(hk));
      const un = await loadAs({ auto: "off", theme: "gone7" });
      R.check("unknown id → day", both(un, (x) => x.theme === "day" && x.autoDay === "day" && x.autoNight === "dusk"), JSON.stringify(un));
      /* the checks make an unknown day theme Day, over a night theme that is Day (on screen): only a fold that
         runs after them sees the pair one theme twice, and repairs it */
      const uh = await loadAs({ auto: "off", theme: "day", autoDay: "gone8", autoNight: "day" });
      R.check("an unknown half that the checks make the other half's theme: gone/day → day/dusk", both(uh, (x) => x.theme === "day" && x.autoDay === "day" && x.autoNight === "dusk"), JSON.stringify(uh));
    });
    await guard("moving readers, a second load", async () => {
      /* the clock stands still, so the notice cannot clear the note between the two reads: the note is part of what
         the second load must leave as it was */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "peach", autoDay: "linen", autoNight: "peach" } });
      const page = await open(ctx, url, null, true);
      const p1 = await prefs(page);
      await page.reload({ waitUntil: "load" }); await page.waitForTimeout(100);
      const p2 = await prefs(page);
      R.check("a second load changes nothing", p1 === p2 && JSON.parse(p1).theme === "seaair" && !!JSON.parse(p1).themeWas, p1 + " → " + p2);
      await ctx.close();
    });
    await guard("moving readers, themeWas", async () => {
      /* the clock stands still, so the notice cannot clear the note between the two reads */
      const W = { theme: "candle", autoDay: "day", autoNight: "candle" }, same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const ctx = await context(b, null, { ll_prefs: Object.assign({ auto: "off" }, W) });
      const page = await open(ctx, url, null, true);
      const r1 = await moved(page);
      await page.reload({ waitUntil: "load" });
      const r2 = await moved(page);
      await ctx.close();
      /* a note an earlier load left, not yet acted on, stays as it was when more retired ids come (an old copy
         of the app wrote them since); the ids still move */
      const OLD = { theme: "plum", autoDay: "linen", autoNight: "plum" };
      const r3 = await loadAs({ auto: "off", theme: "ember", autoDay: "day", autoNight: "ember", themeWas: OLD });
      R.check("themeWas records the originals once",
        both(r1, (x) => same(x.was, W) && x.theme === "cocoa" && x.autoDay === "day" && x.autoNight === "cocoa") && both(r2, (x) => same(x.was, W)) &&
        both(r3, (x) => same(x.was, OLD) && x.theme === "cocoa" && x.autoNight === "cocoa"), JSON.stringify({ r1, r2, r3 }));
    });
    await guard("moving readers, junk", async () => {
      /* Review Focus 3: a themeWas that is a number, an array, or an object with a wrong or missing field; a
         retired id only in the hold; theme fields that are no ids at all, or a name every object inherits.
         Load never throws, and a note it makes holds three ids, even beside a half that was junk */
      const before = errors.length, same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const junk = [];
      for (const w of [5, [], { theme: 1 }, { theme: "candle", autoDay: "day" }]) junk.push(await loadAs({ auto: "off", themeWas: w }));
      const hold = await loadAs({ auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "day", dnHold: { theme: "candle", period: "day", until: AT_21 } }, NOON);
      const odd = await loadAs({ auto: "off", theme: ["candle"], autoDay: {}, autoNight: 7, dnHold: 5, themeWas: "candle" });
      const inherited = await loadAs({ auto: "off", theme: "constructor", autoNight: "toString" });
      const mixed = await loadAs({ auto: "off", theme: "candle", autoDay: 5, autoNight: "dusk" });
      R.check("junk themeWas (5, [], {theme:1}) loads as null; a retired id only in dnHold gives themeWas null; no page error",
        junk.every((r) => both(r, (x) => x.was === null)) && both(hold, (x) => x.was === null && x.hold === null && x.theme === "day") &&
        both(odd, (x) => x.was === null && x.hold === null && x.theme === "day" && x.autoDay === "day" && x.autoNight === "dusk") &&
        both(inherited, (x) => x.was === null && x.theme === "day" && x.autoNight === "dusk") &&
        both(mixed, (x) => same(x.was, { theme: "candle", autoDay: "day", autoNight: "dusk" }) && x.theme === "cocoa" && x.autoDay === "day" && x.autoNight === "cocoa") && errors.length === before,
        JSON.stringify({ junk: junk.map((r) => [r.s.was, r.saved.was].map((v) => v === undefined ? "undefined" : v)), hold, odd, inherited, mixed, errors: errors.slice(before) }));
    });

    /* ---------------- the notice: "Keep the old colours" (§7.4) ---------------- */
    /* the colours of the retired themes these cases use, the five a theme of the reader's own keeps, as the table
       had them before the set changed: copied here rather than read from the app's own table */
    const GONE = {
      linen:  { bg: "#F3EFE6", panel: "#FAF8F1", ink: "#2B2A26", muted: "#625F57", accent: "#5A6828" },
      peach:  { bg: "#FBE7DA", panel: "#FDF1E8", ink: "#3B2A21", muted: "#72574A", accent: "#146C72" },
      candle: { bg: "#2A1D14", panel: "#33251A", ink: "#F0DDB4", muted: "#B8A485", accent: "#E9C46A" }
    };
    const FIVE = ["bg", "panel", "ink", "muted", "accent"], colsOf = (id) => FIVE.map((k) => GONE[id][k]).join(" ");
    /* waits for the notice (it comes about 800 ms after boot): true once it is there, false when it has not come in `ms` */
    const noticeUp = (page, ms) => page.waitForSelector("#themeToast", { timeout: ms || 4000 }).then(() => true, () => false);
    /* the notice: its role, its words, its two buttons (inside it), and the room it reports on the body
       (--noticeH) against its height; null when there is none */
    const notice = (page) => page.evaluate(() => {
      const n = document.getElementById("themeToast"), keep = document.getElementById("themeKeep"), no = document.getElementById("themeNo");
      return n ? { role: n.getAttribute("role"), text: (n.querySelector(".tn-msg") || {}).textContent, keep: keep && n.contains(keep) ? keep.textContent : null,
        no: no && n.contains(no) ? no.getAttribute("aria-label") : null, room: document.body.style.getPropertyValue("--noticeH"), h: n.offsetHeight } : null;
    });
    const room = (page) => page.evaluate(() => document.body.style.getPropertyValue("--noticeH"));
    /* the notice's shape: whether its words and buttons stay inside it, and its words clear its rounded corners (each
       corner of each line's box inside the curve, the radius as drawn, no more than half the box); how many rows (the
       buttons beside the words, or under them) and lines of words; whether its corners round its whole height (a
       pill); whether words on a row of their own keep 20px from both sides; whether the buttons sit at the right, Keep
       before the close button; whether the two share a row (their middles level) */
    const shape = (page) => page.evaluate(() => {
      const n = document.getElementById("themeToast"), b = n.getBoundingClientRect(), r = Math.min(parseFloat(getComputedStyle(n).borderTopLeftRadius), b.height / 2, b.width / 2);
      const curve = (x, y) => { const cx = Math.min(Math.max(x, b.left + r), b.right - r), cy = Math.min(Math.max(y, b.top + r), b.bottom - r); return Math.hypot(x - cx, y - cy) <= r + 0.5; };
      const within = (q) => q.left >= b.left - 0.5 && q.right <= b.right + 0.5 && q.top >= b.top - 0.5 && q.bottom <= b.bottom + 0.5;
      const range = document.createRange(); range.selectNodeContents(n.querySelector(".tn-msg"));
      const lines = [...range.getClientRects()], keep = document.getElementById("themeKeep").getBoundingClientRect(), no = document.getElementById("themeNo").getBoundingClientRect();
      const bottom = Math.max(...lines.map((q) => q.bottom)), left = Math.min(...lines.map((q) => q.left)), right = Math.max(...lines.map((q) => q.right));
      return { tone: document.documentElement.dataset.tone, coarse: matchMedia("(pointer: coarse)").matches, w: Math.round(b.width), h: Math.round(b.height), r, lines: new Set(lines.map((q) => Math.round(q.top))).size,
        inside: lines.concat([keep, no]).every(within), clear: lines.every((q) => [[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]].every(([x, y]) => curve(x, y))),
        overflow: n.scrollWidth > n.clientWidth, rows: keep.top >= bottom ? 2 : 1, pill: r >= b.height / 2 - 0.5,
        inset: Math.round(left - b.left) >= 20 && Math.round(b.right - right) >= 20, right: keep.right <= no.left + 0.5 && b.right - no.right <= 8.5 && (keep.top >= bottom || keep.left >= right),
        paired: Math.abs(keep.top + keep.bottom - no.top - no.bottom) < 2 };
    });
    /* nothing of the notice leaves it, and no line of its words runs into its rounded corners */
    const kept = (s) => s.inside && s.clear && !s.overflow;
    /* the reader's own themes, in order: their "c:" id, name, autoInk and five colours */
    const own = (page) => page.evaluate((five) => window.__ll.state.customs.map((c) => ({ k: "c:" + c.id, name: c.name, autoInk: c.autoInk,
      cols: five.map((x) => String(c[x]).toUpperCase()).join(" ") })), FIVE);
    const named = (list, name) => list.find((c) => c.name === name) || {};
    /* a profile stored and loaded, its clock held at `clock` when given, and the notice waited for */
    const withNotice = async (seed, opts, clock) => {
      const ctx = await context(b, opts, { ll_prefs: seed });
      const page = await open(ctx, url, clock);
      return { ctx, page, up: await noticeUp(page) };
    };
    const LINEN_PEACH = { auto: "off", theme: "linen", autoDay: "linen", autoNight: "peach" }, CANDLE = { auto: "off", theme: "candle", autoDay: "day", autoNight: "candle" };
    await guard("the notice, its words", async () => {
      let x = await withNotice(CANDLE);
      const one = await notice(x.page), was = await moved(x.page);
      R.check('candle seeded: notice "Themes have changed: Candle is now Cocoa." with Keep and No thanks', x.up && !!one && one.role === "status" &&
        one.text === "Themes have changed: Candle is now Cocoa." && one.keep === "Keep the old colours" && one.no === "No thanks", JSON.stringify(one));
      /* shown once: the note is cleared and saved the moment it shows, and the notice reports the room it takes */
      R.check("the notice clears themeWas as it shows, and reports its height and 8px as --noticeH", both(was, (s) => s.was === null) && !!one && one.room === (one.h + 8) + "px",
        JSON.stringify({ was, room: one && one.room, h: one && one.h }));
      await x.ctx.close();
      x = await withNotice(LINEN_PEACH);
      const two = await notice(x.page);
      R.check('linen/peach seeded (Auto off, theme linen): "Linen is now Day and Peach is now Sea air"', x.up && !!two && two.text === "Themes have changed: Linen is now Day and Peach is now Sea air.", JSON.stringify(two));
      await x.ctx.close();
      x = await withNotice({ auto: "off", theme: "peach", autoDay: "linen", autoNight: "peach" });
      const pp = await notice(x.page), ps = await st(x.page);
      R.check("theme peach over linen/peach: the same text, Sea air on screen", x.up && !!pp && pp.text === "Themes have changed: Linen is now Day and Peach is now Sea air." && ps.theme === "seaair",
        JSON.stringify({ pp, ps }));
      await x.ctx.close();
      /* the contrast fold replaced both retired halves: nothing the reader sees came from them, so the note is
         cleared at boot and nothing comes */
      const ctx = await context(b, null, { ll_prefs: { auto: "off", theme: "hicon", autoDay: "linen", autoNight: "plum" } });
      const page = await open(ctx, url);
      const hi = await moved(page), up = await noticeUp(page, 1600);
      R.check("hicon on screen with linen/plum: no notice, themeWas cleared", !up && both(hi, (s) => s.was === null && s.theme === "hicon" && s.autoDay === "hicon" && s.autoNight === "hidark"),
        JSON.stringify({ up, hi }));
      await ctx.close();
    });
    await guard("the notice, Keep", async () => {
      let x = await withNotice(LINEN_PEACH);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      let mine = await own(x.page), s = await st(x.page), t = await toastNow(x.page), left = await notice(x.page), saved = JSON.parse(await prefs(x.page));
      let L = named(mine, "Linen"), P = named(mine, "Peach");
      R.check('Keep: customs "Linen" and "Peach" with the retired colours (bg, ink, accent, panel, muted equal RETIRED); the pair is them; the half on screen is kept; toast',
        x.up && mine.length === 2 && L.cols === colsOf("linen") && P.cols === colsOf("peach") && L.autoInk === false && P.autoInk === false &&
        s.autoDay === L.k && s.autoNight === P.k && s.theme === L.k && saved.autoDay === L.k && saved.autoNight === P.k && saved.theme === L.k && saved.customs.length === 2 &&
        !!t && t.text === "Your old colours are back, under Mine." && left === null && (await room(x.page)) === "", JSON.stringify({ mine, s, t, left }));
      await x.ctx.close();
      /* the reader has gone to Night since the notice came: Keep leaves the night half on screen */
      x = await withNotice(LINEN_PEACH);
      await dayNight(x.page, "night"); await x.page.waitForTimeout(150);
      const night = await st(x.page);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      mine = await own(x.page); s = await st(x.page); P = named(mine, "Peach");
      const dn = await x.page.evaluate(() => window.llThemes.dnOf(window.__ll.state.theme));
      R.check("Keep after the reader tapped Night: the night half stays on screen", x.up && night.theme === "seaair" && mine.length === 2 && s.autoNight === P.k && s.theme === P.k && dn === "night",
        JSON.stringify({ night, mine, s, dn }));
      await x.ctx.close();
      /* On a schedule at noon, Night held on Cocoa, which Candle became: Keep puts the own Candle in the night half and on
         screen, and the hold carries over to it, its period and end unchanged; the automatic check keeps it there */
      x = await withNotice({ auto: "time", nightFrom: "21:00", nightTo: "07:00", theme: "candle", autoDay: "day", autoNight: "candle", dnHold: { theme: "candle", period: "day", until: AT_21 } }, null, NOON);
      const held = await st(x.page);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      await x.page.evaluate(() => window.__ll.AutoTheme.apply()); await x.page.waitForTimeout(100);
      mine = await own(x.page); s = await st(x.page);
      const C = named(mine, "Candle");
      R.check("Keep with Auto on (time, noon) and Night held on cocoa over day/cocoa (candle originally): own Candle on screen, still held",
        x.up && held.theme === "cocoa" && !!held.hold && held.hold.theme === "cocoa" && mine.length === 1 && C.cols === colsOf("candle") &&
        s.autoDay === "day" && s.autoNight === C.k && s.theme === C.k && !!s.hold && s.hold.theme === C.k && s.hold.period === "day" && s.hold.until === AT_21, JSON.stringify({ held, mine, s }));
      await x.ctx.close();
      /* the night theme changed in the list after the notice came: that half is left alone, and only Linen comes back */
      x = await withNotice({ auto: "off", theme: "linen", autoDay: "linen", autoNight: "candle" });
      const said = await notice(x.page);
      await x.page.evaluate(() => window.__ll.AutoTheme.setPair("night", "forest")); await x.page.waitForTimeout(150);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      mine = await own(x.page); s = await st(x.page); L = named(mine, "Linen");
      R.check("Keep when the reader changed the night theme to Forest since: Forest stays", x.up && !!said && said.text === "Themes have changed: Linen is now Day and Candle is now Cocoa." &&
        mine.length === 1 && L.cols === colsOf("linen") && s.autoDay === L.k && s.autoNight === "forest" && s.theme === L.k, JSON.stringify({ said, mine, s }));
      await x.ctx.close();
      /* everything it told of changed since (Cocoa, on screen, is now Forest): Keep only closes it, and makes and says nothing */
      x = await withNotice(CANDLE);
      await x.page.evaluate(() => window.__ll.AutoTheme.setPair("night", "forest")); await x.page.waitForTimeout(150);
      await x.page.evaluate(() => { window.__toasts = []; });
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      mine = await own(x.page); s = await st(x.page);
      const none = { left: await notice(x.page), room: await room(x.page), toasts: await toasts(x.page) };
      R.check("Keep when everything it told of has changed since: the notice goes, nothing is made, no toast", x.up && mine.length === 0 && s.theme === "forest" && s.autoNight === "forest" &&
        none.left === null && none.room === "" && none.toasts.length === 0, JSON.stringify({ mine, s, none }));
      await x.ctx.close();
    });
    await guard("the notice, Keep with the theme on screen", async () => {
      /* an earlier version's Day on screen over Linen/Dusk: Linen is listed (the day half), and comes back where it was */
      let x = await withNotice({ auto: "off", theme: "day", autoDay: "linen", autoNight: "dusk" });
      const d = await notice(x.page);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      let mine = await own(x.page), s = await st(x.page);
      const L = named(mine, "Linen");
      R.check("day on screen over linen/dusk (theme day): own Linen/Dusk with own Linen on screen", x.up && !!d && d.text === "Themes have changed: Linen is now Day." &&
        mine.length === 1 && s.autoDay === L.k && s.autoNight === "dusk" && s.theme === L.k, JSON.stringify({ d, mine, s }));
      await x.ctx.close();
      /* Peach on screen outside Linen/Dusk: both are listed; Peach, on screen, takes the day half ahead of Linen, so the
         reader keeps seeing it, and Linen waits under Mine */
      x = await withNotice({ auto: "off", theme: "peach", autoDay: "linen", autoNight: "dusk" });
      const p = await notice(x.page);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      mine = await own(x.page); s = await st(x.page);
      const PL = named(mine, "Linen"), PP = named(mine, "Peach");
      const tiles = await x.page.evaluate(() => [...document.querySelectorAll("#themeChips .q-mine .chip[data-theme]")].map((t) => t.dataset.theme + ":" + t.getAttribute("aria-pressed")));
      const set = await looksIn(x.page, "#themeChips");
      R.check("peach on screen outside linen/dusk (Auto off): own Peach/Dusk with own Peach on screen; own Linen made too, under Mine", x.up && !!p &&
        p.text === "Themes have changed: Linen is now Day and Peach is now Day." && mine.length === 2 && PL.cols === colsOf("linen") && PP.cols === colsOf("peach") &&
        s.autoDay === PP.k && s.autoNight === "dusk" && s.theme === PP.k && tiles.join() === PL.k + ":false," + PP.k + ":true" && pairFirst(set, "Peach & Dusk"),
        JSON.stringify({ p, mine, s, tiles, set: set.slice(0, 2) }));
      await x.ctx.close();
    });
    await guard("the notice, No thanks and never twice", async () => {
      const x = await withNotice(LINEN_PEACH);
      await x.page.click("#themeNo"); await x.page.waitForTimeout(150);
      const mine = await own(x.page), s = await st(x.page), left = await notice(x.page), r = await room(x.page);
      R.check("No thanks: no customs; theme stays day", x.up && mine.length === 0 && s.theme === "day" && s.autoDay === "day" && s.autoNight === "seaair" && left === null && r === "",
        JSON.stringify({ mine, s, left, r }));
      await x.ctx.close();
      /* answered either way, or shown and left unanswered: a reload brings no notice */
      const seen = {};
      for (const how of ["keep", "no", "unanswered"]){
        const y = await withNotice(LINEN_PEACH);
        if (how !== "unanswered"){ await y.page.click(how === "keep" ? "#themeKeep" : "#themeNo"); await y.page.waitForTimeout(150); }
        await y.page.reload({ waitUntil: "load" });
        seen[how] = { first: y.up, again: await noticeUp(y.page, 1600) };
        await y.ctx.close();
      }
      R.check("never twice: after Keep, after No thanks, or shown and the page reloaded, no #themeToast", Object.values(seen).every((v) => v.first && !v.again), JSON.stringify(seen));
    });
    await guard("the notice and the e-ink offer", async () => {
      /* a screen that says it redraws slowly is offered e-ink mode 600 ms after boot. No suite triggers that offer
         otherwise, so for the first boot only matchMedia answers yes to (update: slow) and passes every other query on */
      const ctx = await context(b, null, { ll_prefs: LINEN_PEACH });
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem("__slow")) return;
        sessionStorage.setItem("__slow", "1");
        const real = window.matchMedia.bind(window);
        window.matchMedia = (q) => /\(\s*update\s*:\s*slow\s*\)/.test(q) ? { matches: true, media: q, onchange: null, addListener(){}, removeListener(){},
          addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } } : real(q);
      });
      const page = await open(ctx, url);
      const offered = await page.waitForSelector("#einkToast", { timeout: 4000 }).then(() => true, () => false);
      await page.waitForTimeout(1000);
      const first = await page.evaluate(() => ({ eink: !!document.getElementById("einkToast"), notice: !!document.getElementById("themeToast"), was: window.__ll.state.themeWas,
        saved: JSON.parse(localStorage.getItem("ll_prefs")).themeWas }));
      await page.reload({ waitUntil: "load" });
      const again = await noticeUp(page), second = await page.evaluate(() => ({ eink: !!document.getElementById("einkToast"), text: (document.querySelector("#themeToast .tn-msg") || {}).textContent }));
      R.check("the e-ink offer up: no notice this boot; next boot it shows", offered && first.eink && !first.notice && !!first.was && !!first.saved && again && !second.eink &&
        second.text === "Themes have changed: Linen is now Day and Peach is now Sea air.", JSON.stringify({ offered, first, again, second }));
      await ctx.close();
      /* the other way round: the offer, asked for while the notice is up, shows nothing and is not marked asked; once
         the notice has gone it shows */
      const x = await withNotice(LINEN_PEACH);
      await x.page.evaluate(() => window.__ll.Eink.offer()); await x.page.waitForTimeout(150);
      const wait = await x.page.evaluate(() => ({ eink: !!document.getElementById("einkToast"), asked: window.__ll.state.einkAsked, saved: JSON.parse(localStorage.getItem("ll_prefs")).einkAsked }));
      await x.page.click("#themeNo"); await x.page.waitForTimeout(100);
      await x.page.evaluate(() => window.__ll.Eink.offer()); await x.page.waitForTimeout(150);
      const then = await x.page.evaluate(() => ({ eink: !!document.getElementById("einkToast"), asked: window.__ll.state.einkAsked }));
      R.check("the e-ink offer waits for the notice", x.up && !wait.eink && wait.asked === false && wait.saved === false && then.eink && then.asked === true, JSON.stringify({ wait, then }));
      await x.ctx.close();
    });
    await guard("the notice's place", async () => {
      const x = await withNotice(LINEN_PEACH);
      await x.page.evaluate(() => window.__ll.Marks.toast("x")); await x.page.waitForTimeout(150);
      const at = await x.page.evaluate(() => {
        const n = document.getElementById("themeToast"), t = document.getElementById("toast");
        /* the e-ink offer's own place, read off a stand-in with its id (the real one never shows beside the notice) */
        const probe = document.createElement("div"); probe.id = "einkToast"; document.body.appendChild(probe);
        const eink = getComputedStyle(probe).bottom; probe.remove();
        return { on: t.classList.contains("on"), toastBottom: t.getBoundingClientRect().bottom, noticeTop: n.getBoundingClientRect().top,
          bottom: getComputedStyle(n).bottom, eink, toast: getComputedStyle(t).bottom, room: document.body.style.getPropertyValue("--noticeH") };
      });
      R.check("a toast while the notice is up sits above it", x.up && at.on && at.toastBottom <= at.noticeTop, JSON.stringify(at));
      R.check("the notice keeps the bottom row", x.up && at.bottom === at.eink && parseFloat(at.toast) === parseFloat(at.bottom) + parseFloat(at.room), JSON.stringify(at));
      const desk = await shape(x.page);
      await x.ctx.close();
      /* its words are longer than the e-ink offer's: on a desktop the three parts share one row, the offer's pill; on a
         phone the words take a row of their own, with the two buttons together under them at the right. Either way
         nothing leaves the notice and no line of its words runs into its rounded corners, and on their own row the
         words keep 20px from both sides. Three changes in Dutch on a phone from 320 to 420px wide (where the lines
         break, and so how near the right edge one ends, moves with the width), and 320px in the contrast tone */
      const three = await withNotice({ auto: "off", theme: "peach", autoDay: "linen", autoNight: "candle" }, Object.assign({ locale: "nl-NL" }, PHONE));
      await three.page.evaluate(() => document.fonts.ready.then(() => true));
      const sweep = [];
      for (let w = 320; w <= 420; w += 2){
        await three.page.setViewportSize({ width: w, height: 844 });
        sweep.push(Object.assign({ at: w }, await shape(three.page)));
      }
      await three.ctx.close();
      const narrow = await withNotice({ auto: "off", theme: "hicon", autoDay: "hicon", autoNight: "plum" }, Object.assign({ locale: "nl-NL" }, PHONE, { viewport: { width: 320, height: 700 } }));
      const nl320 = await shape(narrow.page);
      await narrow.ctx.close();
      const phone = (s) => kept(s) && s.rows === 2 && s.inset && s.right && s.paired;
      const bad = sweep.filter((s) => !phone(s) || s.lines < 2);
      R.check("the notice on a desktop: one row, words then Keep then the close button, a pill", x.up && kept(desk) && desk.rows === 1 && desk.right && desk.paired && desk.pill, JSON.stringify(desk));
      R.check("the notice on a phone: the words on a row of their own, 20px in, the buttons under them at the right, nothing cut",
        three.up && narrow.up && sweep.length === 51 && !bad.length && phone(nl320) && nl320.tone === "contrast", JSON.stringify({ bad: bad.slice(0, 3), nl320 }));
    });
    await guard("the notice's shape, taller and narrower", async () => {
      /* one row is the offer's pill whatever its height: taller than the light tone's 48px in the contrast tone (2px
         borders), with a coarse pointer on a wide screen (40px buttons), and with both */
      const CONTRAST = { auto: "off", theme: "hicon", autoDay: "hicon", autoNight: "plum" }, TABLET = Object.assign({}, PHONE, { viewport: { width: 1024, height: 768 } });
      const tall = [];
      for (const [seed, opts] of [[CONTRAST, null], [LINEN_PEACH, TABLET], [CONTRAST, TABLET]]){
        const y = await withNotice(seed, opts);
        tall.push(Object.assign({ up: y.up }, await shape(y.page)));
        await y.ctx.close();
      }
      R.check("the notice on one row is a pill in the contrast tone, with a coarse pointer, and with both",
        tall.every((s) => s.up && kept(s) && s.rows === 1 && s.right && s.paired && s.pill && s.h > 48) &&
        tall.map((s) => s.tone === "contrast").join() === "true,false,true" && tall.map((s) => s.coarse).join() === "false,true,true", JSON.stringify(tall));
      /* a desktop window narrowed: the three parts keep one row while they fit, and below that the words take a row of
         their own with both buttons under them, never Keep beside the words with the close button alone under it.
         In 2px steps from 80px under the width one row needs to 20px over it, in English and in Dutch, with one change
         and with two; the sweep must see both layouts */
      const narrowed = {};
      for (const [name, seed, opts] of [["en, one", CANDLE, null], ["en, two", LINEN_PEACH, null], ["nl, one", CANDLE, { locale: "nl-NL" }], ["nl, two", LINEN_PEACH, { locale: "nl-NL" }]]){
        const y = await withNotice(seed, opts);
        await y.page.evaluate(() => document.fonts.ready.then(() => true));
        const one = (await shape(y.page)).w + 32, seen = [];
        for (let w = one - 80; w <= one + 20; w += 2){
          await y.page.setViewportSize({ width: w, height: 800 });
          seen.push(Object.assign({ at: w }, await shape(y.page)));
        }
        narrowed[name] = { up: y.up, one, seen };
        await y.ctx.close();
      }
      const together = (s) => kept(s) && s.right && s.paired && (s.rows === 1 || s.inset);
      const split = Object.entries(narrowed).flatMap(([name, n]) => n.seen.filter((s) => !together(s)).map((s) => Object.assign({ name }, s)));
      const sawBoth = Object.values(narrowed).every((n) => n.up && n.seen.length === 51 && n.seen.some((s) => s.rows === 1) && n.seen.some((s) => s.rows === 2));
      R.check("a narrowed desktop window: one row while it fits, then the words on a row of their own with Keep and the close button together under them",
        sawBoth && !split.length, JSON.stringify({ split: split.slice(0, 3), one: Object.fromEntries(Object.entries(narrowed).map(([k, n]) => [k, n.one])) }));
    });
    await guard("the notice, a name taken, e-ink and Dutch", async () => {
      let x = await withNotice(Object.assign({ customs: [{ id: "k1", name: "Candle", bg: "#3A2A1A", ink: "#F2E6D0", autoInk: false, accent: "#E0A040" }] }, CANDLE));
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      let mine = await own(x.page), s = await st(x.page);
      R.check('"Candle" taken: Keep makes "Candle 2"', x.up && mine.map((c) => c.name).join() === "Candle,Candle 2" && named(mine, "Candle 2").cols === colsOf("candle") &&
        s.autoNight === named(mine, "Candle 2").k && s.theme === s.autoNight, JSON.stringify({ mine, s }));
      await x.ctx.close();
      /* Review Focus 4: e-ink mode on, with a retired theme saved. The pill is white there, and so its two buttons
         are black: Keep filled, and the close button's cross */
      x = await withNotice(Object.assign({ eink: true }, CANDLE));
      const e = await notice(x.page);
      const ink = await x.page.evaluate(() => { const c = (sel, k) => getComputedStyle(document.querySelector(sel))[k];
        return { pill: c("#themeToast", "backgroundColor"), keep: c("#themeKeep", "backgroundColor") + " / " + c("#themeKeep", "color"), no: c("#themeNo", "color"), cross: c("#themeNo svg", "stroke") }; });
      R.check("e-ink on: the notice is white, Keep black, and the close button's cross black", ink.pill === "rgb(255, 255, 255)" && ink.keep === "rgb(0, 0, 0) / rgb(255, 255, 255)" &&
        ink.no === "rgb(0, 0, 0)" && ink.cross === "rgb(0, 0, 0)", JSON.stringify(ink));
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      mine = await own(x.page); s = await st(x.page);
      const page = await x.page.evaluate(() => { const cs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body);
        return { eink: window.__ll.state.eink, cls: document.body.classList.contains("eink"), bg: cs.getPropertyValue("--bg").trim().toUpperCase(), ink: cs.getPropertyValue("--ink").trim().toUpperCase(),
          body: bs.backgroundColor + " / " + bs.color }; });
      R.check("e-ink on: notice shows, Keep restores, e-ink stays on, page #FFFFFF/#000000", x.up && !!e && e.text === "Themes have changed: Candle is now Cocoa." && mine.length === 1 &&
        named(mine, "Candle").cols === colsOf("candle") && s.theme === named(mine, "Candle").k && s.autoNight === s.theme && page.eink === true && page.cls &&
        page.bg === "#FFFFFF" && page.ink === "#000000" && page.body === "rgb(255, 255, 255) / rgb(0, 0, 0)", JSON.stringify({ e, mine, s, page }));
      await x.ctx.close();
      x = await withNotice(CANDLE, { locale: "nl-NL" });
      const nl = await notice(x.page);
      await x.page.click("#themeKeep"); await x.page.waitForTimeout(150);
      mine = await own(x.page);
      const t = await toastNow(x.page);
      R.check('Dutch: "De thema’s zijn veranderd: Kaars is nu Cacao."', x.up && !!nl && nl.text === "De thema’s zijn veranderd: Kaars is nu Cacao." && nl.keep === "Oude kleuren houden" &&
        nl.no === "Nee, bedankt" && mine.map((c) => c.name).join() === "Kaars" && !!t && t.text === "Je oude kleuren zijn terug, onder Mijn thema’s.", JSON.stringify({ nl, mine, t }));
      await x.ctx.close();
    });
    await guard("the notice and speed reading", async () => {
      /* speed reading covers the page and makes the rest of it inert, the small toast aside. The notice sits above it,
         on a phone over its progress bar and Play button, where it could not be used and a tap on it would reach the
         control under it: it waits out of sight, unanswered, and takes no room until speed reading closes. So do the
         update offer (the real one, which reports its height too) and the e-ink offer (a stand-in with its id, as the
         real one never shows beside the notice) */
      const ctx = await context(b, PHONE, { ll_prefs: LINEN_PEACH, ll_tips: "seen", ll_tip_doc: "1" });
      const page = await open(ctx, url);
      const up = await noticeUp(page);
      await openFixture(page, "sample.txt");
      await page.evaluate(() => window.__ll.Updates.offer()); await page.waitForTimeout(100);
      /* whether the notice and the two offers show, whether the notice is inert, and the room the notice and the
         update offer report on the body against their heights */
      const seen = () => page.evaluate(() => {
        const shown = (n) => !!n && n.getClientRects().length > 0, n = document.getElementById("themeToast"), u = document.getElementById("updateToast");
        const probe = document.createElement("div"); probe.id = "einkToast"; document.body.appendChild(probe);
        const eink = shown(probe); probe.remove();
        return { rsvp: window.llRsvp.isOpen(), notice: shown(n), update: shown(u), eink, inert: !!n && n.inert,
          noticeH: document.body.style.getPropertyValue("--noticeH"), h: n ? n.offsetHeight : null, updateH: document.body.style.getPropertyValue("--updateH"), uh: u ? u.offsetHeight : null };
      });
      const before = await seen();
      await page.evaluate(() => window.llRsvp.open()); await page.waitForTimeout(150);
      const during = await seen();
      await page.evaluate(() => window.llRsvp.close()); await page.waitForTimeout(150);
      const after = await seen();
      await page.click("#themeKeep"); await page.waitForTimeout(150);
      const mine = (await own(page)).map((c) => c.name);
      await ctx.close();
      const all = (x) => !x.rsvp && x.notice && x.update && x.eink && !x.inert && x.noticeH === (x.h + 8) + "px" && x.updateH === (x.uh + 8) + "px";
      R.check("speed reading hides the notice and the two offers, and their room, until it closes; the notice comes back unanswered, and Keep works",
        up && all(before) && during.rsvp && !during.notice && !during.update && !during.eink && during.noticeH === "" && during.updateH === "" && all(after) && mine.join() === "Linen,Peach",
        JSON.stringify({ before, during, after, mine }));
    });

    /* ---------------- the colours (§3.1), and no textures (§8) ---------------- */
    await guard("colours", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      const wrong = [], textured = [];
      for (const [id, want] of Object.entries(TABLE)){
        await page.evaluate((k) => window.llThemes.pick(k), id);
        await page.waitForFunction((k) => window.__ll.state.theme === k, id, { timeout: 2000 }).catch(() => {});
        const got = await page.evaluate(() => {
          const cs = getComputedStyle(document.documentElement);
          return { theme: window.__ll.state.theme, texture: document.documentElement.getAttribute("data-texture"),
            tokens: Object.fromEntries(["bg", "ink", "muted", "panel", "line", "accent", "lamp", "raise"].map((k) => [k, cs.getPropertyValue("--" + k).trim().toUpperCase()])) };
        });
        const off = COLS.filter((k) => got.tokens[k] !== want[k]);
        if (got.theme !== id || off.length) wrong.push(id + (got.theme !== id ? " (on screen: " + got.theme + ")" : "") + (off.length ? ": " + off.map((k) => k + " " + got.tokens[k] + " not " + want[k]).join(", ") : ""));
        if (got.texture !== null) textured.push(id + ":" + got.texture);
      }
      R.check("every built-in applies its tokens", Object.keys(TABLE).length === 12 && wrong.length === 0, wrong.join(" | "));
      /* nothing left of the textures: no attribute on the page, no rule that would draw one, and no Plain background switch */
      const left = await page.evaluate(() => {
        const walk = (rules) => [...rules].flatMap((r) => [r].concat(r.cssRules ? walk(r.cssRules) : []));
        const rules = [...document.styleSheets].flatMap((s) => { try { return walk(s.cssRules); } catch (_){ return []; } });
        return { rules: rules.filter((r) => /data-texture/.test(r.selectorText || "")).map((r) => r.selectorText).slice(0, 3), plainBg: !!document.getElementById("plainBg") };
      });
      R.check("no data-texture, no #plainBg", !textured.length && !left.rules.length && !left.plainBg, JSON.stringify({ textured, left }));
      await ctx.close();
      /* §7.6: the Plain background switch's stored value is no longer read, and the next save leaves it out */
      const ctx2 = await context(b, null, { ll_prefs: { auto: "off", plainBg: true } });
      const page2 = await open(ctx2, url);
      await page2.evaluate(() => window.llThemes.pick("paper")); await page2.waitForTimeout(100);
      const pb = await page2.evaluate(() => ({ state: "plainBg" in window.__ll.state, saved: "plainBg" in JSON.parse(localStorage.getItem("ll_prefs") || "{}"), theme: window.__ll.state.theme }));
      R.check("a stored plainBg is not read, and not saved again", !pb.state && !pb.saved && pb.theme === "paper", JSON.stringify(pb));
      await ctx2.close();
    });

    /* ---------------- outside the table (§9.1-9.3, Appendix A) ---------------- */
    /* spec §9.2: the editors' page row is the day pages of every look but Contrast and a lavender, then the
       same looks' night pages and a violet; the accent row keeps its eight, Canals' coral and Forest's green
       in place of the two it had; the Maker's text row is seven of the set's text colours, and white */
    const SW_BG = ["day", "paper", "sepia", "sage", "seaair"].map((id) => TABLE[id].bg).concat("#EDE7F3", ["dusk", "ink", "cocoa", "forest", "canals"].map((id) => TABLE[id].bg), "#171021");
    const SW_ACC = ["#D8A24A", "#E58E6C", "#C25B78", "#A97FD6", "#5C9CD6", "#3FA08C", "#7AB785", "#C9A227"];
    const SW_INK = ["paper", "day", "sepia", "seaair", "ink", "cocoa", "canals"].map((id) => TABLE[id].ink).concat("#FFFFFF");
    await guard("outside the table, first paint and the swatches", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      /* app.css's own :root rule, which the first paint (and a Lighthouse run) uses until applyTheme sets the theme
         on the element; and a page whose script never runs, which paints with it alone */
      const first = await page.evaluate(() => {
        const sheet = [...document.styleSheets].find((s) => /\/app\.css(\?|$)/.test(s.href || ""));
        const rule = sheet && [...sheet.cssRules].find((r) => r.selectorText === ":root");
        return rule ? Object.fromEntries(["bg", "panel", "raise", "ink", "muted", "line", "accent", "lamp"].map((k) => [k, rule.style.getPropertyValue("--" + k).trim().toUpperCase()])) : null;
      });
      const bare = await b.newContext({ javaScriptEnabled: false });
      const still = await bare.newPage();
      await still.goto(url, { waitUntil: "load" });
      const paint = await still.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color }));
      await bare.close();
      const rgbOf = (hex) => "rgb(" + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ") + ")";
      R.check("first paint: :root defaults are the new Day", !!first && COLS.every((k) => first[k] === TABLE.day[k]) && paint.bg === rgbOf(TABLE.day.bg) && paint.ink === rgbOf(TABLE.day.ink),
        JSON.stringify({ first, paint }));
      const sw = await page.evaluate(() => Object.fromEntries(["bgSwatches", "accSwatches"].map((id) => [id, [...document.querySelectorAll("#" + id + " .sw")].map((s) => s.dataset.c.toUpperCase())])));
      R.check("the editor's swatches are spec §9.2's", sw.bgSwatches.join() === SW_BG.join() && sw.accSwatches.join() === SW_ACC.join(), JSON.stringify(sw));
      await page.evaluate(() => window.llThemes.maker.open({ from: "day" })); await page.waitForTimeout(200);
      const mk = await page.evaluate(() => Object.fromEntries(["bg", "ink", "acc"].map((k) => [k, [...document.querySelectorAll('.mk-sw[data-k="' + k + '"] .sw')].map((s) => s.dataset.c.toUpperCase())])));
      R.check("the Maker's swatches are spec §9.2's: the editor's page and accent rows, and its own text row", mk.bg.join() === SW_BG.join() && mk.acc.join() === SW_ACC.join() && mk.ink.join() === SW_INK.join(), JSON.stringify(mk));
      await ctx.close();
    });
    await guard("outside the table, the title bar's colour", async () => {
      /* the files as served: once the app runs, themeColor() rewrites the meta to the panel or the page on screen */
      const html = await (await fetch(url + "index.html")).text();
      const meta = (/<meta name="theme-color" content="([^"]*)"/.exec(html) || [])[1];
      const man = JSON.parse(await (await fetch(url + "manifest.webmanifest")).text());
      R.check("meta theme-color in the markup is #0D121C; the manifest's two colours are #0D121C", TABLE.dusk.bg === "#0D121C" &&
        meta === TABLE.dusk.bg && man.background_color === TABLE.dusk.bg && man.theme_color === TABLE.dusk.bg, JSON.stringify({ meta, background: man.background_color, theme: man.theme_color }));
    });
    await guard("outside the table, the contrast tone", async () => {
      /* a phone with a book open in Contrast: the lamp at the foot with its ring, and the dock under it */
      const ctx = await context(b, PHONE, { ll_prefs: { auto: "off", theme: "hicon", autoDay: "hicon", autoNight: "hidark" }, ll_tips: "seen", ll_tip_doc: "1" });
      const page = await open(ctx, url);
      await openFixture(page, "sample.md");
      const ring = await page.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
        return { tone: document.documentElement.dataset.tone, phone: document.body.classList.contains("phonebar"), btn: box(document.getElementById("dockBtn")), ring: box(document.querySelector("#dockBtn > .ring")) };
      });
      const near = (x, y) => Math.abs(x - y) < 0.05;
      R.check("contrast tone: the ring is 68 × 68, its left and top 6px outside the lamp button's", ring.tone === "contrast" && ring.phone &&
        near(ring.ring.width, 68) && near(ring.ring.height, 68) && near(ring.ring.left, ring.btn.left - 6) && near(ring.ring.top, ring.btn.top - 6), JSON.stringify(ring));
      /* Chromium computes no style for a slider's pseudo-elements, so the rules themselves are looked up (Chromium
         writes the attribute selector with quotes): the track's, and the dock's handle with and without keyboard
         focus. --track, the colour of the part not yet filled, does compute, and the tone makes it transparent on
         every slider, the dock's included */
      const track = await page.evaluate(() => {
        const walk = (rules) => [...rules].flatMap((r) => [r].concat(r.cssRules ? walk(r.cssRules) : []));
        const rules = [...document.styleSheets].flatMap((s) => { try { return walk(s.cssRules); } catch (_){ return []; } });
        const rule = rules.find((r) => (r.selectorText || "").includes(':root[data-tone="contrast"] input[type="range"]::-webkit-slider-runnable-track'));
        const handle = (state) => { const r = rules.find((x) => x.selectorText === ':root[data-tone="contrast"] #dockPos' + state + "::-webkit-slider-thumb"); return r ? { size: r.style.width + " " + r.style.height, shadow: r.style.boxShadow } : null; };
        const tr = (id) => getComputedStyle(document.getElementById(id)).getPropertyValue("--track").trim();
        return { sel: rule ? rule.selectorText : null, border: rule ? rule.style.border : null, height: rule ? rule.style.height : null, padding: rule ? rule.style.padding : null, dock: tr("dockPos"), warmth: tr("qWarm"),
          handle: handle(""), focus: handle(":focus-visible") };
      });
      R.check("contrast tone: the range track rule is in place", track.border === "2px solid var(--edge)" && track.height === "14px" && track.padding === "2px" &&
        !!track.sel && track.sel.includes("#dockPos::-webkit-slider-runnable-track") && track.dock === "transparent" && track.warmth === "transparent", JSON.stringify(track));
      R.check("contrast tone: the dock's handle is 24px in a 2px ring of the panel, with the accent's focus ring outside that", !!track.handle && track.handle.size === "24px 24px" &&
        track.handle.shadow === "0 0 0 2px var(--panel)" && !!track.focus && track.focus.shadow === "0 0 0 2px var(--panel), 0 0 0 4px var(--accent)", JSON.stringify({ handle: track.handle, focus: track.focus }));
      /* the dock's Day and Night: no well round them, each its own outline in the line colour, the half on screen's in the accent */
      const dn = await page.evaluate(() => {
        const col = (v) => { const p = document.createElement("i"); p.style.color = v; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
        const well = getComputedStyle(document.querySelector("#phoneDock .pd-dn")), cs = (id) => getComputedStyle(document.getElementById(id));
        return { well: [well.borderTopWidth, well.paddingTop, well.columnGap].join(" "), day: document.getElementById("dockDay").getAttribute("aria-pressed"),
          on: cs("dockDay").borderTopColor, off: cs("dockNight").borderTopColor, width: cs("dockNight").borderTopWidth, accent: col("var(--accent)"), line: col("var(--line)") };
      });
      R.check("contrast tone: the dock's Day and Night are two outlined buttons, the half on screen in the accent", dn.well === "0px 0px 8px" && dn.day === "true" &&
        dn.on === dn.accent && dn.off === dn.line && dn.on !== dn.off && dn.width === "2px", JSON.stringify(dn));
      /* the lamp's keyboard focus ring, the accent 2px off the button in the other tones: here the ring, in the same
         colour, covers that place, so the focus ring is drawn outside the ring's outer edge (the circle's radius and
         half its stroke, in the viewBox's units scaled to the SVG's size), 2px clear of it, and still on screen */
      await page.keyboard.press("Shift");
      await page.focus("#dockBtn");
      const lamp = await page.evaluate(() => {
        const btn = document.getElementById("dockBtn"), svg = btn.querySelector(".ring"), c = svg.querySelector("circle"), cs = getComputedStyle(btn), b = btn.getBoundingClientRect();
        const ring = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width * (c.r.baseVal.value + parseFloat(getComputedStyle(c).strokeWidth) / 2);
        const from = b.width / 2 + parseFloat(cs.outlineOffset), to = from + parseFloat(cs.outlineWidth), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        return { focusVisible: btn.matches(":focus-visible"), outline: [cs.outlineStyle, cs.outlineWidth, cs.outlineOffset].join(" "), ring: +ring.toFixed(2), from, to,
          onScreen: cx - to >= 0 && cy - to >= 0 && cx + to <= innerWidth && cy + to <= innerHeight };
      });
      R.check("contrast tone: the lamp's focus ring is drawn outside its progress ring, 2px clear of it, and on screen", lamp.focusVisible && /^solid /.test(lamp.outline) &&
        lamp.to - lamp.from >= 2 && lamp.from - lamp.ring >= 2 && lamp.onScreen, JSON.stringify(lamp));
      await ctx.close();
    });
    await guard("outside the table, the dock's handle and the keyboard", async () => {
      /* the dock's place slider takes keys (an arrow moves a page), so its handle shows a focus ring on every page.
         Three pictures of the slider's box: with the focus on the dock itself; just after the keyboard focuses the
         slider, with the page's animations held still; and once they have run. The focus ring is what the last adds
         to the first. With reduced motion (this context's) and in e-ink nothing fades, so the ring is in the held
         picture already and the last adds nothing to it; e-ink is checked with motion allowed, on its own rule */
      const ctx = await context(b, PHONE, { ll_prefs: { auto: "off" }, ll_tips: "seen", ll_tip_doc: "1" });
      const page = await open(ctx, url);
      const cdp = await ctx.newCDPSession(page);
      await openFixture(page, "sample.md");
      await page.tap("#dockBtn"); await page.waitForTimeout(250);
      const seen = {};
      const focusHandle = async (key) => {
        const box = await page.evaluate(() => { const r = document.getElementById("dockPos").getBoundingClientRect(); return { x: r.left - 8, y: r.top, width: r.width + 16, height: r.height }; });
        const before = await page.screenshot({ clip: box });
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
        await page.keyboard.press("Shift"); await page.focus("#dockPos"); await page.waitForTimeout(100);
        const held = await page.screenshot({ clip: box });
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
        await page.waitForTimeout(400);
        const after = await page.screenshot({ clip: box });
        const at = await page.evaluate(() => ({ tone: document.documentElement.dataset.tone, eink: document.body.classList.contains("eink"), open: document.body.classList.contains("dock-open"),
          focusVisible: document.getElementById("dockPos").matches(":focus-visible") }));
        seen[key] = Object.assign(at, { changed: await changedPixels(page, before, after), late: await changedPixels(page, held, after) });
      };
      for (const id of ["day", "dusk", "hicon"]){
        await page.evaluate((k) => { window.llThemes.pick(k); document.getElementById("phoneDock").focus(); }, id);
        await page.waitForTimeout(150);
        await focusHandle(id);
      }
      await page.evaluate(() => { window.llThemes.pick("day"); document.getElementById("phoneDock").focus(); });
      await page.waitForTimeout(150);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() => { window.__ll.Eink.set(true); document.getElementById("phoneDock").focus(); });
      await page.waitForTimeout(300);
      await focusHandle("eink");
      const tones = [seen.day, seen.dusk, seen.hicon];
      /* the ring changes about 270 to 360 pixels here, by tone; without one nothing changes */
      R.check("the dock's handle shows a focus ring from the keyboard in the light, dark and contrast tones", seen.day.tone === "light" && seen.dusk.tone === "dark" && seen.hicon.tone === "contrast" &&
        tones.every((s) => s.open && s.focusVisible && s.changed >= 100), JSON.stringify(seen));
      /* a ring that fades in is missing from the held picture: the last adds about 250 to 360 pixels to it */
      R.check("with reduced motion, and in e-ink with motion allowed, the handle's focus ring shows at once: nothing fades in", seen.eink.eink && seen.eink.open && seen.eink.focusVisible &&
        Object.values(seen).every((s) => s.late === 0), JSON.stringify(seen));
      /* Chromium computes no style for the handle, so its rule for the light and dark tones is looked up (the
         contrast tone's own two are checked above): the accent, outside a 2px ring of the panel, as wide as the
         focus ring everywhere (--ring: 2px, 3px on a dark page) */
      const shadow = await page.evaluate(() => {
        const walk = (rules) => [...rules].flatMap((r) => [r].concat(r.cssRules ? walk(r.cssRules) : []));
        const rule = [...document.styleSheets].flatMap((s) => { try { return walk(s.cssRules); } catch (_){ return []; } })
          .find((r) => r.selectorText === "#dockPos:focus-visible::-webkit-slider-thumb");
        return rule ? rule.style.boxShadow : null;
      });
      R.check("light and dark tones: the handle's focus ring is the accent, 2px clear of the handle and as wide as the focus ring",
        shadow === "0 0 0 2px var(--panel), 0 0 0 calc(2px + var(--ring)) var(--accent)", shadow);
      await ctx.close();
    });
    await guard("outside the table, a slider's focus under forced colours", async () => {
      /* forced colours draws no box-shadow, so no handle shows its ring there: a slider the keyboard focuses is
         outlined in the system's Highlight instead, 2px off it and 2px wide (the dock's, in each tone) */
      const ctx = await context(b, Object.assign({ forcedColors: "active" }, PHONE), { ll_prefs: { auto: "off" }, ll_tips: "seen", ll_tip_doc: "1" });
      const page = await open(ctx, url);
      await openFixture(page, "sample.md");
      await page.tap("#dockBtn"); await page.waitForTimeout(250);
      const seen = {};
      for (const id of ["day", "dusk", "hicon"]){
        await page.evaluate((k) => { window.llThemes.pick(k); document.getElementById("phoneDock").focus(); }, id);
        await page.waitForTimeout(150);
        const box = await page.evaluate(() => { const r = document.getElementById("dockPos").getBoundingClientRect(); return { x: r.left - 8, y: r.top - 4, width: r.width + 16, height: r.height + 8 }; });
        const before = await page.screenshot({ clip: box });
        await page.keyboard.press("Shift"); await page.focus("#dockPos"); await page.waitForTimeout(100);
        const after = await page.screenshot({ clip: box });
        const at = await page.evaluate(() => {
          const el = document.getElementById("dockPos"), cs = getComputedStyle(el), probe = document.createElement("i");
          probe.style.color = "Highlight"; document.body.appendChild(probe);
          const hl = getComputedStyle(probe).color; probe.remove();
          return { forced: matchMedia("(forced-colors: active)").matches, tone: document.documentElement.dataset.tone, open: document.body.classList.contains("dock-open"),
            focusVisible: el.matches(":focus-visible"), outline: [cs.outlineStyle, cs.outlineWidth, cs.outlineOffset].join(" "), highlight: cs.outlineColor === hl };
        });
        seen[id] = Object.assign(at, { changed: await changedPixels(page, before, after) });
      }
      /* the outline changes about 1,600 pixels here; without it nothing changes */
      R.check("forced colours: a slider the keyboard focuses is outlined in Highlight, 2px off it and 2px wide, in the light, dark and contrast tones",
        seen.day.tone === "light" && seen.dusk.tone === "dark" && seen.hicon.tone === "contrast" &&
        Object.values(seen).every((s) => s.forced && s.open && s.focusVisible && s.outline === "solid 2px 2px" && s.highlight && s.changed >= 100), JSON.stringify(seen));
      await ctx.close();
    });
    await guard("outside the table, the dark tone", async () => {
      const ctx = await context(b, null, { ll_prefs: { auto: "off" } });
      const page = await open(ctx, url);
      /* a yellow highlight in the text, and for each theme its computed fill, the dock's unfilled track resolved to a colour, the line and the edge */
      await page.evaluate(() => { const m = document.createElement("mark"); m.className = "ll-mark"; m.dataset.color = "sun"; m.id = "sunProbe"; m.textContent = "lamp"; document.getElementById("doc").appendChild(m); });
      const read = (id) => page.evaluate((k) => {
        window.llThemes.pick(k);
        const probe = document.createElement("i"); document.body.appendChild(probe);
        const col = (v) => { probe.style.color = ""; probe.style.color = v; return getComputedStyle(probe).color; };
        const out = { theme: window.__ll.state.theme, tone: document.documentElement.dataset.tone, sun: getComputedStyle(document.getElementById("sunProbe")).backgroundColor,
          track: col(getComputedStyle(document.getElementById("dockPos")).getPropertyValue("--track").trim()), line: col("var(--line)"), edge: col("var(--edge)") };
        probe.remove();
        return out;
      }, id);
      const dusk = await read("dusk"), day = await read("day"), hidark = await read("hidark");
      const sun = (r) => { const c = parseColor(r.sun); return c ? c.rgb.map(Math.round).join() + "/" + c.a.toFixed(2) : r.sun; };
      const yellow = "232,197,71";
      R.check("dark tone: the sun mark is 38%; light tone and Contrast dark 42%", dusk.tone === "dark" && day.tone === "light" && hidark.tone === "contrast" &&
        sun(dusk) === yellow + "/0.38" && sun(day) === yellow + "/0.42" && sun(hidark) === yellow + "/0.42", JSON.stringify({ dusk: [dusk.theme, dusk.tone, sun(dusk)], day: [day.theme, day.tone, sun(day)], hidark: [hidark.theme, hidark.tone, sun(hidark)] }));
      /* 35% of the edge into the line, mixed in sRGB, as every other slider's track; a light page keeps the line alone */
      const rgb = (c) => (parseColor(c) || { rgb: [NaN, NaN, NaN] }).rgb;
      const mixOk = (r) => { const t = rgb(r.track), l = rgb(r.line), e = rgb(r.edge); return t.every((v, i) => Math.abs(v - (0.35 * e[i] + 0.65 * l[i])) < 0.6); };
      const lineOk = (r) => { const t = rgb(r.track), l = rgb(r.line); return t.every((v, i) => Math.abs(v - l[i]) < 0.6); };
      R.check("dark tone: #dockPos --track is the edge-line mix", mixOk(dusk) && lineOk(day), JSON.stringify({ dusk: [dusk.track, dusk.line, dusk.edge], day: [day.track, day.line] }));
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
