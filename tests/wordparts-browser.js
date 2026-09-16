/* Word parts in the dictionary card: prefix / root / suffix tiles with meanings, a gloss,
   nothing for a plain word.  NODE_PATH=$(npm root -g) node tests/wordparts-browser.js */
const os = require("os"), path = require("path"), fs = require("fs");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-wordparts");
fs.mkdirSync(SHOTS, { recursive: true });

async function tapWord(page, word){
  const pt = await page.evaluate((word) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (new RegExp("\\b" + word + "\\b", "i").test(n.textContent)) break;
    if (!n) return null;
    const i = n.textContent.search(new RegExp("\\b" + word + "\\b", "i")), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 2);
    let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 2); b = r.getBoundingClientRect();
    return { x: b.left + 2, y: b.top + b.height / 2 };
  }, word);
  if (!pt) throw new Error("no such word in the text: " + word);
  await page.waitForTimeout(150);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction((w) => { const t = document.querySelector("#dictCard .term"); return document.getElementById("dictCard").classList.contains("open") && t && new RegExp("^" + w, "i").test(t.textContent.trim()); }, word, { timeout: 30000 });
}
async function partsOf(page, wait){
  if (wait) await page.waitForSelector("#dictCard .wordparts", { timeout: 30000 }).catch(() => null);
  else await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const box = document.querySelector("#dictCard .wordparts");
    if (!box) return null;
    return { parts: Array.from(box.querySelectorAll(".part")).map((p) => ({ text: p.querySelector(".pt").textContent, kind: p.querySelector(".pk").textContent, meaning: (p.querySelector(".pm") || {}).textContent || "" })),
             gloss: (box.querySelector(".gloss") || {}).textContent || "", guess: !!box.querySelector(".note") };
  });
}

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  for (const view of [{ name: "desktop", viewport: { width: 1200, height: 800 } }, { name: "phone", viewport: { width: 390, height: 844 } }]){
    const ctx = await b.newContext({ viewport: view.viewport });
    const page = await newPage(ctx, url);
    if (view.name === "phone") await page.evaluate(() => { window.__ll.state.theme = "dusk"; });
    await openFixture(page, "sample.md");
    try {
      await tapWord(page, "unexpected");
      let p = await partsOf(page, true);
      R.check(view.name + ": unexpected has word parts", !!p, "no .wordparts");
      if (p){
        R.check(view.name + ": unexpected = un + expect + ed", p.parts.map((x) => x.text).join("+") === "un+expect+ed", p.parts.map((x) => x.text).join("+"));
        R.check(view.name + ": kinds are prefix / base / ending", p.parts.map((x) => x.kind).join(",") === "prefix,base,ending", p.parts.map((x) => x.kind).join(","));
        R.check(view.name + ": the prefix has a meaning", /not/.test(p.parts[0].meaning), p.parts[0].meaning);
        R.check(view.name + ": a gloss line is shown", /so:/.test(p.gloss), p.gloss);
      }
      await page.screenshot({ path: path.join(SHOTS, "wordparts-" + view.name + ".png") });
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);

      await tapWord(page, "photosynthesis");
      p = await partsOf(page, true);
      R.check(view.name + ": photosynthesis breaks into roots", !!p && p.parts.length >= 2 && p.parts[0].text === "photo" && /light/.test(p.parts[0].meaning), p ? JSON.stringify(p.parts) : "none");
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);

      await tapWord(page, "extraordinary");
      p = await partsOf(page, true);
      R.check(view.name + ": extraordinary starts with extra (beyond)", !!p && p.parts[0].text === "extra" && /beyond|outside/.test(p.parts[0].meaning), p ? JSON.stringify(p.parts) : "none");
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);

      await tapWord(page, "misunderstanding");
      p = await partsOf(page, true);
      R.check(view.name + ": misunderstanding starts with mis (wrongly)", !!p && p.parts[0].text === "mis" && /wrong|bad/.test(p.parts[0].meaning), p ? JSON.stringify(p.parts) : "none");
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);

      await tapWord(page, "chair");
      p = await partsOf(page, false);
      R.check(view.name + ": a plain word shows no word parts", p === null, p ? JSON.stringify(p.parts) : "");
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);

      /* tapping a base tile looks that word up */
      await tapWord(page, "unhurried");
      p = await partsOf(page, true);
      /* "hurried" is itself a dictionary adjective, so un + hurried is as right as un + hurry + ed */
      const joined = p ? p.parts.map((x) => x.text).join("+") : "none";
      R.check(view.name + ": unhurried = un + hurry + ed (or un + hurried)", joined === "un+hurry+ed" || joined === "un+hurried", joined);
      const baseWord = await page.evaluate(() => { const b = document.querySelector("#dictCard button.part"); return b ? b.dataset.w : null; });
      R.check(view.name + ": the base is a button", !!baseWord, "no button.part");
      if (baseWord){
        await page.click("#dictCard button.part");
        await page.waitForFunction((w) => new RegExp("^" + w, "i").test((document.querySelector("#dictCard .term") || {}).textContent || ""), baseWord, { timeout: 20000 }).catch(() => null);
        R.check(view.name + ": tapping the base looks it up", new RegExp("^" + baseWord, "i").test(await page.$eval("#dictCard .term", (t) => t.textContent.trim())), baseWord);
      }
      /* the curated meaning wins over the dictionary's odd first sense */
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);
      await tapWord(page, "unexpected");
      p = await partsOf(page, true);
      R.check(view.name + ": the base 'expect' has a plain meaning", !!p && /think something will happen/.test(p.parts[1].meaning), p ? p.parts[1].meaning : "none");
      await page.keyboard.press("Escape");
      R.check(view.name + ": no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    } catch (err){ R.check(view.name + " (exception)", false, String(err).split("\n")[0]); }
    await ctx.close();
  }
  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})();
