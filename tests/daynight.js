/* Day and night: one setter for the dock switch, the t key and the lamp hold. It goes to the
   reader's day or night theme, never rewrites that pair (even while Day and night switching is
   on), adds nothing to the Recent themes, and keeps high-contrast readers in high contrast.
   With switching on, a switch holds until the next automatic change, survives a restart, and
   any other theme choice ends it. The pair is shown, and marked, whether switching is on or off.
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

  /* 3. no Recent entry, and a toast that says where t went */
  await page.evaluate(() => localStorage.setItem("ll_theme_recent", "[]"));
  await press(page, "t");
  R.check("t adds no Recent entry", (await recent(page)) === "[]", await recent(page));
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

  /* 6. a collapsed pair (left by the old bug) still lets t reach a night theme */
  await setPair(page, "night", "day"); await select(page, "day"); await press(page, "t");
  R.check("collapsed pair day/day: from day t goes to dusk", (await theme(page)) === "dusk", await theme(page));
  await setPair(page, "night", "dusk");

  /* 7. dnOf: which half a theme is */
  const r = await page.evaluate(() => window.llThemes.dnOf ? ["day", "dusk", "paper", "hicon"].map((k) => window.llThemes.dnOf(k)) : "no dnOf");
  R.check("dnOf(day/dusk/paper/hicon) = day/night/null/day", JSON.stringify(r) === '["day","night",null,"day"]', JSON.stringify(r));

  R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await ctx.close();
  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
