/* Zen mode: z and the menu entry hide everything but the text and the progress line; the pages
   grow to the viewport and still turn; a middle tap only reminds how to leave; Escape closes
   what is open first and leaves zen second; the reading position survives; h and the browser's
   own fullscreen exit leave too. Screenshots at desktop and phone width, light and dark, go to
   $LL_SHOTS (default: the OS temp dir).   NODE_PATH=$(npm root -g) node tests/zen.js */
const path = require("path"), fs = require("fs"), os = require("os");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-zen");

/* headless Chromium never really goes fullscreen; the desktop context has no Fullscreen API at all
   (as on iOS Safari), so document.fullscreenElement stays null and the fullscreenchange path can be
   driven by hand. The dictionary is on hold-to-explain so a middle click lands on the tap zones. */
const NO_FULLSCREEN = `(function(){
  delete Element.prototype.requestFullscreen; delete Document.prototype.exitFullscreen;
  try { localStorage.setItem("ll_dictmode", "hold"); } catch(_){}
})();`;

const headerH = (page) => page.evaluate(() => document.querySelector("header").getBoundingClientRect().height);
const zenOn = (page) => page.evaluate(() => document.body.classList.contains("zen") && window.llZen.isOn());
const viewH = (page, sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, sel);
const pgInfo = (page) => page.$eval("#pgInfo", (e) => e.textContent);
/* on screen: neither the element nor an ancestor is display:none */
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0; }, sel);
/* the flow chips work through their click handler whether or not the sheet is open */
const setFlow = (page, f) => page.evaluate((f) => document.querySelector('#flowChips [data-flow="' + f + '"]').click(), f);
const menuLabels = (page) => page.evaluate(() => { document.getElementById("more").click(); const items = Array.from(document.querySelectorAll("#moreMenu button")).map((b) => b.textContent); document.getElementById("more").click(); return items; });
async function watchToasts(page){
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver((muts) => muts.forEach((m) => { if (m.target.id === "toast" && m.target.textContent) window.__toasts.push(m.target.textContent); }))
      .observe(document.body, { childList: true, subtree: true });
  });
}
const toasts = (page, re) => page.evaluate((src) => window.__toasts.filter((t) => new RegExp(src).test(t)), re.source);
/* a click in the middle of the page view, on whatever is there (no word lookup: the dictionary is on hold) */
async function clickView(page, sel, fx){
  const box = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  await page.mouse.click(box.x + box.w * fx, box.y + box.h * 0.5);
  await page.waitForTimeout(250);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();

  /* ---------- desktop ---------- */
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(NO_FULLSCREEN);
  let page = await newPage(ctx, url);
  await watchToasts(page);

  /* 1. the start screen: no entry, and z does nothing */
  R.check("menu has no zen entry on the start screen", !(await menuLabels(page)).some((l) => /Zen/.test(l)));
  await page.keyboard.press("z"); await page.waitForTimeout(100);
  R.check("z does nothing without a document", !(await zenOn(page)));

  /* 2. scroll flow: what goes, what stays, the position, the bar stays away on scroll-up */
  await openFixture(page, "sample.md");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.4));
  await page.waitForTimeout(300);
  const off0 = await page.evaluate(() => window.__ll.Library.topCharOffset());
  const h0 = await headerH(page);
  await page.keyboard.press("z"); await page.waitForTimeout(300);
  R.check("z enters zen", await zenOn(page));
  R.check("header hidden", (await headerH(page)) === 0 && !(await shown(page, "header")));
  R.check("progress line still shown", await page.evaluate(() => { const p = document.getElementById("progress"); return getComputedStyle(p).display !== "none" && p.getBoundingClientRect().height === 3; }));
  R.check("pager, readout, sheet and streak hidden", !(await shown(page, "#pager")) && !(await shown(page, "#pgInfo")) && !(await shown(page, "#progressInfo")) && !(await shown(page, "#sheet")) && !(await shown(page, "#streak")));
  R.check("first entry shows the toast", (await toasts(page, /^Zen mode — press z or Esc to leave$/)).length === 1, JSON.stringify(await toasts(page, /./)));
  const off1 = await page.evaluate(() => window.__ll.Library.topCharOffset());
  R.check("scroll flow keeps the place on entering", Math.abs(off1 - off0) < 300, off0 + " -> " + off1);
  const labels = await menuLabels(page);
  R.check("menu entry reads Leave zen mode", labels.some((l) => /^Leave zen mode\s*Z$/.test(l)), labels.join(" / "));
  /* scrolling down then well up brings the bar back in scroll flow — not in zen */
  await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(120);
  await page.evaluate(() => window.scrollBy(0, -60)); await page.waitForTimeout(60);
  await page.evaluate(() => window.scrollBy(0, -60)); await page.waitForTimeout(60);
  await page.evaluate(() => window.scrollBy(0, -60)); await page.waitForTimeout(60);
  await page.evaluate(() => window.scrollBy(0, -60)); await page.waitForTimeout(200);
  R.check("scroll-up does not bring the bar back", (await headerH(page)) === 0);
  await page.evaluate(() => window.scrollBy(0, 240)); await page.waitForTimeout(300);
  await page.waitForTimeout(400);                     /* the toast fades before the picture */
  await page.screenshot({ path: path.join(SHOTS, "zen-desktop-day.png") });
  const off2 = await page.evaluate(() => window.__ll.Library.topCharOffset());
  await page.keyboard.press("z"); await page.waitForTimeout(300);
  R.check("z leaves zen and the header is back", !(await zenOn(page)) && (await headerH(page)) === h0, String(await headerH(page)));
  const off3 = await page.evaluate(() => window.__ll.Library.topCharOffset());
  R.check("scroll flow keeps the place on leaving", Math.abs(off3 - off2) < 300, off2 + " -> " + off3);
  R.check("menu entry reads Zen mode again", (await menuLabels(page)).some((l) => /^Zen mode\s*Z$/.test(l)));
  R.check("the toast is shown once per session", (await page.evaluate(() => { window.llZen.enter(); window.llZen.exit(); return window.__toasts.filter((t) => /^Zen mode/.test(t)).length; })) === 1);

  /* 3. pages flow: the whole viewport, keys and taps */
  await setFlow(page, "pages"); await page.waitForTimeout(400);
  const paged0 = await viewH(page, "#docView");
  await page.keyboard.press("z"); await page.waitForTimeout(400);
  const paged1 = await viewH(page, "#docView");
  const inner = await page.evaluate(() => window.innerHeight);
  R.check("pages grow to the viewport minus the padding", Math.abs(paged1 - (inner - 26)) <= 2 && paged1 > paged0 + 80, paged0 + " -> " + paged1 + " of " + inner);
  R.check("--pagerH is 0 in zen", (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pagerH").trim())) === "0px");
  await page.keyboard.press("Home"); await page.waitForTimeout(300);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400);
  R.check("ArrowRight still turns the page", /^2 \//.test(await pgInfo(page)), await pgInfo(page));
  await clickView(page, "#docView", 0.5);
  R.check("middle tap does not toggle the bars", (await zenOn(page)) && !(await page.evaluate(() => document.body.classList.contains("immersive"))) && Math.abs((await viewH(page, "#docView")) - paged1) <= 1);
  R.check("middle tap shows the hint once", (await toasts(page, /^Press z or Esc to leave zen mode$/)).length === 1);
  await clickView(page, "#docView", 0.5);
  R.check("second middle tap: no second hint", (await toasts(page, /^Press z or Esc to leave zen mode$/)).length === 1);
  await clickView(page, "#docView", 0.85);
  R.check("edge tap still turns the page", /^3 \//.test(await pgInfo(page)), await pgInfo(page));
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="dusk"]').click());
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(SHOTS, "zen-desktop-dusk-pages.png") });
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="day"]').click());

  /* 4. Escape: the card, the panel and the (hidden) sheet first, zen second */
  await page.evaluate(() => window.llDict.defineWord("quietly"));
  await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open"), null, { timeout: 25000 });
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  R.check("Escape closes the dictionary card first", !(await page.evaluate(() => document.getElementById("dictCard").classList.contains("open"))) && (await zenOn(page)));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  R.check("second Escape leaves zen", !(await zenOn(page)) && (await headerH(page)) > 0 && (await shown(page, "#pgInfo")));
  R.check("pages shrink back under the bars", Math.abs((await viewH(page, "#docView")) - paged0) <= 2, String(await viewH(page, "#docView")));
  await page.keyboard.press("z"); await page.waitForTimeout(200);
  await page.keyboard.press("?"); await page.waitForTimeout(300);
  const help = await page.$eval("#sideBody", (b) => Array.from(b.querySelectorAll(".key-row")).map((r) => r.textContent.trim()));
  R.check("keyboard help lists z", help.some((r) => /^z\s*Zen mode/.test(r)), help.filter((r) => /zen/i.test(r)).join(" | "));
  await page.keyboard.press("Escape"); await page.waitForTimeout(350);
  R.check("Escape closes the panel first", !(await page.evaluate(() => document.getElementById("side").classList.contains("open"))) && (await zenOn(page)));
  await page.keyboard.press("s"); await page.waitForTimeout(150);
  R.check("the sheet stays hidden in zen", !(await shown(page, "#sheet")));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  R.check("Escape with only the hidden sheet leaves zen, sheet closed", !(await zenOn(page)) && !(await page.evaluate(() => document.getElementById("sheet").classList.contains("open"))));

  /* 5. the browser's own way out of fullscreen leaves zen */
  await page.keyboard.press("z"); await page.waitForTimeout(200);
  await page.evaluate(() => document.dispatchEvent(new Event("fullscreenchange")));
  await page.waitForTimeout(200);
  R.check("fullscreenchange with no fullscreen element leaves zen", !(await zenOn(page)) && (await page.evaluate(() => document.fullscreenElement === null)));

  /* 6. h leaves zen and goes home */
  await page.keyboard.press("z"); await page.waitForTimeout(200);
  await page.keyboard.press("h"); await page.waitForTimeout(300);
  R.check("h leaves zen and opens the library", !(await zenOn(page)) && (await headerH(page)) > 0 && (await page.$eval("#library", (l) => l.classList.contains("show"))));
  R.check("no page errors (desktop)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();

  /* 7. a PDF in pages flow */
  page = await newPage(ctx, url);
  await openFixture(page, "sample.pdf");
  await setFlow(page, "pages"); await page.waitForTimeout(700);
  const pdf0 = await viewH(page, "#pdf");
  await page.keyboard.press("z"); await page.waitForTimeout(700);
  const pdf1 = await viewH(page, "#pdf");
  R.check("pdf pages grow to the viewport", Math.abs(pdf1 - (800 - 26)) <= 2 && pdf1 > pdf0 + 80, pdf0 + " -> " + pdf1);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(600);
  R.check("pdf page turns in zen", /^(2|3|2–3|3–4) \//.test(await pgInfo(page)), await pgInfo(page));
  await page.keyboard.press("z"); await page.waitForTimeout(700);
  R.check("pdf pages shrink back", Math.abs((await viewH(page, "#pdf")) - pdf0) <= 2);
  R.check("no page errors (pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await ctx.close();

  /* ---------- phone, with the real Fullscreen API left in place ---------- */
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await newPage(phone, url);
  await openFixture(page, "sample.md");
  await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(200);
  await page.keyboard.press("z"); await page.waitForTimeout(500);
  R.check("phone: zen on, header gone", (await zenOn(page)) && (await headerH(page)) === 0);
  R.check("phone: the text keeps a top inset", (await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("main")).paddingTop))) === 14);
  await page.waitForTimeout(1900);
  await page.screenshot({ path: path.join(SHOTS, "zen-phone-day.png") });
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="dusk"]').click());
  await setFlow(page, "pages"); await page.waitForTimeout(500);
  R.check("phone: pages fill the screen", Math.abs((await viewH(page, "#docView")) - (844 - 26)) <= 2, String(await viewH(page, "#docView")));
  await page.screenshot({ path: path.join(SHOTS, "zen-phone-dusk-pages.png") });
  await page.keyboard.press("z"); await page.waitForTimeout(400);
  R.check("phone: z leaves, no fullscreen left behind", !(await zenOn(page)) && (await page.evaluate(() => !document.fullscreenElement)));
  R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await phone.close();

  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
