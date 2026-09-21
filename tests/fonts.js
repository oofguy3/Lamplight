/* Fonts: nothing is fetched until a bundled family is chosen, the select and the browse panel
   both apply and remember a choice, old ids still resolve, every font file is precached, and
   the menu and panel look right on desktop and phone in a light and a dark theme. Also: the
   note on the tinted rows keeps its contrast on every theme, Escape closes the panel alone, a
   family whose fetch failed is tried again and applied when it lands, and previews over a long
   text or in Pages flow go in as one batch.
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
  /* the font menu lives in the settings sheet (the s key, the ⋯ menu, or the test hook) */
  const sheet = async (page) => { if (!(await page.$eval("#sheet", (s) => s.classList.contains("open")))) { await page.evaluate(() => window.llPop.sheet(true)); await page.waitForTimeout(250); } };

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
    /* the note on the current (tinted) row and on a hovered row must read at 4.5:1 on every theme:
       the row's translucent background is composited over the panel, then WCAG contrast */
    const noteContrast = async (sel, hover) => {
      if (hover) await page.hover(sel);
      return page.$eval(sel, (row) => {
        const parse = (c) => {
          const m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(c) || /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(c);
          if (!m) return null;
          const k = /^color/.test(c) ? 255 : 1;
          return { r: m[1] * k, g: m[2] * k, b: m[3] * k, a: m[4] === undefined ? 1 : +m[4] };
        };
        const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) });
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const panel = parse(getComputedStyle(document.getElementById("side")).backgroundColor);
        const rowBg = parse(getComputedStyle(row).backgroundColor), note = parse(getComputedStyle(row.querySelector(".font-note")).color);
        if (!panel || !rowBg || !note) return null;
        const l1 = lum(note), l2 = lum(over(rowBg, panel));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      });
    };
    const themeBefore = await page.evaluate(() => window.__ll.state.theme);
    const themes = await page.evaluate(() => Object.keys(window.llThemes.THEMES));
    const lowNote = [];
    let minPressed = 99, minHover = 99;
    for (const id of themes){
      await page.evaluate((id) => window.llThemes.select(id), id);
      const pressed = await noteContrast('#sideBody .font-item[aria-pressed="true"]');
      const hovered = await noteContrast('#sideBody .font-item[data-font="serif"]', true);
      if (!(pressed >= 4.5 && hovered >= 4.5)) lowNote.push(id + " " + (pressed && pressed.toFixed(2)) + "/" + (hovered && hovered.toFixed(2)));
      minPressed = Math.min(minPressed, pressed || 0); minHover = Math.min(minHover, hovered || 0);
    }
    await page.mouse.move(0, 0);
    await page.evaluate((id) => window.llThemes.select(id), themeBefore);
    R.check("the note on the current row reads at 4.5:1 or better on all " + themes.length + " themes (min " + minPressed.toFixed(2) + ")", themes.length >= 25 && minPressed >= 4.5, lowNote.join(", "));
    R.check("the note on a hovered row reads at 4.5:1 or better on every theme (min " + minHover.toFixed(2) + ")", minHover >= 4.5, lowNote.join(", "));
    /* keyboard: items are buttons; Escape closes the panel only — the sheet under it stays and
       focus returns to the browse button — and the close button does the same */
    await page.focus('#sideBody .font-item[data-font="bitter"]');
    await page.keyboard.press("Enter");
    await loaded(page, "bitter");
    R.check("Enter on a focused item applies it", starts("Bitter").test(await family(page, "#doc")), await family(page, "#doc"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    R.check("Escape closes the panel", !(await page.$eval("#side", (s) => s.classList.contains("open"))));
    R.check("Escape leaves the settings sheet open", await page.$eval("#sheet", (s) => s.classList.contains("open")));
    R.check("Escape returns focus to the browse button", (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "fontBrowse");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    R.check("a second Escape closes the sheet", !(await page.$eval("#sheet", (s) => s.classList.contains("open"))));
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

    /* 6. a family whose file can't be fetched: the group's system face stands in, the choice is
       tried again on every later use and once back online, and the family goes in when it lands */
    await page.evaluate(() => localStorage.setItem("ll_prefs", JSON.stringify({ font: "serif" })));
    await page.reload({ waitUntil: "load" });
    await openFixture(page, "sample.md");
    const readerFont = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--reader-font").trim());
    const toastText = () => page.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
    const stackOf = (id) => cat.filter((f) => f.id === id)[0].stack;
    const nunitoReqs = () => woff(page).filter((f) => /^nunito-/.test(f)).length;
    await page.route("**/fonts/nunito*.woff2", (r) => r.abort("failed"));
    await sheet(page);
    page._reqs.length = 0;
    await page.selectOption("#fontSel", "nunito");
    await page.waitForFunction(() => document.getElementById("toast") && document.getElementById("toast").classList.contains("on"), null, { timeout: 5000 }).catch(() => null);
    R.check("a failed fetch reads the group's system face instead", (await readerFont()) === stackOf("sans") && nunitoReqs() === 1, await readerFont());
    R.check("…and says so, worded for a reader who is online", (await toastText()) === "Couldn’t load this font", await toastText());
    await page.evaluate(() => { document.getElementById("toast").textContent = ""; });
    await page.selectOption("#fontSel", "serif");
    await page.selectOption("#fontSel", "nunito");
    await page.waitForTimeout(400);
    R.check("choosing it again tries the file again, quietly", nunitoReqs() === 2 && (await toastText()) === "" && (await readerFont()) === stackOf("sans"), nunitoReqs() + " requests, toast " + JSON.stringify(await toastText()));
    await page.unroute("**/fonts/nunito*.woff2");
    await page.selectOption("#fontSel", "serif");
    await page.selectOption("#fontSel", "nunito");
    await loaded(page, "nunito");
    await page.waitForTimeout(100);
    R.check("once the file is reachable the family is applied", starts("Nunito").test(await family(page, "#doc")) && (await readerFont()) === stackOf("nunito"), await family(page, "#doc") + " / " + await readerFont());
    /* offline: the message says so, and coming back online puts the family in by itself */
    await ctx.setOffline(true);
    await page.selectOption("#fontSel", "lora");
    await page.waitForFunction(() => document.getElementById("toast").classList.contains("on"), null, { timeout: 5000 }).catch(() => null);
    R.check("offline, the message says so and the system face stands in", (await toastText()) === "Font not available offline" && (await readerFont()) === stackOf("serif"), (await toastText()) + " / " + (await readerFont()));
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await loaded(page, "lora");
    await page.waitForTimeout(100);
    R.check("back online, the family goes in without another touch", starts("Lora").test(await family(page, "#doc")) && (await readerFont()) === stackOf("lora"), await family(page, "#doc") + " / " + await readerFont());
    errors(page, "failed fetch");

    /* 7. browsing previews in Pages flow, or over a long text: every preview face goes in at once,
       so the document is re-laid-out once rather than once per scroll step, and the page stays put */
    const bundled = cat.filter((f) => f.files.length).map((f) => f.id);
    /* the regular face of every bundled family; Atkinson Hyperlegible's @font-face lives in app.css, so
       the browser fetches it by itself once the panel sets a name in it, and it is left out here */
    const previewFiles = cat.filter((f) => f.files.length).map((f) => f.files[0].split("/").pop());
    const previews = () => woff(page).filter((f) => previewFiles.indexOf(f) >= 0).length;
    const stray = () => woff(page).filter((f) => previewFiles.indexOf(f) < 0 && !/^AtkinsonHyperlegible/.test(f));
    const countLoads = () => page.evaluate(() => { window.__ldCount = 0; document.fonts.addEventListener("loadingdone", () => { window.__ldCount++; }); });
    const allPreviews = () => page.waitForFunction((ids) => ids.every((id) => window.llFonts.loaded(id)), bundled, { timeout: 20000 }).then(() => true, () => false);
    await page.evaluate(() => localStorage.setItem("ll_prefs", JSON.stringify({ font: "serif", flow: "pages" })));
    await page.reload({ waitUntil: "load" });
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => document.body.classList.contains("paged"));
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
    await sheet(page);
    const pgBefore = await page.$eval("#pgInfo", (e) => e.textContent);
    await countLoads();
    page._reqs.length = 0;
    await page.click("#fontBrowse");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open"));
    R.check("pages flow: every preview is requested at once, and only the regular faces", previews() === bundled.length && !stray().length, previews() + " of " + bundled.length + (stray().length ? ", stray: " + stray().join(", ") : ""));
    R.check("pages flow: all previews land", await allPreviews());
    await page.waitForTimeout(400);
    await page.$eval("#sideBody", (el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(400);
    const ld = await page.evaluate(() => window.__ldCount);
    R.check("pages flow: one re-layout, nothing more fetched on scrolling", ld === 1 && previews() === bundled.length && !stray().length, "loadingdone x" + ld + ", " + woff(page).length + " requests");
    const pgAfter = await page.$eval("#pgInfo", (e) => e.textContent);
    R.check("pages flow: the reading position stays put", pgAfter === pgBefore && !/^1 \//.test(pgBefore), pgBefore + " -> " + pgAfter);
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    /* a long text in scroll flow gets the same treatment (a short one still loads only what is in view, see 4) */
    await page.evaluate(() => localStorage.setItem("ll_prefs", JSON.stringify({ font: "serif", flow: "scroll" })));
    await page.reload({ waitUntil: "load" });
    const para = "The lamp hums quietly as she turns the page. Nobody could have predicted the extraordinary consequences of that small, deliberate decision.\n\n";
    await page.setInputFiles("#fileInput", { name: "long.txt", mimeType: "text/plain", buffer: Buffer.from(para.repeat(Math.ceil(200000 / para.length))) });
    await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 150000, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await sheet(page);
    await countLoads();
    page._reqs.length = 0;
    await page.click("#fontBrowse");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open"));
    R.check("a long text: every preview is requested at once", previews() === bundled.length && !stray().length, previews() + " of " + bundled.length + (stray().length ? ", stray: " + stray().join(", ") : ""));
    await allPreviews();
    await page.waitForTimeout(400);
    R.check("a long text: one re-layout", (await page.evaluate(() => window.__ldCount)) === 1, "loadingdone x" + await page.evaluate(() => window.__ldCount));
    await page.keyboard.press("Escape"); await page.waitForTimeout(350);
    errors(page, "previews");

    /* 8. files, the worker and the licences agree */
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

    /* 9. screenshots: the sheet with the menu and the browse panel, desktop and phone, light and dark */
    async function shots(vp, tag, sheetTheme, panelTheme){
      const c = await b.newContext({ viewport: vp, serviceWorkers: "block" });
      const p = await open(c);
      await p.evaluate((t) => localStorage.setItem("ll_prefs", JSON.stringify({ theme: t, font: "literata" })), sheetTheme);
      await p.reload({ waitUntil: "load" });
      await openFixture(p, "sample.md");
      await p.evaluate(() => window.llPop.sheet(true));
      await p.waitForTimeout(400);
      await p.$eval("#fontSel", (el) => el.scrollIntoView({ block: "center" }));
      await p.screenshot({ path: path.join(SHOTS, "fonts-sheet-" + tag + "-" + sheetTheme + ".png") });
      await p.evaluate((t) => localStorage.setItem("ll_prefs", JSON.stringify({ theme: t, font: "literata" })), panelTheme);
      await p.reload({ waitUntil: "load" });
      await openFixture(p, "sample.md");
      await p.evaluate(() => window.llPop.sheet(true));
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
