/* Day and night: one setter for the dock switch, the t key and the lamp hold. It goes to the
   reader's day or night theme, never rewrites that pair (even while Day and night switching is
   on), writes no list of recent themes, and keeps high-contrast readers in high contrast. The
   Day theme and Night theme lists keep the pair two themes. With switching on, a switch holds
   until the next automatic change and survives a restart; a change of mode or of the night hours
   ends it, and any other choice carries it over to the theme it puts in the held half. The pair
   is shown, and marked, whether switching is on or off.
     NODE_PATH=$(npm root -g) node tests/daynight.js */
const { serve, browser, newPage, makeReport } = require("./lib");

const st = (page) => page.evaluate(() => { const s = window.__ll.state; return { theme: s.theme, autoDay: s.autoDay, autoNight: s.autoNight, auto: s.auto }; });
const theme = async (page) => (await st(page)).theme;
const prefs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("ll_prefs") || "{}"));
const recent = (page) => page.evaluate(() => localStorage.getItem("ll_theme_recent"));
const select = (page, id) => page.evaluate((k) => window.llThemes.select(k), id);
const setPair = (page, which, id) => page.evaluate(([w, k]) => window.__ll.AutoTheme.setPair(w, k), [which, id]);
const setMode = (page, m) => page.evaluate((x) => window.__ll.AutoTheme.setMode(x), m);
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(80); };
async function watchToasts(page){
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver((muts) => muts.forEach((m) => { const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (t && t.id === "toast" && t.textContent) window.__toasts.push(t.textContent); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
const toasts = (page, re) => page.evaluate((src) => window.__toasts.filter((t) => new RegExp(src).test(t)), re.source);

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();

  /* ---------- desktop, the clock held at noon ---------- */
  /* reduced motion: theme changes apply at once (no view-transition cross-fade to wait for) */
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
  let page = await ctx.newPage();
  page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
  await page.clock.install({ time: new Date(2026, 9, 8, 12, 0, 0) });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await watchToasts(page);

  /* 1. t between the day and the night theme */
  await select(page, "day");
  await press(page, "t"); const a = await theme(page);
  await press(page, "t"); const a2 = await theme(page);
  R.check("t: day → dusk → day", a === "dusk" && a2 === "day", a + " " + a2);

  /* 2. with switching on, t never rewrites the pair. The bug: at noon the first t wrote the night
     theme into the day slot (sepia/ember became ember/ember), the second fell back to Day, and
     Sepia was gone. (With the default day/dusk pair the second press happens to repair it.) */
  await page.evaluate(() => { const s = window.__ll.state; s.nightFrom = "21:00"; s.nightTo = "07:00"; });
  await setPair(page, "day", "sepia"); await setPair(page, "night", "ember");
  await setMode(page, "time");
  const t0 = await theme(page);
  await press(page, "t"); const t1 = await theme(page); await press(page, "t"); const t2 = await theme(page);
  const p = await prefs(page);
  R.check("Auto on schedule: two t presses keep the pair (sepia/ember)", p.autoDay === "sepia" && p.autoNight === "ember", p.autoDay + "/" + p.autoNight);
  R.check("Auto on schedule: t goes sepia → ember → sepia", t0 === "sepia" && t1 === "ember" && t2 === "sepia", [t0, t1, t2].join(" "));
  await setMode(page, "off");
  await setPair(page, "day", "day"); await setPair(page, "night", "dusk");
  await select(page, "day");

  /* 3. no list of recent themes (the picker's Recent row is gone, and boot removes the key), and a
     toast that says where t went */
  await press(page, "t");
  R.check("t writes no ll_theme_recent", (await recent(page)) === null, await recent(page));
  R.check("t shows the '{name} theme' toast", (await toasts(page, /Dusk theme/)).length >= 1, JSON.stringify(await page.evaluate(() => window.__toasts)));

  /* 4. from a theme that is neither: a light one goes to night, a dark one to day */
  await select(page, "paper"); await press(page, "t");
  R.check("light theme that is neither (paper): t goes to the night theme", (await theme(page)) === "dusk", await theme(page));
  await select(page, "ember"); await press(page, "t");
  R.check("dark theme that is neither (ember): t goes to the day theme", (await theme(page)) === "day", await theme(page));

  /* 5. high contrast stays high contrast, unless the pair itself holds a contrast theme */
  await select(page, "hicon"); await press(page, "t"); const x = await theme(page); await press(page, "t"); const y = await theme(page);
  R.check("Contrast on the default pair: t → hidark → hicon", x === "hidark" && y === "hicon", x + " " + y);
  await setPair(page, "night", "hidark"); await select(page, "hidark"); await press(page, "t");
  R.check("pair day/hidark: from hidark t goes to day", (await theme(page)) === "day", await theme(page));
  await setPair(page, "night", "dusk");

  /* 6. the lists keep the pair two themes: each refuses the other half's theme, so nothing changes
     (a pair that earlier versions left collapsed is repaired when the prefs load, tests/looks.js) */
  await select(page, "day");
  const p6 = JSON.stringify(await prefs(page));
  await setPair(page, "night", "day");
  const n6 = JSON.stringify(await prefs(page)), sn = await st(page);
  R.check('the lists keep the pair two themes: setPair("night","day") on day/dusk changes nothing', n6 === p6 && sn.theme === "day" && sn.autoDay === "day" && sn.autoNight === "dusk", p6 + " → " + n6);
  await setPair(page, "day", "dusk");
  const d6 = JSON.stringify(await prefs(page)), sd = await st(page);
  R.check('the lists keep the pair two themes: setPair("day","dusk") on day/dusk changes nothing', d6 === p6 && sd.theme === "day" && sd.autoDay === "day" && sd.autoNight === "dusk", p6 + " → " + d6);

  /* 7. dnOf: which half a theme is */
  const r = await page.evaluate(() => window.llThemes.dnOf ? ["day", "dusk", "paper", "hicon"].map((k) => window.llThemes.dnOf(k)) : "no dnOf");
  R.check("dnOf(day/dusk/paper/hicon) = day/night/null/day", JSON.stringify(r) === '["day","night",null,"day"]', JSON.stringify(r));

  /* 8. the pair is shown (its look pressed), and the half on screen marked in the popover's Day/Night
     switch, with switching off too; on a theme outside the pair (the raw select) neither half is */
  const dnMarks = () => page.evaluate(() => [...document.querySelectorAll("#qDN [data-dn]")].map((b) => b.dataset.dn + ":" + (b.getAttribute("aria-pressed") === "true")).join(","));
  await select(page, "dusk");
  await page.click("#lamp"); await page.waitForTimeout(150);
  R.check("Auto off: the theme popover shows the pair", await page.evaluate(() => { const d = document.getElementById("qDN"), on = document.querySelector('#qLooks .chip[aria-pressed="true"]');
    return !!d && !d.hidden && d.getBoundingClientRect().height > 0 && !!on && on.dataset.look === "day"; }));
  R.check("Auto off on dusk: Night marked, Day not", (await dnMarks()) === "day:false,night:true", await dnMarks());
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  await select(page, "paper");
  await page.click("#lamp"); await page.waitForTimeout(150);
  R.check("on paper: neither half marked", (await dnMarks()) === "day:false,night:false", await dnMarks());
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  await page.keyboard.press("s"); await page.waitForTimeout(250);
  R.check("Auto off: the settings sheet shows the day/night pickers", await page.evaluate(() => getComputedStyle(document.getElementById("autoRow")).display !== "none"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);

  /* 9. an own theme picked while switching is on goes into the half on screen, and the first time the
     toast says which (llThemes.create makes one from the colours on screen and picks it) */
  await setMode(page, "time");
  const made = await page.evaluate(() => window.llThemes.create().name);
  await page.waitForTimeout(100);
  R.check("Auto on, an own theme at noon: the toast says it is now your day theme", (await toasts(page, new RegExp(made + " is now your day theme"))).length === 1, JSON.stringify(await page.evaluate(() => window.__toasts.slice(-2))));
  await setMode(page, "off"); await setPair(page, "day", "day"); await select(page, "day");

  R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await ctx.close();

  /* ---------- the Auto-on hold: a switch lasts until the next automatic change ---------- */
  /* opening the app at a given local time: a new page in the same context keeps localStorage */
  async function openAt(c, when){
    const pg = await c.newPage();
    pg.on("pageerror", (e) => { pg._errors = (pg._errors || []).concat([String(e)]); });
    await pg.clock.install({ time: when });
    await pg.goto(url, { waitUntil: "load" });
    return pg;
  }
  const hold = (pg) => pg.evaluate(() => window.llThemes.hold ? window.llThemes.hold() : "no hold()");
  const dn = (pg, w) => pg.evaluate((x) => window.llThemes.setDayNight(x), w);
  const D = (d, h, m) => new Date(2026, 9, d, h, m || 0, 0);
  const actx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
  page = await openAt(actx, D(8, 22));
  await page.evaluate(() => { const s = window.__ll.state; s.nightFrom = "21:00"; s.nightTo = "07:00"; });
  await setPair(page, "day", "sepia"); await setPair(page, "night", "ember"); await setMode(page, "time");
  R.check("22:00: the night theme is on", (await theme(page)) === "ember", await theme(page));
  await dn(page, "day"); const h1 = await theme(page);
  await page.clock.fastForward("00:31"); const h2 = await theme(page);
  R.check("setDayNight('day') at 22:00 → sepia, still after 31 s", h1 === "sepia" && h2 === "sepia", h1 + " " + h2);
  const hv = await hold(page);
  R.check("hold saved: period night, until next 07:00", hv && hv.period === "night" && hv.until === D(9, 7).getTime() && hv.theme === "sepia", JSON.stringify(hv));
  await page.close();
  page = await openAt(actx, D(8, 23));
  R.check("reopened at 23:00: still sepia", (await theme(page)) === "sepia", await theme(page));
  await page.clock.fastForward("08:00:30");
  R.check("07:00 passes: hold cleared", (await hold(page)) === null, JSON.stringify(await hold(page)));
  await page.clock.fastForward("14:00:00");
  R.check("21:00 next evening: ember again", (await theme(page)) === "ember", await theme(page));
  await page.close();
  /* a hold left past its boundary while the app was closed: gone on the next night */
  page = await openAt(actx, D(10, 22));
  await dn(page, "day");
  await page.close();
  page = await openAt(actx, D(11, 22));
  R.check("reopened the next night (past the boundary): no hold, ember", (await hold(page)) === null && (await theme(page)) === "ember", JSON.stringify(await hold(page)) + " " + await theme(page));
  /* any other choice carries the hold over to the theme it puts in the held half: an own theme picked
     during a Day hold (llThemes.create picks the one it makes) takes the day half, and the hold */
  await dn(page, "day");
  const held = await hold(page);
  const own = await page.evaluate(() => "c:" + window.llThemes.create().id);
  await page.clock.fastForward("00:31");
  const o1 = await st(page), oh = await hold(page);
  R.check("an own theme picked during a hold takes the held half and keeps the hold (still on screen after 31 s)",
    !!held && held.theme === "sepia" && o1.theme === own && o1.autoDay === own && o1.autoNight === "ember" && !!oh && oh.theme === own && oh.period === held.period && oh.until === held.until,
    JSON.stringify({ held, o1, oh }));
  /* the lists: a change to the held half keeps the hold, now on the new theme; a change to the other half
     leaves the screen and the hold alone */
  await setPair(page, "day", "sepia");
  const l1 = await st(page), lh1 = await hold(page);
  await setPair(page, "night", "cocoa");
  const l2 = await st(page), lh2 = await hold(page);
  R.check("changing the held half keeps the hold on the new theme; changing the other half leaves it",
    l1.theme === "sepia" && l1.autoDay === "sepia" && !!lh1 && lh1.theme === "sepia" && lh1.until === held.until &&
    l2.theme === "sepia" && l2.autoNight === "cocoa" && !!lh2 && lh2.theme === "sepia" && lh2.until === held.until, JSON.stringify({ l1, lh1, l2, lh2 }));
  await dn(page, "day"); await setMode(page, "system");
  R.check("setMode during a hold clears it", (await hold(page)) === null, JSON.stringify(await hold(page)));
  await setMode(page, "time"); await dn(page, "day");
  await page.evaluate(() => { const el = document.getElementById("nightFrom"); el.value = "20:00"; el.dispatchEvent(new Event("change")); });
  R.check("a change of the night hours during a hold clears it", (await hold(page)) === null, JSON.stringify(await hold(page)));
  await setMode(page, "off"); await dn(page, "night");
  R.check("Auto off: setDayNight stores no hold", (await hold(page)) === null, JSON.stringify(await hold(page)));
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("ll_prefs") || "{}"); p.dnHold = { theme: "nope", period: "x", until: "y" }; localStorage.setItem("ll_prefs", JSON.stringify(p)); });
  await page.close();
  page = await openAt(actx, D(12, 12));
  R.check("a malformed hold in ll_prefs is dropped on load", (await hold(page)) === null, JSON.stringify(await hold(page)));
  R.check("no page errors (hold)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await actx.close();

  /* Follow phone: the app cannot see the phone switch while it is closed, so a hold ends after 12 hours */
  const fctx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce", colorScheme: "dark" });
  page = await openAt(fctx, D(8, 12));
  await setPair(page, "day", "sepia"); await setPair(page, "night", "ember"); await setMode(page, "system");
  await dn(page, "day"); const f1 = await theme(page);
  await page.clock.fastForward("12:00:31"); const f2 = await theme(page);
  R.check("Follow phone (dark): Day holds, and after 12 h + 31 s night returns", f1 === "sepia" && f2 === "ember", f1 + " " + f2);
  await page.close();
  await fctx.close();
  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
