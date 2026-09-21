/* Reading stats: active time, words, the daily goal and streak, the panel, and the start-screen
   widget (which now also carries the yearly books goal, on by default at 12). Playwright's clock drives the app's timers, so eleven minutes of reading take a second.
     NODE_PATH=$(npm root -g) node tests/stats.js        (SHOTS=<dir> to choose where screenshots go) */
const path = require("path"), fs = require("fs"), os = require("os");
const { serve, browser, openFixture, makeReport } = require("./lib");

const T0 = new Date("2026-09-16T10:00:00");
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "lamplight-stats-shots");
fs.mkdirSync(SHOTS, { recursive: true });

/* a page whose clock is installed before the app loads, so every timer in it is ours to advance */
async function openPage(ctx, url, time){
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
  await page.clock.install({ time });
  await page.goto(url, { waitUntil: "load" });
  return page;
}
const snap = (page) => page.evaluate(() => window.llStats.snapshot());
const bodyText = (page) => page.$eval("#sideBody", (b) => b.innerText);
const panelTitle = (page) => page.evaluate(() => document.getElementById("side").classList.contains("open") ? document.getElementById("sideTitle").textContent : "closed");
const widget = (page) => page.evaluate(() => { const el = document.getElementById("streak"), b = el.querySelector("button.st-widget"); return { show: el.classList.contains("show"), text: b ? b.innerText : "", dots: el.querySelectorAll(".st-day").length }; });
/* write ll_stats from a plain page on the same origin, so no running app can save over it */
async function seed(ctx, url, data){
  const p = await ctx.newPage();
  await p.goto(url + "tests/fixtures/sample.txt");
  await p.evaluate((d) => { if (d) localStorage.setItem("ll_stats", JSON.stringify(d)); else localStorage.removeItem("ll_stats"); }, data);
  await p.close();
}
const day = (min) => ({ ms: min * 60000, words: min * 180, pages: 0, docs: [] });
function shift(key, n){
  const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
/* what a reader does: a small scroll, then fifteen seconds */
async function read(page, steps){
  for (let i = 0; i < steps; i++){
    await page.evaluate(() => { window.scrollBy(0, 30); window.dispatchEvent(new Event("scroll")); });
    await page.clock.runFor(15000);
  }
  await page.waitForTimeout(120);   /* let the browser's own scroll events land before the clock moves on */
}
async function watchToasts(page){
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver((muts) => muts.forEach((m) => { if (m.target.id === "toast") window.__toasts.push(m.target.textContent); }))
      .observe(document.body, { childList: true, subtree: true });
  });
}
const goalToasts = (page) => page.evaluate(() => window.__toasts.filter((t) => /Daily goal/.test(t)));

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const errors = [];
  const noteErrors = (page, where) => { (page._errors || []).forEach((e) => errors.push(where + ": " + e)); };
  let page, s, t, text;

  /* ---------- 1. a fresh profile: no widget; eleven minutes of reading meet the goal once ---------- */
  const A = await b.newContext({ viewport: { width: 1200, height: 800 }, acceptDownloads: true });
  page = await openPage(A, url, T0);
  const today = (await snap(page)).today;
  R.check("today is keyed in local time", today === "2026-09-16", today);
  R.check("fresh profile: no widget", (await widget(page)).show === false && (await widget(page)).text === "");
  await page.click("#more");
  const menu = await page.$eval("#moreMenu", (m) => m.innerText);
  R.check("the menu lists Reading stats on the start screen", /Reading stats\s*G/.test(menu), menu.replace(/\n/g, " "));
  await page.keyboard.press("Escape");
  await openFixture(page, "sample.md");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await watchToasts(page);
  const before = ((await snap(page)).days[today] || { ms: 0 }).ms;
  await read(page, 44);
  s = await snap(page); t = s.days[today];
  R.check("11 minutes of reading recorded", t && t.ms - before === 44 * 15000 && t.ms >= 600000, JSON.stringify(t));
  R.check("words counted from forward reading", t && t.words > 0, String(t && t.words));
  const id = t.docs[0];
  R.check("the document is on today's list and in books", t.docs.length === 1 && Object.keys(s.books).length === 1 && s.books[id].opened === 1 && s.books[id].ms === t.ms && !s.books[id].finished, JSON.stringify(s.books));
  R.check("streak 1 once today's goal is met", s.streak === 1 && s.best.streak === 1 && s.best.day === today, JSON.stringify(s.best));
  let toasts = await goalToasts(page);
  R.check("goal reached toast, once", toasts.length === 1 && toasts[0] === "Daily goal reached — 1-day streak", JSON.stringify(toasts));
  /* to the end of the document: the book counts as finished at the next tick */
  await page.evaluate(() => { window.scrollTo(0, 1e6); window.dispatchEvent(new Event("scroll")); });
  await page.clock.runFor(15000);
  s = await snap(page); t = s.days[today];
  R.check("reaching the end marks the book finished", s.books[id].finished === true, JSON.stringify(s.books[id]));

  await page.keyboard.press("g");
  R.check("g opens the panel", (await panelTitle(page)) === "Reading stats");
  text = await bodyText(page);
  const mins = Math.floor(t.ms / 60000);
  R.check("panel: today's minutes toward the goal, goal reached", new RegExp("^" + mins + " of 10 min$", "m").test(text) && /Goal reached/.test(text), text.replace(/\n/g, " | ").slice(0, 160));
  R.check("panel: streak line", /1-day streak · best 1 day/.test(text) && !/more minutes? today/.test(text), text.replace(/\n/g, " | ").slice(0, 300));
  const dots = await page.$$eval("#sideBody .st-day", (ds) => ds.map((d) => d.className + "|" + d.getAttribute("aria-label") + "|" + d.getAttribute("title")));
  R.check("14 day dots, today lit and outlined, labelled", dots.length === 14 && dots[13] === "st-day lit today|Wed 16 Sep — " + mins + " min|Wed 16 Sep — " + mins + " min" && dots.slice(0, 13).every((d) => /^st-day\|/.test(d)), dots[13]);
  const bars = await page.$$eval("#sideBody .st-bar", (bs) => ({ n: bs.length, last: bs[bs.length - 1].getAttribute("aria-label"), h: bs[bs.length - 1].style.height, img: bs.every((x) => x.getAttribute("role") === "img" && x.getAttribute("aria-label")) }));
  R.check("28 bars, each with a label", bars.n === 28 && bars.img && bars.last === "Wed 16 Sep — " + mins + " min" && parseFloat(bars.h) > 0, JSON.stringify(bars));
  R.check("weekly totals in text", new RegExp("This week " + mins + " min · last week 0 min").test(text), text.replace(/\n/g, " | "));
  R.check("all time rows", /Time read\n[\s\S]*?Words\n[\s\S]*?Documents opened\n1\n/.test(text) && /Books finished\n1\n/.test(text) && /\d+ words per minute/.test(text) && /First day recorded\n16 Sep 2026/.test(text), text.replace(/\n/g, " | "));

  /* goal chips */
  await page.click('#sideBody [data-goal="15"]');
  s = await snap(page);
  const pressed = await page.$$eval("#sideBody [data-goal]", (cs) => cs.filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.goal + "/" + c.className));
  text = await bodyText(page);
  const left = Math.ceil((15 * 60000 - t.ms) / 60000);
  R.check("a goal chip sets the goal", s.goal === 15 && pressed.join() === "15/chip on", JSON.stringify(pressed));
  R.check("a higher goal: today is open again, best is kept", new RegExp("^" + mins + " of 15 min$", "m").test(text) && new RegExp("Read " + left + " more minutes today to start one\\.").test(text) && /No streak yet · best 1 day/.test(text) && s.streak === 0 && s.best.streak === 1, text.replace(/\n/g, " | ").slice(0, 300));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#sideFoot [data-st="export"]')]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  R.check("export JSON", dl.suggestedFilename() === "lamplight-stats.json" && json.goal === 15 && json.days[today].ms === t.ms && json.books[id].finished === true, dl.suggestedFilename());

  /* idle: after three minutes without a sign of the reader, time stops counting */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  const m1 = (await snap(page)).days[today].ms;
  await page.clock.runFor(3 * 60000);
  const m2 = (await snap(page)).days[today].ms;
  await page.clock.runFor(5 * 60000);
  const m3 = (await snap(page)).days[today].ms;
  R.check("idle: the 3-minute grace adds at most 3 min, then five idle minutes add nothing", m2 > m1 && m2 - m1 <= 180000 && m3 === m2, [m1, m2, m3].join(" "));

  /* the start-screen widget */
  await page.keyboard.press("h");
  let w = await widget(page);
  const mins2 = Math.floor(m3 / 60000);
  R.check("widget on the start screen after reading", w.show && w.dots === 7 && w.text === mins2 + " min today · goal 15 min · 1 of 12 books this year", JSON.stringify(w));
  await page.click("#streak button");
  R.check("the widget opens the panel", (await panelTitle(page)) === "Reading stats");
  await page.click('#sideBody [data-goal="10"]');
  await page.keyboard.press("Escape");
  w = await widget(page);
  R.check("the widget follows the goal and the streak", w.text === "1-day streak · " + mins2 + " min today · goal 10 min · 1 of 12 books this year", JSON.stringify(w));
  toasts = await goalToasts(page);
  R.check("the goal toast is not repeated within the day", toasts.length === 1, JSON.stringify(toasts));

  /* persistence and reset */
  await page.keyboard.press("g");
  await page.click('#sideBody [data-goal="20"]');
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "load" });
  s = await snap(page); w = await widget(page);
  R.check("goal and days persist across a reload", s.goal === 20 && s.days[today] && s.days[today].ms === m3 && s.books[id] && s.books[id].finished, JSON.stringify(s));
  R.check("widget is back on load", w.show && / · goal 20 min · 1 of 12 books this year$/.test(w.text), JSON.stringify(w));
  await page.keyboard.press("g");
  page.once("dialog", (d) => d.dismiss());
  await page.click('#sideFoot [data-st="reset"]');
  R.check("reset asks first: cancelling keeps everything", Object.keys((await snap(page)).days).length === 1);
  page.once("dialog", (d) => d.accept());
  await page.click('#sideFoot [data-st="reset"]');
  s = await snap(page); w = await widget(page); text = await bodyText(page);
  R.check("reset clears everything", Object.keys(s.days).length === 0 && Object.keys(s.books).length === 0 && s.goal === 10 && s.best.streak === 0 && s.streak === 0, JSON.stringify(s));
  R.check("after reset: no widget, panel back to zero", !w.show && /^0 of 10 min$/m.test(text) && /No streak yet/.test(text), text.replace(/\n/g, " | ").slice(0, 120));
  await page.reload({ waitUntil: "load" });
  R.check("reset persists", Object.keys((await snap(page)).days).length === 0);
  noteErrors(page, "fresh profile");
  await A.close();

  /* ---------- 2. streaks with a history ---------- */
  const B = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await seed(B, url, { v: 1, goal: 10, days: { [shift(today, -2)]: day(12), [shift(today, -1)]: day(11) }, books: {}, best: { streak: 2, day: shift(today, -1) }, notified: shift(today, -1) });
  page = await openPage(B, url, T0);
  s = await snap(page);
  R.check("two met days: the streak is alive at 2 before reading", s.streak === 2, String(s.streak));
  await openFixture(page, "sample.md");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await watchToasts(page);
  await read(page, 40);
  s = await snap(page);
  toasts = await goalToasts(page);
  R.check("today's goal extends the streak to 3", s.streak === 3 && s.best.streak === 3 && s.best.day === today, JSON.stringify({ streak: s.streak, best: s.best }));
  R.check("the toast names the streak", toasts.length === 1 && toasts[0] === "Daily goal reached — 3-day streak", JSON.stringify(toasts));
  await page.keyboard.press("g");
  text = await bodyText(page);
  R.check("panel shows 3-day streak · best 3 days", /3-day streak · best 3 days/.test(text), text.replace(/\n/g, " | ").slice(0, 200));
  noteErrors(page, "streak of 3");
  await page.close();
  /* a missed day in between */
  await seed(B, url, { v: 1, goal: 10, days: { [shift(today, -4)]: day(12), [shift(today, -3)]: day(11), [shift(today, -2)]: day(15), [today]: day(10) }, books: {}, best: { streak: 2, day: shift(today, -3) }, notified: today });
  page = await openPage(B, url, new Date(T0.getTime() + 3600000));
  s = await snap(page);
  R.check("a missed day resets the streak to 1; best is recomputed to 3", s.streak === 1 && s.best.streak === 3 && s.best.day === shift(today, -2), JSON.stringify({ streak: s.streak, best: s.best }));
  noteErrors(page, "gap");
  await page.close();
  /* yesterday met, nothing yet today */
  await seed(B, url, { v: 1, goal: 10, days: { [shift(today, -1)]: day(10) }, books: {}, best: { streak: 1, day: shift(today, -1) }, notified: shift(today, -1) });
  page = await openPage(B, url, T0);
  s = await snap(page); w = await widget(page);
  await page.keyboard.press("g");
  text = await bodyText(page);
  R.check("yesterday met: the streak is still alive today", s.streak === 1 && /1-day streak · best 1 day/.test(text) && /Read 10 more minutes today to keep it\./.test(text), text.replace(/\n/g, " | ").slice(0, 200));
  R.check("widget with nothing read yet today", w.show && w.text === "1-day streak · 0 min today · goal 10 min · 0 of 12 books this year", JSON.stringify(w));
  const yday = await page.$$eval("#sideBody .st-day", (ds) => ds.slice(12).map((d) => d.className));
  R.check("dots: yesterday lit, today outlined and unlit", yday.join() === "st-day lit,st-day today", yday.join());
  noteErrors(page, "alive");
  await B.close();

  /* ---------- 3. a PDF: forward page reading counts pages, not words ----------
     (its own context: the clock belongs to the context, and a paused one would stall pdf.js's rendering frames) */
  const D = await b.newContext({ viewport: { width: 1200, height: 800 } });
  page = await openPage(D, url, new Date(T0.getTime() + 7200000));
  await openFixture(page, "sample.pdf");
  await page.clock.pauseAt(new Date(T0.getTime() + 7260000));
  const pdfBefore = ((await snap(page)).days[today] || { ms: 0 }).ms;
  for (let i = 0; i < 6; i++){
    await page.evaluate(() => { window.scrollBy(0, 300); window.dispatchEvent(new Event("scroll")); });
    await page.clock.runFor(15000);
  }
  s = await snap(page); t = s.days[today];
  const pdfId = t.docs[t.docs.length - 1];
  R.check("PDF: pages and time are recorded", t.pages > 0 && t.ms - pdfBefore === 6 * 15000 && s.books[pdfId] && s.books[pdfId].pages === t.pages, JSON.stringify(t));
  await page.keyboard.press("g");
  text = await bodyText(page);
  R.check("PDF: today shows pages", /(minutes? to go|Goal reached) · \d+ words · \d+ pages?/.test(text), text.replace(/\n/g, " | ").slice(0, 120));
  noteErrors(page, "pdf");
  await D.close();

  /* ---------- 4. screenshots: panel and start screen, desktop and phone, light and dark ---------- */
  const pattern = [22, 18, 31, 0, 12, 25, 9, 0, 14, 16, 11, 0, 28, 19];
  const history = {};
  for (let i = 1; i <= 30; i++){ const m = pattern[(i - 1) % pattern.length]; if (m) history[shift(today, -i)] = day(m); }
  const shots = [["light-desktop", "day", { width: 1200, height: 800 }], ["dark-desktop", "dusk", { width: 1200, height: 800 }],
                 ["light-phone", "day", { width: 390, height: 844 }], ["dark-phone", "dusk", { width: 390, height: 844 }]];
  for (const [name, theme, viewport] of shots){
    const C = await b.newContext({ viewport });
    await C.addInitScript((th) => { if (!localStorage.getItem("ll_prefs")) localStorage.setItem("ll_prefs", JSON.stringify({ theme: th })); }, theme);
    await seed(C, url, { v: 1, goal: 15, days: history, books: {}, best: { streak: 0, day: "" }, notified: "" });
    page = await openPage(C, url, T0);
    await openFixture(page, "sample.md");
    await page.clock.pauseAt(new Date(T0.getTime() + 60000));
    await read(page, 24);
    await page.keyboard.press("g");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "panel-" + name + ".png") });
    text = await bodyText(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("h");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "home-" + name + ".png") });
    w = await widget(page);
    R.check("screenshots " + name, /3-day streak · best \d+ days/.test(text) && /Read \d+ more minutes today to keep it/.test(text) && /This week 46 min · last week 1 h 31 min/.test(text) && w.text === "3-day streak · 6 min today · goal 15 min · 0 of 12 books this year", text.replace(/\n/g, " | ").slice(0, 200) + " // " + w.text);
    noteErrors(page, name);
    await C.close();
  }
  R.check("no page errors", !errors.length, errors.join(" | "));
  console.log("screenshots in " + SHOTS);

  await b.close(); server.close();
  process.exit(R.done());
})();
