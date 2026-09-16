/* Fonts: nothing is fetched until a bundled family is chosen, the select and the browse panel
   both apply and remember a choice, old ids still resolve, every font file is precached, and
   the menu and panel look right on desktop and phone in a light and a dark theme.
   Service workers are blocked in the test contexts so the requests seen are the page's own
   (the worker precaches every font by design). Screenshots go to $LL_SHOTS or the temp dir. */
const { serve, browser, openFixture, makeReport, ROOT } = require("./lib");
const fs = require("fs"), path = require("path"), os = require("os");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-shots");
const starts = (family) => new RegExp("^[\"']?" + family + "\\b");

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  fs.mkdirSync(SHOTS, { recursive: true });

  /* a page that records every request from before navigation */
  async function open(ctx){
    const page = await ctx.newPage();
    page._reqs = [];
    page.on("request", (r) => page._reqs.push(r.url()));
    page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
    await page.goto(url, { waitUntil: "load" });
    return page;
  }
  const woff = (page) => page._reqs.filter((u) => /\.woff2(\?|$)/.test(u)).map((u) => u.split("/").pop());
  const family = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).fontFamily);
  const loaded = (page, id) => page.waitForFunction((i) => window.llFonts && window.llFonts.loaded(i), id, { timeout: 15000 }).then(() => true, () => false);
  const errors = (page, label) => R.check(label + ": no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
  /* the font menu lives in the settings sheet, which the gear opens */
  const sheet = async (page) => { if (!(await page.$eval("#sheet", (s) => s.classList.contains("open")))) { await page.click("#gear"); await page.waitForTimeout(250); } };

  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  let page = await open(ctx);
  try {
    /* 1. the initial load fetches no font file at all */
    await openFixture(page, "sample.md");
    await page.waitForTimeout(700);                       /* the idle warm-up runs in here */
    R.check("initial load fetches no font file", woff(page).length === 0, woff(page).join(", "));
    const groups = await page.$$eval("#fontSel optgroup", (g) => g.map((x) => x.label));
    R.check("the font menu is grouped", groups.join("|") === "Easy reading|Serif|Sans|Mono", groups.join("|"));
    const options = await page.$$eval("#fontSel option", (o) => o.map((x) => x.value));
    R.check("the menu lists every family", options.length === 24, "options: " + options.length);
    R.check("the old ids are still in the menu", ["serif", "sans", "mono", "hyper"].every((id) => options.indexOf(id) >= 0), options.join(","));
    R.check("the menu has a label", (await page.$eval("label[for=fontSel]", (l) => l.textContent.trim())) === "Font");
    const cat = await page.evaluate(() => {
      const c = window.llFonts.catalogue;
      return Object.keys(c).map((id) => ({ id, name: c[id].name, group: c[id].group, stack: c[id].stack, note: c[id].note, files: (c[id].files || []).map((f) => f.url) }));
    });
    R.check("every entry has a name, group, stack and a short note",
      cat.every((f) => f.name && /^(easy|serif|sans|mono)$/.test(f.group) && f.stack && f.note && f.note.length <= 64),
      cat.filter((f) => !(f.name && f.stack && f.note && f.note.length <= 64)).map((f) => f.id).join(","));
    R.check("the Hyperlegible note keeps the low-vision hint", /low vision/.test((cat.filter((f) => f.id === "hyper")[0] || {}).note));

    /* 2. OpenDyslexic from the select */
    await sheet(page);
    await page.selectOption("#fontSel", "dyslexic");
    await loaded(page, "dyslexic");
    R.check("selecting OpenDyslexic fetches its regular face", woff(page).indexOf("opendyslexic-latin-400-normal.woff2") >= 0, woff(page).join(", "));
    R.check("nothing but OpenDyslexic was fetched", woff(page).every((f) => /^opendyslexic-/.test(f)), woff(page).join(", "));
    R.check("document.fonts.check sees OpenDyslexic", await page.evaluate(() => document.fonts.check("16px OpenDyslexic")));
    R.check("the OpenDyslexic face is loaded", await page.evaluate(() => window.llFonts.loaded("dyslexic")));
    R.check("#doc is set in OpenDyslexic", starts("OpenDyslexic").test(await family(page, "#doc")), await family(page, "#doc"));
    R.check("the type preview follows", starts("OpenDyslexic").test(await family(page, "#typePreview")));
    R.check("the choice is remembered", (await page.evaluate(() => JSON.parse(localStorage.getItem("ll_prefs")).font)) === "dyslexic");
    page._reqs.length = 0;
    await page.reload({ waitUntil: "load" });
    await loaded(page, "dyslexic");
    R.check("after a reload the select shows OpenDyslexic", (await page.$eval("#fontSel", (s) => s.value)) === "dyslexic");
    R.check("after a reload the font is applied again", starts("OpenDyslexic").test(await family(page, "#doc")) && await page.evaluate(() => window.llFonts.loaded("dyslexic")));
    R.check("after a reload it is fetched again (no worker here)", woff(page).indexOf("opendyslexic-latin-400-normal.woff2") >= 0, woff(page).join(", "));

    /* 3. Lexend and Literata: variable weight, so bold text keeps the family */
    await openFixture(page, "sample.md");
    for (const [id, name, file] of [["lexend", "Lexend", "lexend-latin-wght-normal.woff2"], ["literata", "Literata", "literata-latin-wght-normal.woff2"]]){
      page._reqs.length = 0;
      await sheet(page);
      await page.selectOption("#fontSel", id);
      await loaded(page, id);
      R.check(name + " is fetched when selected", woff(page).indexOf(file) >= 0, woff(page).join(", "));
      R.check(name + " passes document.fonts.check", await page.evaluate((f) => document.fonts.check("16px " + f), name));
      const strong = await page.$eval("#doc strong", (s) => getComputedStyle(s).fontFamily + " / " + getComputedStyle(s).fontWeight);
      R.check(name + ": bold text reports the family", starts(name).test(strong) && /700$/.test(strong), strong);
      R.check(name + ": the weight range covers bold", await page.evaluate((f) => document.fonts.check("bold 16px " + f), name));
    }
    errors(page, "menu");

    /* 4. the browse panel */
    await sheet(page);
    await page.click("#fontBrowse");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open"));
    R.check("the browse panel opens", await page.$eval("#side", (s) => s.classList.contains("open") && s.getAttribute("aria-hidden") === "false"));
    R.check("the panel is titled Fonts", (await page.$eval("#sideTitle", (t) => t.textContent)) === "Fonts");
    const heads = await page.$$eval("#sideBody .font-group", (g) => g.map((x) => x.textContent));
    R.check("the panel lists all groups", heads.join("|") === "Easy reading|Serif|Sans|Mono", heads.join("|"));
    const items = await page.$$eval("#sideBody .font-item", (b) => b.map((x) => x.dataset.font));
    R.check("the panel lists every family", items.length === 24 && items.join() === options.join(), items.join(","));
    R.check("the current font is marked", (await page.$eval('#sideBody .font-item[aria-pressed="true"]', (x) => x.dataset.font)) === "literata");
    R.check("only one item is marked", (await page.$$eval('#sideBody .font-item[aria-pressed="true"]', (x) => x.length)) === 1);
    R.check("names are set in their own font", starts("OpenDyslexic").test(await family(page, '#sideBody .font-item[data-font="dyslexic"] .font-name')));
    R.check("every item shows its note", await page.$$eval("#sideBody .font-item .font-note", (n) => n.every((x) => x.textContent.length > 10)));
    await page.waitForTimeout(600);
    R.check("fonts far down the list are not fetched on open", woff(page).indexOf("ibm-plex-mono-latin-400-normal.woff2") < 0, woff(page).join(", "));
    R.check("fonts in view are fetched for their preview", woff(page).indexOf("andika-latin-400-normal.woff2") >= 0, woff(page).join(", "));
    R.check("previews fetch only the regular face", woff(page).indexOf("andika-latin-700-normal.woff2") < 0 && woff(page).indexOf("andika-latin-400-italic.woff2") < 0, woff(page).join(", "));
    await page.$eval("#sideBody", (el) => { el.scrollTop = el.scrollHeight; });
    await loaded(page, "plexmono");
    R.check("scrolling the panel fetches what came into view", woff(page).indexOf("ibm-plex-mono-latin-400-normal.woff2") >= 0, woff(page).join(", "));
    await page.click('#sideBody .font-item[data-font="lora"]');
    await loaded(page, "lora");
    R.check("clicking an item applies the font", starts("Lora").test(await family(page, "#doc")), await family(page, "#doc"));
    R.check("the clicked item is marked current", (await page.$eval('#sideBody .font-item[aria-pressed="true"]', (x) => x.dataset.font)) === "lora");
    R.check("the select follows the panel", (await page.$eval("#fontSel", (s) => s.value)) === "lora");
    R.check("the panel stays open to compare", await page.$eval("#side", (s) => s.classList.contains("open")));
    R.check("the panel choice is remembered", (await page.evaluate(() => JSON.parse(localStorage.getItem("ll_prefs")).font)) === "lora");
    R.check("a chosen font gets its italic face too", woff(page).indexOf("lora-latin-wght-italic.woff2") >= 0, woff(page).join(", "));
    R.check("a merely previewed font did not", woff(page).indexOf("source-serif-4-latin-wght-italic.woff2") < 0, woff(page).join(", "));
    /* keyboard: items are buttons, Escape closes, focus goes back to the opener */
    await page.focus('#sideBody .font-item[data-font="bitter"]');
    await page.keyboard.press("Enter");
    await loaded(page, "bitter");
    R.check("Enter on a focused item applies it", starts("Bitter").test(await family(page, "#doc")), await family(page, "#doc"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    R.check("Escape closes the panel", !(await page.$eval("#side", (s) => s.classList.contains("open"))));
    /* Escape closes the sheet as well (the app's rule), so focus return is checked via the close button */
    await sheet(page);
    await page.click("#fontBrowse");
    await page.waitForTimeout(350);
    await page.click("#sideClose");
    await page.waitForTimeout(350);
    R.check("closing the panel returns focus to the browse button", (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "fontBrowse");
    errors(page, "panel");

    /* 5. old ids in ll_prefs still resolve, unknown ones fall back to serif */
    for (const [id, fam] of [["hyper", "Atkinson Hyperlegible"], ["serif", "Georgia"], ["sans", "system-ui"], ["mono", "ui-monospace"]]){
      await page.evaluate((v) => localStorage.setItem("ll_prefs", JSON.stringify({ font: v })), id);
      await page.reload({ waitUntil: "load" });
      const f = await family(page, "#doc");
      R.check("old id " + id + " resolves to " + fam, (await page.evaluate(() => window.__ll.state.font)) === id && starts(fam).test(f) && (await page.$eval("#fontSel", (s) => s.value)) === id, f);
    }
    for (const bad of ["comic", "constructor", 7]){
      await page.evaluate((v) => localStorage.setItem("ll_prefs", JSON.stringify({ font: v })), bad);
      await page.reload({ waitUntil: "load" });
      R.check("unknown font " + JSON.stringify(bad) + " falls back to serif", (await page.evaluate(() => window.__ll.state.font)) === "serif" && starts("Georgia").test(await family(page, "#doc")));
    }
    errors(page, "prefs");

    /* 6. files, the worker and the licences agree */
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    let parses = true; try { new Function(sw); } catch (e){ parses = false; }
    R.check("sw.js parses", parses);
    const fontFiles = fs.readdirSync(path.join(ROOT, "fonts")).filter((f) => f.endsWith(".woff2"));
    const unlisted = fontFiles.filter((f) => sw.indexOf("./fonts/" + f) < 0);
    R.check("every fonts/*.woff2 is precached by sw.js", unlisted.length === 0, unlisted.join(", "));
    R.check("every fonts/*.woff2 is a real woff2", fontFiles.every((f) => fs.readFileSync(path.join(ROOT, "fonts", f)).slice(0, 4).toString() === "wOF2"));
    const urls = [].concat.apply([], cat.map((f) => f.files));
    const gone = urls.filter((u) => !fs.existsSync(path.join(ROOT, u)));
    R.check("every file the catalogue names exists", gone.length === 0, gone.join(", "));
    const orphans = fontFiles.filter((f) => !/^AtkinsonHyperlegible/.test(f) && urls.indexOf("./fonts/" + f) < 0);
    R.check("every bundled file is in the catalogue", orphans.length === 0, orphans.join(", "));
    const total = fontFiles.reduce((s, f) => s + fs.statSync(path.join(ROOT, "fonts", f)).size, 0);
    R.check("all fonts together stay under 2 MB", total < 2 * 1024 * 1024, (total / 1024).toFixed(0) + " KB");
    const lic = fs.readFileSync(path.join(ROOT, "fonts", "LICENSES.md"), "utf8");
    const unlicensed = cat.filter((f) => f.files.length && lic.indexOf(f.name) < 0).map((f) => f.name);
    R.check("LICENSES.md names every bundled family", unlicensed.length === 0, unlicensed.join(", "));
    await page.close();

    /* 7. screenshots: the sheet with the menu and the browse panel, desktop and phone, light and dark */
    async function shots(vp, tag, sheetTheme, panelTheme){
      const c = await b.newContext({ viewport: vp, serviceWorkers: "block" });
      const p = await open(c);
      await p.evaluate((t) => localStorage.setItem("ll_prefs", JSON.stringify({ theme: t, font: "literata" })), sheetTheme);
      await p.reload({ waitUntil: "load" });
      await openFixture(p, "sample.md");
      await p.click("#gear");
      await p.waitForTimeout(400);
      await p.$eval("#fontSel", (el) => el.scrollIntoView({ block: "center" }));
      await p.screenshot({ path: path.join(SHOTS, "fonts-sheet-" + tag + "-" + sheetTheme + ".png") });
      await p.evaluate((t) => localStorage.setItem("ll_prefs", JSON.stringify({ theme: t, font: "literata" })), panelTheme);
      await p.reload({ waitUntil: "load" });
      await openFixture(p, "sample.md");
      await p.click("#gear");
      await p.click("#fontBrowse");
      await p.waitForTimeout(1200);                       /* let the previews land */
      await p.screenshot({ path: path.join(SHOTS, "fonts-panel-" + tag + "-" + panelTheme + ".png") });
      R.check("screenshots " + tag + ": no page errors", !(p._errors || []).length, (p._errors || []).join(" | "));
      await c.close();
    }
    await shots({ width: 1200, height: 800 }, "desktop", "day", "dusk");
    await shots({ width: 390, height: 844 }, "phone", "dusk", "day");
    console.log("screenshots in " + SHOTS);
  } catch (err){ R.check("(exception)", false, String(err).split("\n")[0]); }
  await b.close(); server.close();
  process.exit(R.done());
})();
