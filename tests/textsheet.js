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

  /* ---------- phone: line spacing and margins as three choices each ---------- */
  ctx = await b.newContext(PHONE);
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await openText(page);
  const choices = (sel) => page.$$eval(sel + " button", (bs) => bs.map((x) => x.textContent.trim() + (x.getAttribute("aria-pressed") === "true" ? "*" : "")).join());
  const capOf = (sel) => page.$eval(sel, (e) => (e.hidden || getComputedStyle(e).display === "none") ? "" : e.textContent.trim());
  const tapOn = async (sel) => { await page.tap(sel); await page.waitForTimeout(80); };
  R.check("phone: Line spacing Tight / Normal / Airy, Margins Narrow / Medium / Wide, the defaults pressed",
    (await choices("#qLhChoices")) === "Tight,Normal*,Airy" && (await choices("#qMgChoices")) === "Narrow*,Medium,Wide", (await choices("#qLhChoices")) + " | " + (await choices("#qMgChoices")));
  R.check("phone: each group is labelled, and the Spacing and Width sliders are gone", (await page.$eval("#qLhChoices", (g) => document.getElementById(g.getAttribute("aria-labelledby")).textContent.trim())) === "Line spacing" &&
    (await page.$eval("#qMgChoices", (g) => document.getElementById(g.getAttribute("aria-labelledby")).textContent.trim())) === "Margins" && !(await shown(page, "#qLh")) && !(await shown(page, "#qW")));
  const tall = await page.$$eval("#qLhChoices button, #qMgChoices button", (bs) => bs.map((x) => Math.round(x.getBoundingClientRect().height)));
  R.check("phone: every choice is at least 48px tall, with its pictogram", tall.every((h) => h >= 48) && (await page.$$eval("#qLhChoices button svg, #qMgChoices button svg", (s) => s.length)) === 6, tall.join(","));
  await tapOn('#qLhChoices [data-lh="1.5"]');
  R.check("Tight sets lh 1.5 and is pressed", (await st(page)).lh === 1.5 && (await choices("#qLhChoices")) === "Tight*,Normal,Airy", (await st(page)).lh);
  await tapOn('#qLhChoices [data-lh="2"]');
  R.check("Airy sets lh 2", (await st(page)).lh === 2 && (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lh").trim())) === "2");
  await tapOn('#qMgChoices [data-mg="28"]');
  R.check("Wide sets margin 28, and the page shows it", (await st(page)).margin === 28 && (await page.$eval("#docView", (d) => getComputedStyle(d).paddingLeft)) === "28px", (await st(page)).margin);
  /* values set elsewhere (the full settings, an older version) that match no choice */
  await page.evaluate(() => { window.__ll.state.lh = 1.6; window.llType.apply(); }); await page.waitForTimeout(60);
  R.check("saved lh 1.6: nothing pressed, 'Custom 1.6'", (await choices("#qLhChoices")) === "Tight,Normal,Airy" && (await capOf("#qLhCustom")) === "Custom 1.6", await capOf("#qLhCustom"));
  await page.evaluate(() => { window.__ll.state.lh = 1.55; window.llType.apply(); }); await page.waitForTimeout(60);
  R.check("saved lh 1.55: 'Custom 1.55'", (await capOf("#qLhCustom")) === "Custom 1.55", await capOf("#qLhCustom"));
  await page.evaluate(() => { window.__ll.state.margin = 20; window.llType.apply(); }); await page.waitForTimeout(60);
  R.check("saved margin 20: nothing pressed, 'Custom'", (await choices("#qMgChoices")) === "Narrow,Medium,Wide" && (await capOf("#qMgCustom")) === "Custom", await capOf("#qMgCustom"));
  R.check("…and nothing snaps until a tap", (await st(page)).lh === 1.55 && (await st(page)).margin === 20);
  await tapOn('#qLhChoices [data-lh="1.75"]');
  R.check("a tap on a choice clears the caption", (await capOf("#qLhCustom")) === "" && (await choices("#qLhChoices")) === "Tight,Normal*,Airy");
  /* a saved width narrower than this screen's column would hide the margins: a margin tap restores it */
  await page.evaluate(() => { window.__ll.state.width = 320; window.llType.apply(); }); await page.waitForTimeout(60);
  await tapOn('#qMgChoices [data-mg="12"]');
  R.check("width 320 then Medium: width 720, margin 12", (await st(page)).width === 720 && (await st(page)).margin === 12, JSON.stringify({ w: (await st(page)).width, m: (await st(page)).margin }));
  await page.evaluate(() => { window.__ll.state.width = 600; window.llType.apply(); }); await page.waitForTimeout(60);
  await tapOn('#qMgChoices [data-mg="0"]');
  R.check("a width wider than the column is kept (600)", (await st(page)).width === 600 && (await st(page)).margin === 0);
  await page.evaluate(() => { window.__ll.state.lh = 1.4; window.__ll.state.margin = 40; window.llType.apply(); window.llType.reset(); }); await page.waitForTimeout(80);
  R.check("Reset presses Normal and Narrow", (await choices("#qLhChoices")) === "Tight,Normal*,Airy" && (await choices("#qMgChoices")) === "Narrow*,Medium,Wide" && (await capOf("#qLhCustom")) === "" && (await capOf("#qMgCustom")) === "");
  R.check("no page errors (choices)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  /* ---------- phone, in Dutch ---------- */
  ctx = await b.newContext(Object.assign({ locale: "nl-NL" }, PHONE));
  await ctx.addInitScript(() => { try { localStorage.setItem("ll_i18n_debug", "1"); } catch(_){} });
  page = await newPage(ctx, url);
  const noDutch = new Set();
  page.on("console", (m) => { const k = /^\[i18n\] no Dutch for: ([\s\S]*)$/.exec(m.text()); if (k) noDutch.add(k[1]); });
  await openFixture(page, "sample.md");
  await page.evaluate(() => { window.__ll.state.lh = 1.6; window.__ll.state.margin = 20; window.llType.apply(); });
  await openText(page);
  R.check("Dutch: 'Aangepast 1,6' and 'Aangepast'", (await capOf("#qLhCustom")) === "Aangepast 1,6" && (await capOf("#qMgCustom")) === "Aangepast", (await capOf("#qLhCustom")) + " | " + (await capOf("#qMgCustom")));
  R.check("Dutch: Krap / Normaal / Ruim and Smal / Gemiddeld / Breed", (await choices("#qLhChoices")) === "Krap,Normaal,Ruim" && (await choices("#qMgChoices")) === "Smal,Gemiddeld,Breed", (await choices("#qLhChoices")) + " | " + (await choices("#qMgChoices")));
  R.check("Dutch: the close button is 'Tekstinstellingen sluiten'", (await attr(page, "#typeClose", "aria-label")) === "Tekstinstellingen sluiten");
  R.check("Dutch: nothing in the Text sheet lacks Dutch", ![...noDutch].some((k) => /Line spacing|Tight|Normal|Airy|Narrow|Wide|Custom|Close text settings/.test(k)), [...noDutch].join(" | "));
  await page.close(); await ctx.close();

  /* ---------- phone: four fonts at a tap, and All fonts ---------- */
  ctx = await b.newContext(PHONE);
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await openText(page);
  const rowIds = () => page.$$eval("#fontRow [data-font]", (bs) => bs.map((x) => x.dataset.font + (x.getAttribute("aria-pressed") === "true" ? "*" : "")).join());
  R.check("font row: serif, literata, hyper, sans, Georgia pressed", (await rowIds()) === "serif*,literata,hyper,sans", await rowIds());
  const tiles = await page.$$eval("#fontRow [data-font]", (bs) => bs.map((x) => ({ name: x.textContent.replace(/^Aa/, "").trim(), aa: getComputedStyle(x.querySelector(".aa")).fontFamily, fs: getComputedStyle(x.querySelector(".fn")).fontSize })));
  R.check("each tile: 'Aa' in its own face, the name under it at 13px", tiles.map((t) => t.name).join("|") === "Georgia|Literata|Atkinson Hyperlegible|System sans" &&
    /^Georgia/.test(tiles[0].aa) && /^"?Literata/.test(tiles[1].aa) && /^"?Atkinson Hyperlegible/.test(tiles[2].aa) && tiles.every((t) => t.fs === "13px"), JSON.stringify(tiles));
  R.check("the row is labelled Font, and the select is not shown", (await page.$eval("#fontRow", (g) => document.getElementById(g.getAttribute("aria-labelledby")).textContent.trim())) === "Font" && !(await shown(page, "#fontQuick")));
  R.check("opening the sheet fetched Literata's preview face", await page.waitForFunction(() => window.llFonts.loaded("literata"), null, { timeout: 8000 }).then(() => true, () => false));
  await page.tap('#fontRow [data-font="literata"]'); await page.waitForTimeout(100);
  R.check("tap Literata sets the font", (await st(page)).font === "literata" && (await rowIds()) === "serif,literata*,hyper,sans", await rowIds());
  await page.evaluate(() => { window.__ll.state.font = "lora"; window.llType.apply(); }); await page.waitForTimeout(100);
  R.check("with Lora in use: the fourth is Lora, pressed", (await rowIds()) === "serif,literata,hyper,lora*", await rowIds());
  await page.tap('#fontRow [data-font="serif"]'); await page.waitForTimeout(100);
  R.check("back to Georgia: System sans returns, and focus stays on Georgia", (await rowIds()) === "serif*,literata,hyper,sans" && (await page.evaluate(() => document.activeElement && document.activeElement.dataset.font)) === "serif", (await rowIds()) + " " + (await page.evaluate(() => document.activeElement && (document.activeElement.dataset.font || document.activeElement.id))));
  /* All fonts: the panel, a pick there, and back to the sheet */
  await page.tap("#allFonts"); await page.waitForTimeout(400);
  const inPanel = await page.evaluate(() => ({ side: document.getElementById("side").classList.contains("open"), title: document.getElementById("sideTitle").textContent, pop: window.llPop.is("type") }));
  R.check("All fonts opens the Fonts panel in place of the sheet", inPanel.side && inPanel.title === "Fonts" && !inPanel.pop, JSON.stringify(inPanel));
  await page.evaluate(() => document.querySelector('#sideBody .font-item[data-font="merriweather"]').click()); await page.waitForTimeout(100);
  await page.tap("#sideClose"); await page.waitForTimeout(400);
  R.check("closing the panel returns to the Text sheet, focus on All fonts", (await isOpen(page)) && (await focusId(page)) === "allFonts" && !(await page.$eval("#side", (s) => s.classList.contains("open"))), (await isOpen(page)) + " " + (await focusId(page)));
  R.check("…with the pick in the fourth place, pressed", (await rowIds()) === "serif,literata,hyper,merriweather*", await rowIds());
  await page.tap("#allFonts"); await page.waitForTimeout(400);
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  R.check("Escape on the panel also comes back to the sheet", (await isOpen(page)) && (await focusId(page)) === "allFonts", (await isOpen(page)) + " " + (await focusId(page)));
  /* a one-word name breaks where its second part starts */
  await page.evaluate(() => { window.__ll.state.font = "dyslexic"; window.llType.apply(); }); await page.waitForTimeout(100);
  const dys = await page.$eval('#fontRow [data-font="dyslexic"] .fn', (n) => [...n.querySelectorAll(".w")].map((w) => w.textContent + "@" + Math.round(w.getBoundingClientRect().top)));
  R.check("OpenDyslexic reads Open / Dyslexic on two lines", dys.length === 2 && dys[0].startsWith("Open@") && dys[1].startsWith("Dyslexic@") && dys[0].split("@")[1] !== dys[1].split("@")[1], dys.join(" "));
  R.check("no page errors (fonts)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  /* ---------- 320px: the row stays inside the sheet, names inside their tiles ---------- */
  ctx = await b.newContext(Object.assign({}, PHONE, { viewport: { width: 320, height: 640 } }));
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await openText(page);
  const row320 = await page.evaluate(() => { const p = document.getElementById("pop").getBoundingClientRect(), r = document.getElementById("fontRow").getBoundingClientRect();
    const spill = [...document.querySelectorAll("#fontRow [data-font]")].filter((b) => { const br = b.getBoundingClientRect(); return [...b.querySelectorAll(".w")].some((w) => { const wr = w.getBoundingClientRect(); return wr.left < br.left - 0.5 || wr.right > br.right + 0.5; }); }).map((b) => b.dataset.font);
    return { right: Math.round(r.right), edge: Math.round(p.right), spill }; });
  R.check("320px: the row stays inside the sheet, every name inside its tile", row320.right <= row320.edge && row320.spill.length === 0, JSON.stringify(row320));
  await page.close(); await ctx.close();

  /* ---------- phone: Fine-tune last, and the whole sheet within 85% of the screen ---------- */
  ctx = await b.newContext(PHONE);
  await ctx.addInitScript(() => { try { localStorage.setItem("ll_tip_doc", "1"); } catch(_){} });
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await openText(page);
  const sum = await page.evaluate(() => { const s = document.querySelector("#qMore summary"), vis = (el) => !!el && el.getClientRects().length > 0;
    return { t: (s.querySelector(".ft-t") || {}).textContent, n: (s.querySelector(".ft-n") || {}).textContent, more: vis(s.querySelector(".ft-more")), open: document.getElementById("qMore").open }; });
  R.check("phone: Fine-tune with its second line, closed", sum.t === "Fine-tune" && sum.n === "Weight, letter and word spacing, focus reading" && !sum.more && !sum.open, JSON.stringify(sum));
  const order = await page.evaluate(() => { const kids = [...document.getElementById("typePop").children].filter((k) => k.getClientRects().length); const at = (el) => kids.indexOf(el);
    return { flow: at(document.getElementById("qFlow").closest(".prow")), more: at(document.getElementById("qMore")), link: at(document.getElementById("typeMore")), font: at(document.getElementById("fontRow").closest(".prow")) }; });
  R.check("phone: Fine-tune comes after Flow, just before All text settings", order.font < order.flow && order.flow < order.more && order.more === order.link - 1, JSON.stringify(order));
  const fitH = await page.evaluate(() => { const p = document.getElementById("pop"), r = p.getBoundingClientRect(); return { h: Math.round(r.height), sh: p.scrollHeight, ch: p.clientHeight }; });
  R.check("390×844 with Fine-tune closed: the sheet fits 85% of the screen, nothing scrolls inside", fitH.h <= 844 * 0.85 + 1 && fitH.sh <= fitH.ch + 1, JSON.stringify(fitH));
  await page.tap("#qMore summary"); await page.waitForTimeout(200);
  const fitO = await page.evaluate(() => { const p = document.getElementById("pop"), r = p.getBoundingClientRect(); return { h: Math.round(r.height), sh: p.scrollHeight, ch: p.clientHeight }; });
  R.check("Fine-tune open: the sheet stays within 85% and scrolls inside", fitO.h <= 844 * 0.85 + 1 && fitO.sh > fitO.ch, JSON.stringify(fitO));
  R.check("no page errors (fine-tune)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  /* ---------- phone, a PDF: Zoom in the stepper ---------- */
  ctx = await b.newContext(PHONE);
  page = await newPage(ctx, url);
  await openFixture(page, "sample.pdf");
  await openText(page);
  R.check("PDF phone: the value reads 100 %", (await text(page, "#qSizeV")) === "100 %", await text(page, "#qSizeV"));
  R.check("PDF phone: no line spacing or margin choices", !(await shown(page, "#qLhChoices")) && !(await shown(page, "#qMgChoices")));
  await press(page, "#smaller", 5);
  R.check("PDF phone: zoom 60% disables A−", Math.round((await st(page)).zoom * 100) === 60 && (await attr(page, "#smaller", "aria-disabled")) === "true", Math.round((await st(page)).zoom * 100) + " " + (await attr(page, "#smaller", "aria-disabled")));
  R.check("PDF phone: Soften pages and Flow, no Fine-tune", (await shown(page, "#qSoften")) && (await shown(page, "#qFlow")) && !(await shown(page, "#qMore")));
  await page.tap("#typeMore"); await page.waitForTimeout(500);
  R.check("PDF: All text settings opens the PDF section", !(await isOpen(page)) && (await page.evaluate(() => document.getElementById("sheet").classList.contains("open") && (document.querySelector("#sheetTabs .on") || {}).dataset.group)) === "pdfGroup",
    await page.evaluate(() => (document.querySelector("#sheetTabs .on") || {}).dataset && document.querySelector("#sheetTabs .on").dataset.group));
  R.check("no page errors (pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close(); await ctx.close();

  /* ---------- desktop keeps today's popover ---------- */
  ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
  page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await page.click("#gear"); await page.waitForTimeout(200);
  R.check("desktop: slider shown, '19 px', no close button", (await shown(page, "#qSize")) && (await text(page, "#qSizeV")) === "19 px" && !(await shown(page, "#typeClose")), (await text(page, "#qSizeV")));
  R.check("desktop: the value is not a live region (the slider says its own value)", (await attr(page, "#qSizeV", "aria-live")) !== "polite");
  R.check("desktop: Spacing and Width sliders, no choices", (await shown(page, "#qLh")) && (await shown(page, "#qW")) && !(await shown(page, "#qLhChoices")) && !(await shown(page, "#qMgChoices")));
  R.check("desktop: the font select, no font row, no previews fetched", (await shown(page, "#fontQuick")) && !(await shown(page, "#fontRow")) && !(await shown(page, "#allFonts")) && !(await page.evaluate(() => window.llFonts.loaded("literata"))));
  const deskMore = await page.evaluate(() => { const s = document.querySelector("#qMore summary"), vis = (el) => !!el && el.getClientRects().length > 0; const kids = [...document.getElementById("typePop").children];
    return { more: vis(s.querySelector(".ft-more")) && s.querySelector(".ft-more").textContent, ft: vis(s.querySelector(".ft")), before: kids.indexOf(document.getElementById("qMore")) < kids.indexOf(document.getElementById("fontQuick").closest(".prow")) }; });
  R.check("desktop: still More, where it was (before Font)", deskMore.more === "More" && !deskMore.ft && deskMore.before, JSON.stringify(deskMore));
  R.check("settings sheet: 'Line spacing'", (await page.$eval("label[for=rLh]", (l) => l.textContent.trim())) === "Line spacing" && (await page.$eval("label[for=qLh]", (l) => l.textContent.trim())) === "Spacing");
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
