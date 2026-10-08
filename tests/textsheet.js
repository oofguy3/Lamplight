/* The Text sheet on a phone (560px and narrower): a close button in its head, a big A− / A+
   stepper instead of the squeezed slider (ends marked aria-disabled, the value without "px"),
   line spacing and margins as three choices each (a saved value in between shows "Custom"), four
   fonts at a tap plus All fonts, Fine-tune for the fine controls, and PDFs with Zoom. Desktop keeps
   today's popover.   NODE_PATH=$(npm root -g) node tests/textsheet.js */
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");

const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length > 0; }, sel);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const attr = (page, sel, a) => page.$eval(sel, (e, x) => e.getAttribute(x), a);
const st = (page) => page.evaluate(() => window.__ll.state);
const openText = async (page) => { await page.evaluate(() => document.getElementById("gear").click()); await page.waitForTimeout(250); };
const isOpen = (page) => page.evaluate(() => window.llPop.is("type"));
const focusId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
/* a real tap even on an end that is aria-disabled (Playwright would otherwise wait for it to be enabled) */
const press = async (page, sel, n) => { for (let i = 0; i < (n || 1); i++){ await page.click(sel, { force: true }); await page.waitForTimeout(40); } };

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };

  /* ---------- phone, the library screen ---------- */
  let ctx = await b.newContext(PHONE);
  let page = await newPage(ctx, url);
  await openText(page);
  R.check("phone: the Text sheet opens", await isOpen(page));
  const w1 = await page.$eval("#smaller", (e) => e.getBoundingClientRect().width), w2 = await page.$eval("#bigger", (e) => e.getBoundingClientRect().width);
  R.check("phone: size slider hidden, steppers 56px", !(await shown(page, "#qSize")) && w1 >= 56 && w2 >= 56, w1 + "/" + w2);
  R.check("phone: value reads 19 without px", (await text(page, "#qSizeV")) === "19", await text(page, "#qSizeV"));
  const val = await page.$eval("#qSizeV", (e) => ({ ff: getComputedStyle(e).fontFamily, live: e.getAttribute("aria-live") }));
  R.check("phone: the value is in the reading font and read out as it changes", /Georgia/.test(val.ff) && val.live === "polite", JSON.stringify(val));
  const above = await page.evaluate(() => { const l = document.getElementById("qSizeL").getBoundingClientRect(), s = document.querySelector(".prow-size .prow-in").getBoundingClientRect(),
    fl = document.getElementById("qFlowL").getBoundingClientRect(), f = document.getElementById("qFlow").getBoundingClientRect(); return l.bottom <= s.top && fl.bottom <= f.top; });
  R.check("phone: labels sit above their controls (Size, Flow)", above);
  R.check("phone: focus starts on A−", (await focusId(page)) === "smaller", await focusId(page));
  await page.focus("#bigger");
  for (let i = 0; i < 10; i++){ await page.keyboard.press("Enter"); await page.waitForTimeout(30); }
  R.check("A+ to 28: A+ aria-disabled and still focused", (await st(page)).size === 28 && (await attr(page, "#bigger", "aria-disabled")) === "true" && (await focusId(page)) === "bigger",
    (await st(page)).size + " " + (await attr(page, "#bigger", "aria-disabled")) + " " + (await focusId(page)));
  await press(page, "#smaller", 16);
  R.check("A− to 14: A− aria-disabled", (await st(page)).size === 14 && (await attr(page, "#smaller", "aria-disabled")) === "true" && (await attr(page, "#bigger", "aria-disabled")) !== "true");
  await press(page, "#bigger", 5);
  R.check("phone: the close button closes the sheet", (await shown(page, "#typeClose")) && (await page.tap("#typeClose"), await page.waitForTimeout(200), !(await isOpen(page))));
  R.check("…and focus goes back to the Aa button", (await focusId(page)) === "gear", await focusId(page));
  R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  /* ---------- 320px: nothing pokes past the sheet ---------- */
  ctx = await b.newContext(Object.assign({}, PHONE, { viewport: { width: 320, height: 640 } }));
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await openText(page);
  const fit = await page.evaluate(() => { const p = document.getElementById("pop"), r = p.getBoundingClientRect(), bg = document.getElementById("bigger").getBoundingClientRect(); return { sw: p.scrollWidth, cw: p.clientWidth, right: Math.round(bg.right), edge: Math.round(r.right) }; });
  R.check("320px: no sideways scroll, A+ inside the sheet", fit.sw <= fit.cw && fit.right <= fit.edge, JSON.stringify(fit));
  await page.close(); await ctx.close();

  /* ---------- phone, a PDF: Zoom in the stepper ---------- */
  ctx = await b.newContext(PHONE);
  page = await newPage(ctx, url);
  await openFixture(page, "sample.pdf");
  await openText(page);
  R.check("PDF phone: the value reads 100 %", (await text(page, "#qSizeV")) === "100 %", await text(page, "#qSizeV"));
  await press(page, "#smaller", 5);
  R.check("PDF phone: zoom 60% disables A−", Math.round((await st(page)).zoom * 100) === 60 && (await attr(page, "#smaller", "aria-disabled")) === "true", Math.round((await st(page)).zoom * 100) + " " + (await attr(page, "#smaller", "aria-disabled")));
  R.check("no page errors (pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  /* ---------- desktop keeps today's popover ---------- */
  ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await page.click("#gear"); await page.waitForTimeout(200);
  R.check("desktop: slider shown, '19 px', no close button", (await shown(page, "#qSize")) && (await text(page, "#qSizeV")) === "19 px" && !(await shown(page, "#typeClose")), (await text(page, "#qSizeV")));
  R.check("desktop: the value is not a live region (the slider says its own value)", (await attr(page, "#qSizeV", "aria-live")) !== "polite");
  R.check("desktop: focus starts on the size slider", (await focusId(page)) === "qSize", await focusId(page));
  /* a window dragged narrower with the pane open: it becomes the phone sheet, value and all */
  await page.setViewportSize({ width: 500, height: 800 }); await page.waitForTimeout(250);
  const narrow = { v: await text(page, "#qSizeV"), live: await attr(page, "#qSizeV", "aria-live"), slider: await shown(page, "#qSize") };
  await page.setViewportSize({ width: 1200, height: 800 }); await page.waitForTimeout(250);
  R.check("across 560px with the pane open: '19' and read out, then '19 px' again", narrow.v === "19" && narrow.live === "polite" && !narrow.slider && (await text(page, "#qSizeV")) === "19 px" && (await attr(page, "#qSizeV", "aria-live")) !== "polite", JSON.stringify(narrow));
  R.check("no page errors (desktop)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
