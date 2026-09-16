/* Smoke test: every format opens in both flows, the dictionary answers a tap, no page errors. */
const { serve, browser, newPage, openFixture, fixtures, makeReport } = require("./lib");
(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const R = makeReport();
  for (const f of fixtures()){
    const page = await newPage(ctx, url);
    try {
      await openFixture(page, f);
      const isPdf = /pdf$/.test(f);
      const text = isPdf ? "" : await page.$eval("#doc", (d) => d.textContent);
      R.check(f + " opens (scroll)", isPdf || /lamp hums quietly/.test(text), isPdf ? "" : "text: " + text.slice(0, 80));
      await page.keyboard.press("p");            /* pages flow */
      await page.waitForTimeout(400);
      const paged = await page.evaluate(() => document.body.classList.contains("paged") && document.getElementById("pgInfo").textContent);
      R.check(f + " pages flow", /^\d/.test(String(paged)), String(paged));
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
      const pg = await page.$eval("#pgInfo", (e) => e.textContent);
      R.check(f + " turns a page", /^(2|2–3|3–4) \//.test(pg), pg);   /* PDFs turn two at a time in a spread */
      await page.keyboard.press("p"); await page.waitForTimeout(300);
      if (!isPdf){
        /* tap a word -> dictionary card */
        const box = await page.evaluate(() => {
          const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
          while ((n = w.nextNode())) if (n.textContent.indexOf("quietly") >= 0) break;
          const i = n.textContent.indexOf("quietly"), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 3);
          let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 2);
          b = r.getBoundingClientRect(); return { x: b.left + 2, y: b.top + b.height / 2 };
        });
        await page.waitForTimeout(200);
        await page.mouse.click(box.x, box.y);
        await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open") && /quiet/.test(document.querySelector("#dictCard .term") ? document.querySelector("#dictCard .term").textContent : ""), null, { timeout: 20000 }).catch(() => null);
        const term = await page.$eval("#dictCard", (c) => c.classList.contains("open") ? (c.querySelector(".term") || {}).textContent : "closed");
        R.check(f + " dictionary card", /quiet/.test(String(term)), String(term));
        await page.keyboard.press("Escape");
      }
      R.check(f + " no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    } catch (err){ R.check(f + " (exception)", false, String(err).split("\n")[0]); }
    await page.close();
  }
  await b.close(); server.close();
  process.exit(R.done());
})();
