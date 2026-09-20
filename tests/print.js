/* Print: under print media the reader strips down to the text in one column, black on white
   whatever the theme, with the title line, the address after outbound links and highlights a
   greyscale printer keeps; the screen layout comes back; a text document goes through
   window.print(), a PDF opens in a new tab; the entry only shows with a document open.
   Screenshots go to $LL_SHOTS (default: the OS temp dir).   NODE_PATH=$(npm root -g) node tests/print.js */
const path = require("path"), fs = require("fs"), os = require("os");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-print");

const menuLabels = (page) => page.evaluate(() => { document.getElementById("more").click(); const items = Array.from(document.querySelectorAll("#moreMenu button")).map((b) => b.textContent); document.getElementById("more").click(); return items; });
const setFlow = (page, f) => page.evaluate((f) => document.querySelector('#flowChips [data-flow="' + f + '"]').click(), f);
const display = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display, sel);
const toast = (page) => page.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
/* the printed layout, read off the computed styles */
const layout = (page) => page.evaluate(() => {
  const doc = document.getElementById("doc"), view = document.getElementById("docView"), cs = getComputedStyle(doc), body = getComputedStyle(document.body);
  const out = document.querySelector('#doc a[href^="https://"]'), inside = document.querySelector('#doc a[href^="#"]'), mark = document.querySelector("#doc mark.ll-mark"), ms = mark && getComputedStyle(mark);
  return {
    columns: cs.columnCount, docH: doc.getBoundingClientRect().height, viewH: view.getBoundingClientRect().height, viewInline: view.style.height, inner: window.innerHeight,
    wide: doc.scrollWidth > doc.clientWidth + 1, fontSize: parseFloat(cs.fontSize), lineHeight: parseFloat(cs.lineHeight), bodyBg: body.backgroundColor, bodyColor: body.color, docColor: cs.color,
    outAfter: out ? getComputedStyle(out, "::after").content : null, outColor: out ? getComputedStyle(out).color : null, inAfter: inside ? getComputedStyle(inside, "::after").content : null,
    markBorder: ms ? ms.borderBottomWidth + " " + ms.borderBottomStyle : null, markBg: ms ? ms.backgroundColor : null,
    head: { text: document.getElementById("printHead").textContent, display: getComputedStyle(document.getElementById("printHead")).display }, printing: document.body.classList.contains("printing")
  };
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  let page = await newPage(ctx, url);

  /* 1. the start screen: no entry, nothing to print */
  const menu0 = await menuLabels(page);
  R.check("no Print entry on the start screen", !menu0.some((l) => /^Print/.test(l)), menu0.join(" / "));
  R.check("canPrint is false without a document", !(await page.evaluate(() => window.llPrint.canPrint())));

  /* 2. a text document in Pages flow with a highlight, an outbound link and the sheet open */
  await openFixture(page, "sample.md");
  await page.evaluate(() => {
    const t = document.getElementById("doc").textContent, i = t.indexOf("extraordinary");
    window.__ll.Marks.addHighlight(i, i + "extraordinary".length);
    document.querySelector("#doc p").insertAdjacentHTML("beforeend", ' See <a href="https://example.org/lamp">the lamp</a> and <a href="#chapter-2">chapter 2</a>.');
  });
  await setFlow(page, "pages"); await page.waitForTimeout(400);
  await page.keyboard.press("s"); await page.waitForTimeout(300);
  const before = await layout(page);
  R.check("on screen: columns, a fixed-height view, the theme's colours", before.columns !== "auto" && before.viewH < before.inner && before.bodyBg !== "rgb(255, 255, 255)" && before.head.display === "none", JSON.stringify(before));
  R.check("menu entry with a document open", (await menuLabels(page)).some((l) => /^Print…$/.test(l)));
  R.check("canPrint is true", await page.evaluate(() => window.llPrint.canPrint()));

  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(200);
  const p = await layout(page);
  R.check("print: header, sheet and pager not displayed", (await display(page, "header")) === "none" && (await display(page, "#sheet")) === "none" && (await display(page, "#pager")) === "none");
  R.check("print: the bars, panels and readouts not displayed", await page.evaluate(() => ["#tts", "#autoBar", "#side", "#progress", "#progressInfo", "#ruler", "#dictCard", "#dictPill", "#markPop", "#pdf", ".skip", "#empty", "#library"].every((s) => getComputedStyle(document.querySelector(s)).display === "none")));
  R.check("print: #doc has column-count auto", p.columns === "auto", p.columns);
  R.check("print: the view's height is auto (the inline height is overridden, the text runs down the page)", p.viewInline !== "" && Math.abs(p.viewH - p.docH) < 2 && p.docH > p.inner && !p.wide, JSON.stringify({ inline: p.viewInline, viewH: p.viewH, docH: p.docH, wide: p.wide }));
  R.check("print: black on white", p.bodyBg === "rgb(255, 255, 255)" && p.bodyColor === "rgb(0, 0, 0)" && p.docColor === "rgb(0, 0, 0)", p.bodyBg + " / " + p.bodyColor + " / " + p.docColor);
  R.check("print: 11pt text at 1.5", Math.abs(p.fontSize - 11 * 96 / 72) < 0.05 && Math.abs(p.lineHeight - p.fontSize * 1.5) < 0.1, p.fontSize + " / " + p.lineHeight);
  R.check("print: outbound link shows its address after it, in black", /attr\(href\)|example\.org/.test(p.outAfter || "") && p.outColor === "rgb(0, 0, 0)", p.outAfter + " " + p.outColor);
  R.check("print: an internal link shows nothing after it", p.inAfter === "none", String(p.inAfter));
  R.check("print: highlight has a visible border-bottom and a grey wash", p.markBorder === "1px solid" && p.markBg === "rgb(226, 226, 226)", p.markBorder + " " + p.markBg);
  R.check("print: the title line is empty and hidden until beforeprint", p.head.text === "" && p.head.display === "none");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const bp = await layout(page);
  R.check("beforeprint: #printHead shows the file name", bp.head.text === "sample.md" && bp.head.display === "block", JSON.stringify(bp.head));
  R.check("beforeprint: body.printing in Pages flow", bp.printing);
  await page.screenshot({ path: path.join(SHOTS, "print-desktop-day.png") });
  /* a dark theme prints the same */
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="dusk"]').click());
  await page.waitForTimeout(450);
  const dark = await layout(page);
  R.check("print: still black on white in a dark theme", dark.bodyBg === "rgb(255, 255, 255)" && dark.bodyColor === "rgb(0, 0, 0)", dark.bodyBg + " / " + dark.bodyColor);
  await page.screenshot({ path: path.join(SHOTS, "print-desktop-dusk.png") });
  /* afterprint while the print layout is still up (Chrome is back on the screen one by then, other
     browsers may not be): the pages are measured again only once the screen layout is back */
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.waitForTimeout(100);
  const ap = await layout(page);
  R.check("afterprint: the title line is cleared and body.printing gone", ap.head.text === "" && !ap.printing);
  R.check("afterprint under print media leaves the page count alone", (await page.evaluate(() => window.__ll.state.totalPages)) > 1);

  await page.emulateMedia({ media: "screen" });
  await page.waitForTimeout(300);
  const back = await layout(page);
  R.check("screen again: columns back, view height back, theme colours back", back.columns === before.columns && Math.abs(back.viewH - before.viewH) < 2 && back.bodyBg !== "rgb(255, 255, 255)", JSON.stringify({ columns: back.columns, viewH: back.viewH, bg: back.bodyBg }));
  R.check("screen again: the sheet is visible, the header and pager are back", (await display(page, "#sheet")) === "block" && (await display(page, "header")) !== "none" && (await display(page, "#pager")) === "flex");
  R.check("screen again: the page turns", await page.evaluate(() => { document.getElementById("nextPg").click(); return /^2 \//.test(document.getElementById("pgInfo").textContent); }));

  /* 3. the entry on a text document calls window.print() */
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click("#more");
  await page.click("#moreMenu button:has-text('Print')");
  await page.waitForTimeout(150);
  R.check("Print… on a text document calls window.print()", (await page.evaluate(() => window.__printed)) === 1 && !(await page.evaluate(() => document.getElementById("moreMenu").classList.contains("open"))));
  R.check("no page errors (text)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();

  /* 4. a PDF opens in a new tab from the menu entry, and from Ctrl/⌘+P. Headless Chromium has no
     PDF viewer: the new tab's navigation turns into a download of the blob: URL, so either counts */
  page = await newPage(ctx, url);
  await openFixture(page, "sample.pdf");
  R.check("pdf: menu entry shown", (await menuLabels(page)).some((l) => /^Print…$/.test(l)));
  const opened = async (act) => {
    const popup = ctx.waitForEvent("page", { timeout: 15000 }).catch(() => null);
    const download = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await act();
    const tab = await popup;
    const dl = await Promise.race([download, new Promise((r) => setTimeout(() => r(null), 4000))]);
    const urls = [tab && tab.url(), dl && dl.url()].filter(Boolean);
    if (tab) await tab.close().catch(() => null);
    return { tab: !!tab, urls };
  };
  const viaMenu = await opened(async () => { await page.click("#more"); await page.click("#moreMenu button:has-text('Print')"); });
  R.check("pdf: the entry opens a new tab on a blob: URL", viaMenu.tab && viaMenu.urls.some((u) => /^blob:http/.test(u)), JSON.stringify(viaMenu));
  R.check("pdf: the toast mentions the new tab", /new tab/.test(await toast(page)), await toast(page));
  const viaKey = await opened(async () => { await page.keyboard.press("Control+p"); });
  R.check("pdf: Ctrl+P opens the PDF in a new tab instead of printing the reader", viaKey.tab && viaKey.urls.some((u) => /^blob:http/.test(u)), JSON.stringify(viaKey));
  R.check("no page errors (pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await ctx.close();

  /* 5. phone width: the print layout is the same one-column page */
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await newPage(phone, url);
  await openFixture(page, "sample.md");
  await page.evaluate(() => { const t = document.getElementById("doc").textContent, i = t.indexOf("extraordinary"); window.__ll.Marks.addHighlight(i, i + 13); });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.waitForTimeout(200);
  const ph = await layout(page);
  R.check("phone print: one column, black on white, title line", ph.columns === "auto" && ph.bodyBg === "rgb(255, 255, 255)" && ph.head.text === "sample.md" && !ph.wide, JSON.stringify({ columns: ph.columns, bg: ph.bodyBg, head: ph.head, wide: ph.wide }));
  await page.screenshot({ path: path.join(SHOTS, "print-phone-day.png") });
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="dusk"]').click());
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(SHOTS, "print-phone-dusk.png") });
  R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await phone.close();

  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
