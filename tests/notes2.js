/* Notes, round two: #tags in a note, the colour legend, searching and filtering the list, and the
   Obsidian export. The older Markdown and JSON exports must come out unchanged.
     NODE_PATH=$(npm root -g) node tests/notes2.js      (LL_SHOTS=<dir> to choose where screenshots go) */
const path = require("path"), os = require("os"), fs = require("fs");
const { serve, browser, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-notes2");

const panelText = (page) => page.$eval("#sideBody", (b) => b.innerText);
const items = (page) => page.$$eval("#markList .mark-item", (els) => els.map((e) => (e.querySelector(".mark-text") || {}).textContent || ""));
const chips = (page) => page.$$eval("#markFilters .chip", (els) => els.map((e) => e.textContent.trim() + "/" + (e.getAttribute("aria-pressed") || "-")));
const legendRow = (page) => page.$$eval("#markLegend .mk-leg", (els) => els.map((e) => e.querySelector("span").textContent));
const count = (page) => page.$eval("#markCount", (e) => e.textContent);
/* a highlight over a phrase that is really in the document */
async function mark(page, phrase, note, color){
  return page.evaluate((a) => {
    const t = document.getElementById("doc").textContent, i = t.indexOf(a.phrase);
    if (i < 0) return null;
    const m = window.__ll.Marks.addHighlight(i, i + a.phrase.length, a.note, a.color);
    return m ? m.key : null;
  }, { phrase, note, color });
}
async function openNotes(page){
  await page.evaluate(() => window.__ll.Marks.openPanel());
  await page.waitForFunction(() => document.getElementById("side").classList.contains("open"), null, { timeout: 5000 });
  await page.waitForTimeout(200);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const errors = [];
  const note = (page, where) => (page._errors || []).forEach((e) => errors.push(where + ": " + e));

  async function context(w, h, theme, touch){
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, acceptDownloads: true });
    await ctx.addInitScript((t) => { try { localStorage.setItem("ll_tips", "seen"); if (t) localStorage.setItem("ll_prefs", JSON.stringify({ theme: t })); } catch(e){} }, theme);
    return ctx;
  }
  async function fresh(ctx){
    const page = await ctx.newPage();
    page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
    await page.goto(url, { waitUntil: "load" });
    return page;
  }

  /* ---------- 1. tags, filters, the legend and searching ---------- */
  let ctx = await context(1200, 800, "day");
  let page = await fresh(ctx);
  await openFixture(page, "sample.md");
  const key1 = await mark(page, "extraordinary consequences", "", "accent");
  await mark(page, "Photosynthesis converts light energy", "Look up #vocab #science", "sun");
  await mark(page, "indifferent and punctual", "Why say it like that? #question", "rose");
  const one = '#markList .mark-item[data-key="' + key1 + '"] ';
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  await openNotes(page);

  /* a note typed into the panel: the chip appears and so does the tag filter */
  await page.click(one + '[data-act="note"]');
  await page.waitForTimeout(250);
  await page.keyboard.type("Lovely phrase #vocab");
  await page.click(one + '[data-act="savenote"]');
  await page.waitForTimeout(300);
  const tagChips = await page.$$eval("#markList .mark-note .tag", (els) => els.map((e) => e.textContent));
  R.check("a #tag typed into a note is drawn as a chip", tagChips.join() === "#vocab,#vocab,#science,#question", tagChips.join());
  R.check("the tag row lists every tag with its count", (await chips(page)).filter((c) => /^#/.test(c)).join(" ") === "#vocab2/false #science1/false #question1/false",
    (await chips(page)).join(" "));
  R.check("the count line names every mark", (await count(page)) === "4 marks", await count(page));

  /* filtering by tags: two of them narrow together */
  await page.click('#markFilters [data-pick-tag="vocab"]'); await page.waitForTimeout(200);
  R.check("a tag chip filters the list", (await items(page)).length === 2 && (await count(page)) === "2 of 4 marks", (await items(page)).join(" | "));
  await page.click('#markFilters [data-pick-tag="science"]'); await page.waitForTimeout(200);
  R.check("two tags filter together, not apart", (await items(page)).length === 1 && /Photosynthesis/.test((await items(page))[0]), (await items(page)).join(" | "));
  await page.click('#markFilters [data-pick-clear]'); await page.waitForTimeout(200);
  R.check("Clear filters brings the whole list back", (await items(page)).length === 4 && (await count(page)) === "4 marks");

  /* the colours: the legend names them, in the filter row and on the popover */
  R.check("the legend ships with three suggestions and one blank", (await legendRow(page)).join() === "Name it,Important,Vocabulary,Question", (await legendRow(page)).join());
  let colorChips = (await chips(page)).filter((c) => !/^#|^Clear/.test(c));
  R.check("the filter row includes the colours in use, named from the legend", colorChips.join() === "Default/false,Important/false,Question/false", colorChips.join());
  await page.click('#markFilters [data-pick-color="sun"]'); await page.waitForTimeout(200);
  R.check("tapping a colour filters by it", (await items(page)).length === 1 && /Photosynthesis/.test((await items(page))[0]) && (await count(page)) === "1 of 4 marks", (await items(page)).join(" | "));
  await page.click('#markFilters [data-pick-color="sun"]'); await page.waitForTimeout(200);
  R.check("tapping it again lets it go", (await items(page)).length === 4);

  /* editing a colour's meaning */
  await page.click('#markLegend [data-leg="sun"]'); await page.waitForTimeout(200);
  R.check("tapping a legend entry opens a small input with the old name", await page.$eval('#markLegend [data-leg-in="sun"]', (i) => i.value === "Important" && document.activeElement === i));
  await page.fill('#markLegend [data-leg-in="sun"]', "Key idea");
  await page.keyboard.press("Enter"); await page.waitForTimeout(250);
  R.check("Enter saves it", (await legendRow(page))[1] === "Key idea" &&
    JSON.parse(await page.evaluate(() => localStorage.getItem("ll_mark_legend"))).sun === "Key idea", (await legendRow(page)).join());
  colorChips = (await chips(page)).filter((c) => !/^#|^Clear/.test(c));
  R.check("the colour filter chip follows the legend", colorChips.join() === "Default/false,Key idea/false,Question/false", colorChips.join());
  /* going straight from one colour to the next keeps what was typed and opens the next */
  await page.click('#markLegend [data-leg="accent"]'); await page.waitForTimeout(200);
  await page.fill('#markLegend [data-leg-in="accent"]', "Plain");
  await page.click('#markLegend [data-leg="rose"]'); await page.waitForTimeout(300);
  R.check("moving on to another colour saves the one left behind", (await legendRow(page))[0] === "Plain" &&
    (await page.$('#markLegend [data-leg-in="rose"]')) !== null, (await legendRow(page)).join());
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  await page.click("#doc mark.ll-mark[data-color=sun]"); await page.waitForTimeout(300);
  const dots = await page.$$eval("#markPop .dot", (els) => els.map((e) => e.getAttribute("title") + "/" + e.getAttribute("aria-label")));
  R.check("the popover's colour dots are named from the legend",
    dots.join(" ") === "Plain/Plain Key idea/Key idea Vocabulary/Vocabulary Question/Question", dots.join(" "));
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);

  /* searching */
  await openNotes(page);
  await page.fill("#markFind", "photosynthesis"); await page.waitForTimeout(250);
  R.check("the search box narrows the list, ignoring case", (await items(page)).length === 1 && (await count(page)) === "1 of 4 marks", (await items(page)).join(" | "));
  R.check("the search box keeps the caret while it filters", await page.evaluate(() => document.activeElement.id === "markFind"));
  await page.fill("#markFind", "lovely"); await page.waitForTimeout(250);
  R.check("the search reaches the notes as well as the highlights", (await items(page)).length === 1 && /extraordinary/.test((await items(page))[0]), (await items(page)).join(" | "));
  await page.fill("#markFind", "nothing like this"); await page.waitForTimeout(250);
  R.check("an empty state and a count when nothing matches", (await items(page)).length === 0 &&
    /Nothing here matches those filters\./.test(await panelText(page)) && (await count(page)) === "0 of 4 marks", (await panelText(page)).replace(/\n/g, " | ").slice(0, 200));
  await page.fill("#markFind", ""); await page.waitForTimeout(250);
  R.check("clearing the box brings the list back", (await items(page)).length === 4);

  /* ---------- 2. the Obsidian export ---------- */
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#sideFoot [data-exp="obsidian"]')]);
  const md = fs.readFileSync(await dl.path(), "utf8");
  R.check("the file is named after the book", dl.suggestedFilename() === "sample.md", dl.suggestedFilename());
  R.check("YAML front matter with the title, the source, a date and the tags",
    /^---\ntitle: "sample\.md"\nsource: Lamplight\ndate: \d{4}-\d\d-\d\d\ntags: \[reading, vocab, science, question\]\n---\n/.test(md), md.slice(0, 200));
  R.check("an H1 with the title", /\n# sample\.md\n/.test(md), md.slice(0, 260));
  R.check("the colour meanings come first, as a Legend callout",
    /> \[!note\] Legend\n> - Default — Plain\n> - Yellow — Key idea\n> - Green — Vocabulary\n> - Pink — Question\n/.test(md), (md.match(/> \[!note\][\s\S]{0,120}/) || [""])[0]);
  R.check("an H2 per chapter, from the document's headings", /\n## Chapter 1\n/.test(md) && /\n## Chapter 2\n/.test(md), (md.match(/^## .*/gm) || []).join(" | "));
  R.check("each highlight is a blockquote with its note and tags on the next line",
    /\n> Photosynthesis converts light energy\nLook up #vocab #science\n/.test(md) && /\n> extraordinary consequences\nLovely phrase #vocab\n/.test(md),
    (md.match(/> Photosynthesis[\s\S]{0,80}/) || [""])[0]);
  R.check("bookmarks are a list with their percentage", /\n## Bookmarks\n\n- \d+% — /.test(md), (md.match(/## Bookmarks[\s\S]{0,120}/) || [""])[0]);

  /* the older exports are untouched */
  const plain = await page.evaluate(() => window.__ll.Marks.toMarkdown());
  R.check("Export Markdown is unchanged", /^# sample\.md\n\n_Exported from Lamplight on /.test(plain) && /## Bookmarks/.test(plain) &&
    /## Highlights/.test(plain) && /<sub>\d+%<\/sub>/.test(plain) && !/\[!note\]/.test(plain) && !/^---$/m.test(plain), plain.slice(0, 120).replace(/\n/g, " | "));
  const json = JSON.parse(await page.evaluate(() => window.__ll.Marks.toJSON()));
  R.check("Export JSON is unchanged", json.document.name === "sample.md" && json.marks.length === 4 &&
    json.marks.every((m) => typeof m.percent === "number" && m.doc === undefined) && /#vocab/.test(json.marks.map((m) => m.note).join(" ")), JSON.stringify(json.marks[0]).slice(0, 140));
  note(page, "tags and export");
  await ctx.close();

  /* ---------- 3. an EPUB carries its author into the front matter ---------- */
  ctx = await context(1200, 800, "day");
  page = await fresh(ctx);
  await openFixture(page, "sample.epub");
  await mark(page, "lamp", "From the book #epub", "accent");
  const epub = await page.evaluate(() => window.__ll.Marks.toObsidian());
  R.check("an EPUB's title and author reach the front matter",
    /^---\ntitle: "The Lamp"\nauthor: "A\. Reader"\nsource: Lamplight\n/.test(epub) && /\n# The Lamp\n/.test(epub), epub.slice(0, 160).replace(/\n/g, " | "));
  note(page, "epub");
  await ctx.close();

  /* ---------- 4. screenshots ---------- */
  for (const [name, theme, w, h] of [["desktop-day", "day", 1200, 800], ["desktop-dusk", "dusk", 1200, 800],
                                     ["phone-day", "day", 390, 844], ["phone-dusk", "dusk", 390, 844]]){
    const c2 = await context(w, h, theme, w < 600);
    const p2 = await fresh(c2);
    await openFixture(p2, "sample.md");
    await mark(p2, "extraordinary consequences", "Lovely phrase #vocab", "accent");
    await mark(p2, "Photosynthesis converts light energy", "Look up #vocab #science", "sun");
    await mark(p2, "indifferent and punctual", "Why say it like that? #question", "rose");
    await p2.keyboard.press("b"); await p2.waitForTimeout(300);
    await openNotes(p2);
    await p2.waitForTimeout(400);
    await p2.screenshot({ path: path.join(SHOTS, "notes-" + name + ".png") });
    const ok = await p2.evaluate(() => ({ chips: document.querySelectorAll("#markFilters .chip").length,
      legend: document.querySelectorAll("#markLegend .mk-leg").length,
      over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    R.check("screenshots " + name, ok.chips === 6 && ok.legend === 4 && !ok.over, JSON.stringify(ok));
    note(p2, name);
    await c2.close();
  }

  R.check("no page errors", !errors.length, errors.join(" | "));
  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})();
