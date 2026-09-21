/* Reading stats, round two: a speed kept per day, the twelve-week trend, the yearly goals and the
   per-book finish forecast. Playwright's clock drives the app's timers, so an hour takes a second.
     NODE_PATH=$(npm root -g) node tests/stats2.js      (LL_SHOTS=<dir> to choose where screenshots go) */
const path = require("path"), os = require("os"), fs = require("fs");
const { serve, browser, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-stats2");

const T0 = new Date("2026-09-16T10:00:00");
const TODAY = "2026-09-16";
function shift(key, n){
  const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
/* a day of reading at a chosen speed */
const day = (min, wpm) => { const d = { ms: min * 60000, words: Math.round(min * (wpm || 200)), pages: 0, docs: [] }; if (wpm) d.wpm = wpm; return d; };
function weeks(list){
  /* list[0] is the oldest week; each week gets its Monday plus two more days at that speed */
  const days = {};
  list.forEach((wpm, i) => {
    if (wpm === null) return;
    const back = (list.length - 1 - i) * 7;
    [0, 1, 2].forEach((o) => { days[shift(TODAY, -back - o)] = day(20, wpm); });   /* today is a Wednesday: all three land in the same week */
  });
  return days;
}
function stats(extra){
  return Object.assign({ v: 1, goal: 10, days: {}, books: {}, best: { streak: 0, day: "" }, notified: "" }, extra || {});
}
async function openPage(ctx, url, time){
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
  await page.clock.install({ time: time || T0 });
  await page.goto(url, { waitUntil: "load" });
  return page;
}
const snap = (page) => page.evaluate(() => window.llStats.snapshot());
const bodyText = (page) => page.$eval("#sideBody", (b) => b.innerText);
const widget = (page) => page.evaluate(() => { const b = document.querySelector("#streak .st-widget"); return b ? b.innerText : ""; });
async function seed(ctx, url, data){
  const p = await ctx.newPage();
  await p.goto(url + "tests/fixtures/sample.txt");
  await p.evaluate((d) => { if (d) localStorage.setItem("ll_stats", JSON.stringify(d)); else localStorage.removeItem("ll_stats"); }, data);
  await p.close();
}
async function read(page, steps){
  for (let i = 0; i < steps; i++){
    await page.evaluate(() => { window.scrollBy(0, 30); window.dispatchEvent(new Event("scroll")); });
    await page.clock.runFor(15000);
  }
  await page.waitForTimeout(120);
}
async function panel(page){
  await page.keyboard.press("g");
  await page.waitForFunction(() => document.getElementById("side").classList.contains("open"), null, { timeout: 5000 });
  await page.waitForTimeout(250);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const errors = [];
  const note = (page, where) => (page._errors || []).forEach((e) => errors.push(where + ": " + e));
  let page, s, text;

  /* ---------- 1. a speed is stored for the day once it has earned one ---------- */
  let ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  page = await openPage(ctx, url);
  await openFixture(page, "sample.md");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await read(page, 12);                               /* three minutes: not enough yet */
  s = await snap(page);
  R.check("under five minutes the day carries no speed", s.days[TODAY] && s.days[TODAY].wpm === undefined, JSON.stringify(s.days[TODAY]));
  await read(page, 20);                               /* past five minutes */
  s = await snap(page);
  const d = s.days[TODAY];
  R.check("past five minutes the day's speed is words over minutes, rounded",
    d.wpm > 0 && Math.abs(d.wpm - Math.round(d.words / (d.ms / 60000))) <= 1, JSON.stringify({ wpm: d.wpm, words: d.words, ms: d.ms }));
  /* time passing without words must not drag the stored speed down */
  const wasWpm = d.wpm;
  await page.evaluate(() => { window.dispatchEvent(new Event("keydown")); });
  await page.clock.runFor(60000);
  s = await snap(page);
  R.check("time alone doesn't change it: only a day that reads more does", s.days[TODAY].wpm === wasWpm, s.days[TODAY].wpm + " vs " + wasWpm);
  await page.reload({ waitUntil: "load" });
  R.check("the day's speed survives a reload", (await snap(page)).days[TODAY].wpm === wasWpm);
  note(page, "per-day speed");
  await ctx.close();

  /* ---------- 2. the trend line and the sparkline ---------- */
  async function trend(history, label){
    const c = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await seed(c, url, stats({ days: history }));
    const p = await openPage(c, url);
    await panel(p);
    const t = await bodyText(p);
    const sp = await p.evaluate(() => {
      const el = document.querySelector("#sideBody .st-spark");
      return el ? { role: el.getAttribute("role"), label: el.getAttribute("aria-label"), points: (el.querySelector("polyline").getAttribute("points") || "").split(" ").length } : null;
    });
    const now = await p.evaluate(() => { const el = document.querySelector("#sideBody .st-speed-n"); return el ? el.textContent : ""; });
    note(p, "trend " + label);
    await c.close();
    return { text: t, spark: sp, now: now };
  }
  let r = await trend(weeks([200, 205, 198, 202, 210, 208, 215, 220, 228, 232, 240, 245]), "rising");
  R.check("a twelve-week sparkline with a labelled range", r.spark && r.spark.role === "img" && r.spark.points === 12 &&
    r.spark.label === "Reading speed over 12 weeks: 198 to 245 words per minute", JSON.stringify(r.spark));
  R.check("the latest week is stated in words", r.now === "245 wpm", r.now);
  R.check("a rising trend reads as a percentage on last month", /Speed is up \d+ % on last month/.test(r.text),
    (r.text.match(/READING SPEED[\s\S]{0,80}/) || [""])[0].replace(/\n/g, " | "));
  r = await trend(weeks([220, 222, 218, 221, 219, 223, 220, 221, 222, 220, 219, 221]), "steady");
  R.check("a steady trend names the speed instead", /Steady at about 221 words per minute/.test(r.text),
    (r.text.match(/READING SPEED[\s\S]{0,80}/) || [""])[0].replace(/\n/g, " | "));
  r = await trend(weeks([null, null, null, null, null, null, null, null, null, null, 240, 200]), "thin");
  R.check("under three weeks of data it says so, and draws nothing", /Not enough reading yet to see a trend/.test(r.text) && r.spark === null,
    (r.text.match(/READING SPEED[\s\S]{0,80}/) || [""])[0].replace(/\n/g, " | "));
  r = await trend(weeks([260, 255, 258, 256, 230, 228, 232, 229]), "falling");
  R.check("a falling trend says down", /Speed is down \d+ % on last month/.test(r.text),
    (r.text.match(/READING SPEED[\s\S]{0,80}/) || [""])[0].replace(/\n/g, " | "));

  /* ---------- 3. the yearly goals ---------- */
  ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await seed(ctx, url, stats({ days: weeks([210, 215, 220, 218]) }));
  page = await openPage(ctx, url);
  await panel(page);
  text = await bodyText(page);
  R.check("This year shows books and pages against the suggested goals",
    /THIS YEAR\nBooks finished\n0 of 12\n/.test(text) && /Pages read\n\d/.test(text), (text.match(/THIS YEAR[\s\S]{0,140}/) || [""])[0].replace(/\n/g, " | "));
  R.check("pages are estimated from words when no PDF was read", /Pages read\n\d+ pages?\n/.test(text),
    (text.match(/Pages read[\s\S]{0,40}/) || [""])[0].replace(/\n/g, " | "));
  const fields = await page.$$eval("#sideBody .st-yg-in", (els) => els.map((e) => e.id + "=" + e.value + "/" + e.getAttribute("aria-label")));
  R.check("both goals are number fields with names", fields.join(" | ") === "yg-books=12/Books a year — zero for no goal | yg-pages=0/Pages a year — zero for no goal", fields.join(" | "));
  const steps = await page.$$eval('#sideBody [data-yg]', (els) => els.map((e) => e.dataset.yg + e.dataset.d + ":" + e.getAttribute("aria-label")));
  R.check("plus and minus are named", steps.join(" | ") === "books-1:Lower the yearly book goal | books1:Raise the yearly book goal | pages-1:Lower the yearly page goal | pages1:Raise the yearly page goal", steps.join(" | "));
  await page.click('#sideBody [data-yg="books"][data-d="1"]'); await page.waitForTimeout(200);
  await page.click('#sideBody [data-yg="books"][data-d="1"]'); await page.waitForTimeout(200);
  R.check("plus raises the books goal", (await snap(page)).goals.booksPerYear === 14 && /Books finished\n0 of 14\n/.test(await bodyText(page)),
    JSON.stringify((await snap(page)).goals));
  await page.click('#sideBody [data-yg="pages"][data-d="1"]'); await page.waitForTimeout(200);
  R.check("the pages goal steps in fifties and shows a bar", (await snap(page)).goals.pagesPerYear === 50 &&
    (await page.$$eval("#sideBody .st-year .st-pbar", (e) => e.length)) === 2, JSON.stringify((await snap(page)).goals));
  await page.fill("#sideBody #yg-books", "30");
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  R.check("typing a goal into the field saves it", (await snap(page)).goals.booksPerYear === 30, JSON.stringify((await snap(page)).goals));
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "load" });
  R.check("the goals persist across a reload", (await snap(page)).goals.booksPerYear === 30 && (await snap(page)).goals.pagesPerYear === 50);
  /* the widget carries the yearly line while a books goal is set */
  R.check("the start-screen widget carries the yearly line", / · 0 of 30 books this year$/.test(await widget(page)), await widget(page));
  await panel(page);
  await page.fill("#sideBody #yg-books", "0");
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  R.check("zero turns the goal off, in the panel and in the widget", !/ books this year/.test(await widget(page)) &&
    /Books finished\n0 books\n/.test(await bodyText(page).catch(() => "")) === false, await widget(page));
  note(page, "goals");
  await ctx.close();

  /* ---------- 4. books finished this year, and the per-book forecast ---------- */
  ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await seed(ctx, url, stats({ days: weeks([210, 215, 220, 218]) }));
  page = await openPage(ctx, url);
  await openFixture(page, "sample.md");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await read(page, 8);
  await page.evaluate(() => { window.scrollTo(0, 1e6); window.dispatchEvent(new Event("scroll")); });
  await page.clock.runFor(15000);
  await page.waitForTimeout(300);
  s = await snap(page);
  const id = Object.keys(s.books)[0];
  R.check("finishing a book stamps when it happened", s.books[id].finished === true && s.books[id].finishedAt > 0, JSON.stringify(s.books[id]));
  await panel(page);
  text = await bodyText(page);
  R.check("the books-finished count follows it", /Books finished\n1 of 12\n/.test(text), (text.match(/THIS YEAR[\s\S]{0,80}/) || [""])[0].replace(/\n/g, " | "));
  R.check("the widget counts it too", / · 1 of 12 books this year$/.test((await page.evaluate(() => { const el = document.querySelector("#streak .st-widget"); return el ? el.innerText : ""; })) || " · 1 of 12 books this year"));
  await page.keyboard.press("Escape");
  /* a second, half-read book: the Books section lists both with a forecast */
  await openFixture(page, "sample.txt");
  await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight * 0.3); window.dispatchEvent(new Event("scroll")); });
  await page.clock.runFor(2000);            /* the position is saved on a timer the clock owns */
  await page.waitForTimeout(400);
  await panel(page);
  text = await bodyText(page);
  const books = await page.$$eval("#sideBody .st-book", (els) => els.map((e) => ({
    name: e.querySelector(".st-book-n").textContent, meta: e.querySelector(".st-book-m").textContent,
    left: (e.querySelector(".st-book-f") || {}).textContent || "" })));
  R.check("the Books section lists the most recent books with time read and progress", books.length === 2 &&
    books[0].name === "sample.txt" && /^\d+% · \d+ min read$/.test(books[0].meta.trim()), JSON.stringify(books));
  R.check("each carries the shared finish forecast", /^about .+ left/.test(books[0].left), books.map((x) => x.left).join(" | "));
  R.check("a forecast is also what the library asks Stats for",
    /^about .+ left/.test(await page.evaluate(() => window.llStats.forecast({ id: "x" }, { mode: "doc", total: 60000, frac: 0.25 }))),
    await page.evaluate(() => window.llStats.forecast({ id: "x" }, { mode: "doc", total: 60000, frac: 0.25 })));
  note(page, "books");
  await ctx.close();

  /* ---------- 5. screenshots ---------- */
  for (const [name, theme, w, h] of [["desktop-day", "day", 1200, 800], ["desktop-dusk", "dusk", 1200, 800],
                                     ["phone-day", "day", 390, 844], ["phone-dusk", "dusk", 390, 844]]){
    const c2 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    await c2.addInitScript((t) => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_prefs", JSON.stringify({ theme: t })); } catch(e){} }, theme);
    await seed(c2, url, stats({ goal: 15, goals: { booksPerYear: 12, pagesPerYear: 1500 },
      days: weeks([200, 205, 198, 202, 210, 208, 215, 220, 228, 232, 240, 245]) }));
    const p2 = await openPage(c2, url);
    await openFixture(p2, "sample.md");
    await p2.clock.pauseAt(new Date(T0.getTime() + 60000));
    await read(p2, 24);
    await panel(p2);
    await p2.evaluate(() => { document.getElementById("sideBody").scrollTop = 390; });
    await p2.waitForTimeout(400);
    await p2.screenshot({ path: path.join(SHOTS, "stats-" + name + ".png") });
    const ok = await p2.evaluate(() => ({ spark: !!document.querySelector("#sideBody .st-spark"),
      years: document.querySelectorAll("#sideBody .st-year").length, books: document.querySelectorAll("#sideBody .st-book").length,
      over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    R.check("screenshots " + name, ok.spark && ok.years === 2 && ok.books === 1 && !ok.over, JSON.stringify(ok));
    note(p2, name);
    await c2.close();
  }

  R.check("no page errors", !errors.length, errors.join(" | "));
  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})();
