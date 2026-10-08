/* The interface's look: the chrome is set in Atkinson Hyperlegible (bundled, as 'LL UI') while
   the reading text keeps its own font, and no label is set in spaced-out capitals anywhere: the
   library, the settings sheet, the ⋯ menu, the About panel and the word card.
     NODE_PATH=$(npm root -g) node tests/look.js */
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");

const ff = (page, sel) => page.evaluate((s) => { const el = s === "body" ? document.body : document.querySelector(s); return el ? getComputedStyle(el).fontFamily : "(none)"; }, sel);
/* every visible element whose text is transformed to capitals */
const uppers = (page) => page.evaluate(() => [...document.querySelectorAll("body *")]
  .filter((e) => e.getClientRects().length && getComputedStyle(e).textTransform === "uppercase" && (e.textContent || "").trim())
  .map((e) => (e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "")) + " “" + e.textContent.trim().slice(0, 20) + "”"));

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();

  for (const [label, opts] of [["desktop", { viewport: { width: 1200, height: 800 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]){
    const ctx = await b.newContext(Object.assign({ reducedMotion: "reduce" }, opts));
    const page = await newPage(ctx, url);
    R.check(label + ": the interface font is LL UI", (await ff(page, "body")).startsWith('"LL UI"'), await ff(page, "body"));
    /* a declared 'LL UI' face that has actually loaded (fonts.check alone is true when no face is declared) */
    R.check(label + ": LL UI is loaded", await page.evaluate(async () => { await document.fonts.ready; await document.fonts.load('16px "LL UI"');
      return [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "LL UI" && f.status === "loaded"); }));
    await openFixture(page, "sample.md");
    R.check(label + ": the reading text keeps its font", /Georgia/.test(await ff(page, "#doc")), await ff(page, "#doc"));
    R.check(label + ": no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close(); await ctx.close();
  }

  /* sentence case: no label in spaced-out capitals, wherever the reader looks */
  {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.txt");
    await openFixture(page, "sample.md");
    await page.keyboard.press("h"); await page.waitForTimeout(400);
    let u = await uppers(page); R.check("no uppercase labels: library", u.length === 0, u.slice(0, 6).join(", "));
    await page.keyboard.press("s"); await page.waitForTimeout(400);
    u = await uppers(page); R.check("no uppercase labels: settings sheet", u.length === 0, u.slice(0, 6).join(", "));
    const fsLabel = await page.evaluate(() => getComputedStyle(document.querySelector("#themeChips .chip-group-label")).fontSize);
    R.check("labels at --fs-small (13px)", fsLabel === "13px", fsLabel);
    await page.evaluate(() => window.llThemes.select("hicon")); await page.waitForTimeout(150);
    const fsHi = await page.evaluate(() => getComputedStyle(document.querySelector("#themeChips .chip-group-label")).fontSize);
    R.check("contrast tone: labels 15px", fsHi === "15px", fsHi);
    await page.evaluate(() => window.llThemes.select("day"));
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    await openFixture(page, "sample.md");
    await page.click("#more"); await page.waitForTimeout(250);
    u = await uppers(page); R.check("no uppercase labels: ⋯ menu", u.length === 0, u.slice(0, 6).join(", "));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await page.keyboard.press("i"); await page.waitForTimeout(600);
    u = await uppers(page); R.check("no uppercase labels: About this text", u.length === 0, u.slice(0, 6).join(", "));
    await page.evaluate(() => window.__ll.Side.close()); await page.waitForTimeout(250);
    /* the word card: a click on the first word of the first paragraph */
    const at = await page.evaluate(() => {
      const p = [...document.querySelectorAll("#doc p")].find((x) => /\w{4,}/.test(x.textContent)); const tn = [...p.childNodes].find((n) => n.nodeType === 3 && /\w{4,}/.test(n.textContent));
      const m = /\w{4,}/.exec(tn.textContent); const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length);
      p.scrollIntoView({ block: "center" }); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => { const c = document.getElementById("dictCard"); return c && c.classList.contains("open") && c.textContent.length > 20; }, null, { timeout: 15000 }).catch(() => {});
    R.check("the word card uses LL UI", (await ff(page, "#dictCard")).startsWith('"LL UI"'), await ff(page, "#dictCard"));
    u = await uppers(page); R.check("no uppercase labels: word card", u.length === 0, u.slice(0, 6).join(", "));
    R.check("no page errors (casing)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close(); await ctx.close();
  }

  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
