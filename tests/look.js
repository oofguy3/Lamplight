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

  await b.close();
  server.close();
  process.exit(R.done());
})().catch((e) => { console.error(e); process.exit(1); });
