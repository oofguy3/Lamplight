/* Reading journal: the "Finished" card at the end of a book (once per reading, only after reading a
   while), Mark as finished, the journal panel (year groups, editing, delete, Markdown export), the
   check and stars in the library, stats counting the journal, and clearing the library keeping it.
   Playwright's clock drives the app's timers, so minutes of reading take a second.
     NODE_PATH=$(npm root -g) node tests/journal.js      (LL_SHOTS=<dir> to choose where screenshots go) */
const path = require("path"), fs = require("fs"), os = require("os");
const { serve, browser, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-journal");
fs.mkdirSync(SHOTS, { recursive: true });
const T0 = new Date("2026-09-16T10:00:00");

async function openPage(ctx, url, time){
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
  page.on("dialog", (d) => d.accept());
  await page.clock.install({ time });
  await page.goto(url, { waitUntil: "load" });
  return page;
}
/* what a reader does: a small scroll, then fifteen seconds */
async function read(page, steps){
  for (let i = 0; i < steps; i++){
    await page.evaluate(() => { window.scrollBy(0, 30); window.dispatchEvent(new Event("scroll")); });
    await page.clock.runFor(15000);
  }
  await page.waitForTimeout(120);
}
async function scrollTo(page, y, ms){
  await page.evaluate((y) => { window.scrollTo(0, y); window.dispatchEvent(new Event("scroll")); }, y);
  await page.clock.runFor(ms || 1500);
  await page.waitForTimeout(100);
}
const cardOn = (page) => page.evaluate(() => !!document.querySelector("#finish.on"));
const entries = (page) => page.evaluate(() => window.llJournal.entries());
const bodyText = (page) => page.$eval("#sideBody", (b) => b.innerText);
const title = (page) => page.$eval("#sideTitle", (e) => e.textContent);

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const errors = [];
  const noteErrors = (page, where) => { (page._errors || []).forEach((e) => errors.push(where + ": " + e)); };
  let page, text, st, es;

  /* ---------- 1. the card at the end, the panel, the library, the stats ---------- */
  const A = await b.newContext({ viewport: { width: 1200, height: 800 }, acceptDownloads: true });
  page = await openPage(A, url, T0);
  await openFixture(page, "sample.md");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await scrollTo(page, 1e6, 2000);
  R.check("jumping to the end straight away shows no card", !(await cardOn(page)));
  await scrollTo(page, 0, 1000);
  await read(page, 14);
  R.check("no card while reading in the middle", !(await cardOn(page)));
  /* a jump to the end (here a search hit in the last paragraph) is not reading to it */
  await page.keyboard.press("/");
  await page.fill("#findInput", "puddles glitter");
  await page.clock.runFor(400); await page.waitForTimeout(100);
  await page.click("#findPrev");                   /* from the first match back round to the last */
  await page.clock.runFor(100);
  await page.keyboard.press("Escape");
  await page.clock.runFor(95000); await page.waitForTimeout(100);
  st = await page.evaluate(() => ({ frac: window.scrollY / (document.documentElement.scrollHeight - innerHeight), card: !!document.querySelector("#finish.on") }));
  R.check("a search hit at the end is a jump: no card there", st.frac > 0.98 && !st.card, JSON.stringify(st));
  await scrollTo(page, 200, 1000);
  await scrollTo(page, 1e6);
  R.check("reaching the end, the card waits while the last screen is read", !(await cardOn(page)));
  await page.clock.runFor(95000); await page.waitForTimeout(100);
  R.check("reaching the end after a few minutes of reading shows the card", await cardOn(page));
  st = await page.evaluate(() => ({ focusIn: document.getElementById("finish").contains(document.activeElement),
    live: document.querySelector(".recap-live") ? Array.from(document.querySelectorAll(".recap-live")).map((x) => x.textContent).join("") : "",
    radios: Array.from(document.querySelectorAll("#finish .jr-star")).map((x) => x.getAttribute("role") + "|" + x.getAttribute("aria-label") + "|" + x.getAttribute("aria-checked") + "|" + x.tabIndex),
    group: document.querySelector("#finish [role=radiogroup]").getAttribute("aria-label"),
    date: document.getElementById("finDate").value, note: document.getElementById("finNote").placeholder, head: document.getElementById("finTitle").textContent }));
  R.check("the card: focus stays in the text, five labelled radio stars, today's date, the note's placeholder",
    !st.focusIn && /^Finished /.test(st.live) && st.radios.length === 5 && st.radios[0] === "radio|1 star|false|0" && st.radios[1] === "radio|2 stars|false|-1" &&
    st.group === "Your rating" && st.date === "2026-09-16" && st.note === "A few words…" && st.head === "Finished", JSON.stringify(st));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, "card-desktop.png") });
  await page.focus("#finish .jr-star[tabindex='0']");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  st = await page.evaluate(() => ({ checked: document.querySelector("#finish .jr-star[aria-checked='true']").dataset.star, focus: document.activeElement.dataset.star }));
  R.check("arrow keys move the rating and the focus with it", st.checked === "3" && st.focus === "3", JSON.stringify(st));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Loved the ending");
  await page.fill("#finDate", "2026-09-15");
  await page.click("#finSave");
  await page.waitForTimeout(200);
  es = await entries(page);
  R.check("Save: one entry with its stars, note, date finished and the day it was first opened",
    es.length === 1 && es[0].stars === 4 && es[0].note === "Loved the ending" && es[0].finished === "2026-09-15" && es[0].started === "2026-09-16" &&
    es[0].book && es[0].title === "The Lamp" && es[0].created > 0 && !(await cardOn(page)), JSON.stringify(es));
  /* once per reading */
  await page.evaluate(() => { window.scrollBy(0, -300); window.dispatchEvent(new Event("scroll")); });   /* a look back, not a new start */
  await page.clock.runFor(1000);
  await read(page, 14);
  await scrollTo(page, 1e6);
  R.check("not again in the same reading", !(await cardOn(page)));
  /* the menu: Mark as finished edits this reading's entry */
  await page.click("#more");
  text = await page.$eval("#moreMenu", (m) => m.innerText);
  R.check("the menu has Mark as finished and Reading journal", /Mark as finished/.test(text) && /Reading journal\s*J/.test(text), text.replace(/\n/g, " "));
  await page.click("#moreMenu button:has-text('Mark as finished')");
  st = await page.evaluate(() => ({ on: !!document.querySelector("#finish.on"), focus: document.activeElement.dataset.star, note: document.getElementById("finNote").value, later: document.getElementById("finLater").textContent }));
  R.check("Mark as finished opens the card with the focus on the chosen star, editing this reading's entry",
    st.on && st.focus === "4" && st.note === "Loved the ending" && st.later === "Cancel", JSON.stringify(st));
  await page.keyboard.press("5");
  await page.keyboard.press("Escape");
  R.check("Escape closes without saving and hands focus back to the menu button",
    !(await cardOn(page)) && (await entries(page))[0].stars === 4 && await page.evaluate(() => document.activeElement.id === "more"));
  /* the panel */
  await page.keyboard.press("j");
  await page.waitForTimeout(100);
  text = await bodyText(page);
  R.check("j opens the journal: a year with its count, then the row", (await title(page)) === "Reading journal" && /2026 · 1 book/i.test(text) &&
    /The Lamp\nLoved the ending\nFinished 15 Sep 2026/.test(text) && await page.$eval(".jr-row [role=img]", (s) => s.getAttribute("aria-label")) === "4 of 5 stars", text);
  await page.click(".jr-row");
  st = await page.evaluate(() => ({ exp: document.querySelector(".jr-row").getAttribute("aria-expanded"), open: !!document.querySelector('[data-jr="open"]'), del: !!document.querySelector('[data-jr="del"]'), focus: document.activeElement.className }));
  R.check("a row opens to edit, with Open book and Delete; the focus stays on it", st.exp === "true" && st.open && st.del && st.focus === "jr-row", JSON.stringify(st));
  await page.click('.jr-ed .jr-star[data-star="2"]');
  R.check("the stars there save", (await entries(page))[0].stars === 2);
  await page.fill('.jr-ed [data-jr="note"]', "Changed my mind");
  await page.press('.jr-ed [data-jr="note"]', "Enter");
  R.check("the note there saves, and the row shows it", (await entries(page))[0].note === "Changed my mind" && /Changed my mind/.test(await page.$eval(".jr-row", (r) => r.innerText)));
  await page.fill('.jr-ed [data-jr="date"]', "2025-12-30");
  for (let i = 0; i < 6 && await page.evaluate(() => document.activeElement.dataset.jr === "date"); i++) await page.keyboard.press("Tab");   /* past the date's own fields, on to Open book */
  await page.clock.runFor(50); await page.waitForTimeout(100);     /* the redraw waits a tick of the (paused) clock */
  R.check("leaving the date keeps the focus where it went", await page.evaluate(() => document.activeElement.dataset.jr === "open"), await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
  R.check("a date in another year moves the entry to that year", (await entries(page))[0].finished === "2025-12-30" && /2025 · 1 book/i.test(await bodyText(page)));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#sideFoot [data-jr="export"]')]);
  const md = fs.readFileSync(await dl.path(), "utf8");
  R.check("Export saves Markdown: a heading per year, a line per book", dl.suggestedFilename() === "lamplight-journal.md" && /^# Reading journal/.test(md) &&
    /^## 2025$/m.test(md) && /^- \*\*The Lamp\*\* · ★★☆☆☆ · finished 30 Dec 2025 · Changed my mind$/m.test(md), md);
  await page.keyboard.press("Escape");
  /* the library and the stats */
  await page.click("#wordmark");
  await page.waitForTimeout(200);
  st = await page.$eval("#libList .lib-item", (it) => ({ fin: it.querySelector(".lib-fin") ? it.querySelector(".lib-fin").getAttribute("aria-label") : "", stars: it.querySelectorAll(".lib-stars svg").length, pill: !!it.querySelector(".lib-done") }));
  R.check("the library shows a check and the latest stars", st.fin === "Finished, 2 of 5 stars" && st.stars === 2 && !st.pill, JSON.stringify(st));
  await page.click("#libJournal");
  R.check("the start screen opens the journal", (await title(page)) === "Reading journal");
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  text = await bodyText(page);
  R.check("stats count the journal: none this year (it moved to 2025), one all time", /Books finished\n0 of 12/.test(text) && /Books finished\n1\n/.test(text), text.replace(/\n/g, " | "));
  await page.click('#sideBody [data-st="journal"]');
  R.check("the stats panel opens the journal", (await title(page)) === "Reading journal");
  await page.keyboard.press("Escape");
  /* clearing the library keeps the journal */
  await page.click("#libClear");
  await page.waitForTimeout(200);
  R.check("clearing the library keeps the journal", (await entries(page)).length === 1);
  await page.keyboard.press("j");
  await page.click(".jr-row");
  R.check("Open book is not offered once the book has left the library", !(await page.$('[data-jr="open"]')));
  await page.click('[data-jr="del"]');
  await page.waitForTimeout(100);
  R.check("Delete, and the empty state", (await entries(page)).length === 0 && /Books you finish appear here/.test(await bodyText(page)) &&
    await page.evaluate(() => document.activeElement.id === "sideClose"));
  st = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("lamplight"); r.onsuccess = () => { const d = r.result, s = d.transaction("journal").objectStore("journal"); res({ v: d.version, key: s.keyPath, idx: Array.from(s.indexNames) }); d.close(); }; }));
  R.check("IndexedDB: version 5, a journal store keyed by id with a book index", st.v === 5 && st.key === "id" && st.idx.join() === "book", JSON.stringify(st));
  noteErrors(page, "A");
  await A.close();

  /* ---------- 2. opened at the end, a re-read, an EPUB's author ---------- */
  const B = await b.newContext({ viewport: { width: 390, height: 760 } });
  page = await openPage(B, url, T0);
  await openFixture(page, "sample.epub");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await read(page, 14);
  await page.evaluate(() => { window.scrollTo(0, 1e6); window.dispatchEvent(new Event("scroll")); });
  await page.clock.runFor(650);                    /* the position is saved; the check has not run yet */
  await page.evaluate(() => window.__ll.Library.flush());
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click(".lib-open");
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block");
  await page.waitForTimeout(400);
  await page.clock.runFor(20000); await page.waitForTimeout(100);
  R.check("a book opened at its end shows no card", !(await cardOn(page)));
  await page.evaluate(() => { window.scrollBy(0, -400); window.dispatchEvent(new Event("scroll")); });
  await page.clock.runFor(1000);
  await scrollTo(page, 1e6, 2500);
  R.check("coming back to the end: no card at once", !(await cardOn(page)));
  /* a swipe on past the end, a moment later: done reading, the card now */
  await page.evaluate(() => {
    const t = (y) => new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: y });
    window.dispatchEvent(new TouchEvent("touchstart", { touches: [t(500)] }));
    window.dispatchEvent(new TouchEvent("touchmove", { touches: [t(400)] }));
  });
  await page.clock.runFor(100); await page.waitForTimeout(100);
  R.check("leaving the end and coming back to it shows the card (a swipe on past the end)", await cardOn(page));
  R.check("an EPUB's title and author", await page.$eval("#finBook", (e) => e.textContent) === "The Lamp · A. Reader");
  await page.click("#finish .jr-star[data-star='3']");
  await page.click("#finish .jr-star[data-star='3']");
  R.check("a click on the chosen star takes it back", await page.evaluate(() => !document.querySelector("#finish .jr-star[aria-checked='true']")));
  await page.click("#finish .jr-star[data-star='3']");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, "card-phone.png") });
  await page.click("#finSave");
  es = await entries(page);
  R.check("the entry carries the author apart", es.length === 1 && es[0].title === "The Lamp" && es[0].author === "A. Reader" && es[0].stars === 3, JSON.stringify(es));
  /* a re-read: back to the start, a few minutes more, the end again */
  await scrollTo(page, 0, 1000);
  await read(page, 14);
  await scrollTo(page, 1e6);
  await page.clock.runFor(95000); await page.waitForTimeout(100);
  R.check("a re-read brings the card back", await cardOn(page));
  await page.click("#finLater");
  st = await page.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
  R.check("Not now saves nothing, and says where to add it later", (await entries(page)).length === 1 && !(await cardOn(page)) && /Mark as finished/.test(st), st);
  await page.evaluate(() => window.llJournal.openCard());
  await page.click("#finSave");
  es = await entries(page);
  R.check("a re-read saved is a new entry", es.length === 2 && es[0].id !== es[1].id && es[0].book === es[1].book, JSON.stringify(es));
  await page.click("#wordmark"); await page.waitForTimeout(200);
  R.check("the widget counts the journal", /2 of 12 books this year/.test(await page.$eval("#streak", (e) => e.innerText)), await page.$eval("#streak", (e) => e.innerText));
  await page.keyboard.press("j"); await page.waitForTimeout(300);
  await page.click(".jr-row"); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, "panel-phone.png") });
  st = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
  R.check("the phone layout does not scroll sideways", !st.over);
  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await page.click('#sideFoot [data-jr="clear"]');
  await page.waitForTimeout(100);
  R.check("Clear journal empties it", (await entries(page)).length === 0 && /Books you finish appear here/.test(await bodyText(page)));
  noteErrors(page, "B");
  await B.close();

  /* ---------- 3. a PDF in Pages flow: its last page ---------- */
  const C = await b.newContext({ viewport: { width: 1200, height: 800 } });
  page = await openPage(C, url, T0);
  await openFixture(page, "sample.pdf");
  await page.clock.pauseAt(new Date(T0.getTime() + 60000));
  await page.keyboard.press("p"); await page.waitForTimeout(500);
  for (let i = 0; i < 14; i++){ await page.mouse.move(100 + i, 100); await page.clock.runFor(15000); }
  R.check("PDF: not on the first page", !(await cardOn(page)));
  await page.keyboard.press("End"); await page.waitForTimeout(600); await page.clock.runFor(95000); await page.waitForTimeout(100);
  R.check("PDF: End is a jump, and the last page reached that way shows no card", !(await cardOn(page)));
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(400); await page.clock.runFor(1500);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400); await page.clock.runFor(2500); await page.waitForTimeout(100);
  R.check("PDF in Pages flow: turning to the last page, the card waits over it", !(await cardOn(page)));
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); await page.clock.runFor(100); await page.waitForTimeout(100);
  R.check("PDF in Pages flow: the last page shows the card (a turn on past it)", await cardOn(page));
  noteErrors(page, "C");
  await C.close();

  R.check("no page errors", !errors.length, errors.join(" | "));
  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})();
