/* Themes in the browser: every built-in applies, the lamp cycles, the custom editor (New…, pickers
   and hex fields, the contrast meter and Fix contrast, rename / duplicate / save as / delete),
   the old scratch theme's migration, persistence across a reload, the day / night lists and the
   theme-color meta. Screenshots of the editor go to $LL_SHOTS (default: the OS temp dir). */
const { serve, browser, newPage, makeReport } = require("./lib");
const path = require("path"), os = require("os");
const SHOTS = process.env.LL_SHOTS || os.tmpdir();

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const R = makeReport();
  const page = await newPage(ctx, url);
  /* answers for prompt() / confirm(), in order */
  const answers = [];
  page.on("dialog", (d) => d.accept(answers.length ? answers.shift() : undefined));
  const cssVar = (n) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n).trim().toLowerCase(), n);
  const state = (k) => page.evaluate((k) => window.__ll.state[k], k);
  const meta = () => page.$eval('meta[name="theme-color"]', (m) => m.content.toLowerCase());
  const customs = () => page.evaluate(() => window.llThemes.customs());
  const badges = () => page.$$eval("#cMeter .meter-badge", (els) => els.map((e) => e.textContent));
  const text = (sel) => page.$eval(sel, (e) => e.textContent);
  const openSheet = () => page.evaluate(() => { window.llPop.sheet(true); });
  const pick = (sel, v) => page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  try {
    /* 1. every built-in theme applies */
    const THEMES = await page.evaluate(() => window.llThemes.THEMES);
    const ids = Object.keys(THEMES);
    let applied = 0, wrong = [];
    for (const id of ids){
      await page.evaluate((id) => window.llThemes.select(id), id);
      if ((await cssVar("--bg")) === THEMES[id].bg.toLowerCase() && (await cssVar("--panel")) === THEMES[id].panel.toLowerCase()) applied++; else wrong.push(id);
    }
    R.check("every built-in theme applies (" + applied + " of " + ids.length + ")", applied === ids.length && ids.length >= 25, wrong.join(","));
    const groups = await page.evaluate(() => window.llThemes.groups().map((g) => g.name + ":" + g.ids.length).join(","));
    R.check("built-ins are grouped light / dark / high contrast", /^Light:\d+,Dark:\d+,High contrast:2$/.test(groups), groups);
    await openSheet();
    const labels = await page.$$eval("#themeChips .chip-group-label", (els) => els.map((e) => e.textContent).join("|"));
    R.check("chip groups are labelled", labels === "Light|Dark|High contrast|Custom", labels);
    const chips = await page.$$eval("#themeChips .chip[data-theme]", (els) => els.length);
    R.check("one chip per built-in theme", chips === ids.length, String(chips));
    const sw = await page.$eval('#themeChips .chip[data-theme="ember"] i', (i) => getComputedStyle(i).backgroundColor + " / " + getComputedStyle(i, "::after").backgroundColor);
    R.check("a chip's swatch shows the page colour and the accent", sw === "rgb(26, 18, 16) / rgb(242, 129, 46)", sw);
    const pressed = await page.$$eval("#themeChips .chip[aria-pressed=true]", (els) => els.map((e) => e.dataset.theme).join(","));
    R.check("the selected chip is marked", pressed === ids[ids.length - 1], pressed);

    /* 2. the lamp opens the theme popover; t switches day / night */
    const CYCLE = await page.evaluate(() => window.llThemes.CYCLE);
    await page.evaluate(() => window.llThemes.select("day"));
    await page.click("#lamp"); await page.waitForTimeout(150);
    R.check("the lamp opens the theme popover", await page.evaluate(() => window.llPop.is("theme") && document.getElementById("pop").classList.contains("open") && document.getElementById("lamp").getAttribute("aria-expanded") === "true"));
    const rows = await page.evaluate(() => ({ light: document.querySelectorAll("#qLight .chip").length, dark: document.querySelectorAll("#qDark .chip").length,
      on: Array.from(document.querySelectorAll("#pop .strip .chip[aria-pressed=true]")).map((c) => c.dataset.theme).join(",") }));
    const gs = await page.evaluate(() => window.llThemes.groups());
    R.check("the popover lists the light and dark themes (the two high-contrast ones join their rows) with the current one marked", rows.light === gs[0].ids.length + 1 && rows.dark === gs[1].ids.length + 1 && rows.on === "day", JSON.stringify(rows));
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    await page.keyboard.press("t");
    R.check("the t key goes to the night theme", (await state("theme")) === "dusk", await state("theme"));
    await page.keyboard.press("t");
    R.check("t again goes back to the day theme", (await state("theme")) === "day", await state("theme"));
    await page.evaluate(() => window.llThemes.select("paper"));
    await page.keyboard.press("t");
    R.check("from a light theme that is neither, t goes to the night theme", (await state("theme")) === "dusk", await state("theme"));
    const order = await page.evaluate(() => window.llThemes.groups().reduce((a, g) => a.concat(g.ids), []).join(","));
    R.check("the theme order is lights, then darks, then high contrast", CYCLE.join(",") === order && CYCLE[0] === "day" && CYCLE[CYCLE.length - 1] === "hidark" && CYCLE.indexOf("dusk") > CYCLE.indexOf("mint"), CYCLE.join(","));

    /* 7. theme-color meta */
    await page.evaluate(() => window.llThemes.select("dusk"));
    R.check("theme-color meta follows the panel", (await meta()) === THEMES.dusk.panel.toLowerCase(), await meta());

    /* 3. New… creates a saved theme from the colours on screen */
    await page.evaluate(() => window.llThemes.select("paper"));
    await page.click("#themeChips .chip-new");
    let theme = await state("theme"), list = await customs();
    R.check("New… creates a saved theme and selects it", /^c:/.test(theme) && list.length === 1 && theme === "c:" + list[0].id, theme);
    R.check("it is named Custom 1 and starts from the current colours", list[0].name === "Custom 1" && list[0].bg === THEMES.paper.bg.toLowerCase() && list[0].accent === THEMES.paper.accent.toLowerCase(), JSON.stringify(list[0]));
    R.check("the editor is shown with the theme's name", (await page.$eval("#customRow", (r) => r.classList.contains("show"))) && (await text("#cName")) === "Custom 1");
    R.check("the new theme's chip has focus", await page.evaluate(() => document.activeElement && document.activeElement.dataset.theme === window.__ll.state.theme));
    R.check("automatic text disables its picker and shows the derived colour", await page.$eval("#cInk", (e) => e.disabled && /^#[0-9a-f]{6}$/.test(e.value)) && await page.$eval("#hInk", (e) => e.disabled));
    R.check("meta follows a custom theme's panel", (await meta()) === (await cssVar("--panel")), await meta());
    /* the background picker: --bg live, hex field in step, meter updated */
    const before = await text('#cMeter [data-k="ink"] .meter-n');
    await pick("#cBg", "#777777");   /* the worst grey: even the derived text fails on it */
    R.check("the background picker changes --bg live", (await cssVar("--bg")) === "#777777", await cssVar("--bg"));
    R.check("the hex field follows the picker", (await page.$eval("#hBg", (e) => e.value)) === "#777777");
    const after = await text('#cMeter [data-k="ink"] .meter-n');
    R.check("the contrast ratio text changes", before !== after && /^\d+\.\d:1$/.test(after), before + " -> " + after);
    R.check("a Low badge appears for a mid-grey background", (await badges()).indexOf("Low") >= 0, (await badges()).join(","));
    R.check("the low row is marked", await page.$eval('#cMeter [data-k="ink"]', (r) => r.classList.contains("low") && r.querySelector(".meter-badge").textContent === "Low"));
    const summary = await text("#cMeterSum");
    R.check("the summary says what is hard to read", /^Text.*hard to read on this background/.test(summary), summary);
    R.check("Fix contrast is offered", await page.$eval("#cFix", (b) => !b.hidden));
    await page.click("#cFix");
    R.check("Fix contrast makes the text readable", (await text('#cMeter [data-k="ink"] .meter-badge')) !== "Low", (await badges()).join(","));
    R.check("the fix kept the background", (await cssVar("--bg")) === "#777777", await cssVar("--bg"));
    R.check("a fixed automatic colour becomes a picked one", await page.$eval("#autoInk", (e) => !e.checked) && await page.$eval("#cInk", (e) => !e.disabled));
    /* a bad accent on a workable grey: only the accent changes, and only in lightness */
    await page.$eval("#autoInk", (e) => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.$eval("#autoMuted", (e) => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); });
    await pick("#cAcc", "#be2a24");
    await pick("#cBg", "#9a9a9a");
    const lowRows = await page.$$eval("#cMeter .meter-row.low", (els) => els.map((e) => e.dataset.k).join(","));
    R.check("a red accent on a mid grey is marked low, the text is not", lowRows === "accent,accentPanel", lowRows);
    R.check("the summary blames the accent", /^Accent is hard to read on this background — try a darker accent\.$/.test(await text("#cMeterSum")), await text("#cMeterSum"));
    await page.click("#cFix");
    const fixed = await badges();
    R.check("Fix contrast makes every pair pass", fixed.every((x) => x !== "Low") && (await page.$eval("#cFix", (b) => b.hidden)), fixed.join(","));
    const kept = await page.evaluate(() => { const t = window.llThemes.current(); return { bg: t.bg, accent: t.accent, autoInk: window.llThemes.customs()[0].autoInk }; });
    const rgb = [1, 3, 5].map((i) => parseInt(kept.accent.slice(i, i + 2), 16));
    R.check("the fix darkened the accent and kept its hue and the rest", kept.bg === "#9a9a9a" && kept.autoInk && rgb[0] < 0xbe && rgb[0] > rgb[1] && rgb[0] > rgb[2], JSON.stringify(kept));
    R.check("the summary says the text is readable", /readable\.$/.test(await text("#cMeterSum")), await text("#cMeterSum"));
    /* hex field: short form applies, an invalid one is flagged and not applied */
    await page.fill("#hBg", "#abc");
    R.check("typing a short hex applies it", (await cssVar("--bg")) === "#aabbcc", await cssVar("--bg"));
    await page.fill("#hBg", "#zzz");
    R.check("an invalid hex is flagged and not applied", (await page.$eval("#hBg", (e) => e.getAttribute("aria-invalid") === "true" && e.classList.contains("bad"))) && (await cssVar("--bg")) === "#aabbcc");
    await page.$eval("#hBg", (e) => e.blur());
    R.check("leaving the field shows the real colour again", await page.$eval("#hBg", (e) => e.value === "#aabbcc" && !e.classList.contains("bad")));
    /* accent swatch, advanced pickers */
    await page.click('#accSwatches .sw[data-c="#C25B78"]');
    R.check("an accent swatch applies", (await cssVar("--accent")) === "#c25b78" && (await page.$eval("#hAcc", (e) => e.value)) === "#c25b78");
    R.check("the preview shows the accent", await page.$eval("#cPrevAcc", (e) => getComputedStyle(e).color === "rgb(194, 91, 120)"));
    await page.$eval(".cst-adv", (d) => { d.open = true; });
    await page.$eval("#autoPanel", (e) => { e.checked = false; e.dispatchEvent(new Event("change", { bubbles: true })); });
    await pick("#cPanel", "#ffffff");
    list = await customs();
    R.check("a picked panel applies and is saved", (await cssVar("--panel")) === "#ffffff" && list[0].panel === "#ffffff" && (await meta()) === "#ffffff");
    await page.$eval("#autoPanel", (e) => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); });
    list = await customs();
    R.check("automatic panel derives it again", !list[0].panel && (await cssVar("--panel")) !== "#ffffff");

    /* 4. rename, duplicate, save as new, delete */
    answers.push("Night reading");
    await page.click("#cRename");
    list = await customs();
    R.check("rename", list[0].name === "Night reading" && (await text("#cName")) === "Night reading" && (await text('#themeChips .chip[data-theme="c:' + list[0].id + '"]')) === "Night reading");
    await page.click("#cDup");
    list = await customs();
    R.check("duplicate copies the theme and selects the copy", list.length === 2 && list[1].name === "Night reading copy" && (await state("theme")) === "c:" + list[1].id && list[1].bg === list[0].bg && list[1].ink === list[0].ink, list.map((c) => c.name).join("|"));
    answers.push("Third");
    await page.click("#cSaveAs");
    list = await customs();
    R.check("save as new asks for a name and selects the new theme", list.length === 3 && list[2].name === "Third" && (await state("theme")) === "c:" + list[2].id);
    answers.push("");
    await page.click("#cDel");
    list = await customs();
    R.check("delete asks first and removes the theme", list.length === 2 && list.every((c) => c.name !== "Third"), list.map((c) => c.name).join("|"));
    R.check("after a delete, a built-in of the same lightness is selected", /^(day|dusk)$/.test(await state("theme")) && !(await page.$eval("#customRow", (r) => r.classList.contains("show"))), await state("theme"));

    /* 6. the day / night lists */
    await page.click('#autoChips .chip[data-auto="time"]');
    const opts = await page.$$eval("#autoDay optgroup", (gs) => gs.map((g) => g.label + ":" + g.querySelectorAll("option").length).join(","));
    R.check("the day list is grouped and lists the saved themes", /^Light:\d+,Dark:\d+,High contrast:2,Custom:2$/.test(opts), opts);
    const night = await page.$eval("#autoNight", (s, id) => { const o = s.querySelector('option[value="c:' + id + '"]'); return o && o.textContent; }, list[0].id);
    R.check("the night list has the saved theme by name", night === "Night reading", String(night));
    await page.selectOption("#autoNight", "c:" + list[0].id);
    R.check("a saved theme can be the night theme", (await state("autoNight")) === "c:" + list[0].id);
    await page.click('#autoChips .chip[data-auto="off"]');

    /* 5. a reload keeps the saved themes, the selection and the night choice */
    await page.evaluate((id) => window.llThemes.select("c:" + id), list[1].id);
    const bgBefore = await cssVar("--bg"), metaBefore = await meta();
    await page.reload({ waitUntil: "load" });
    const again = await page.evaluate(() => ({ theme: window.__ll.state.theme, customs: window.llThemes.customs(), autoNight: window.__ll.state.autoNight }));
    R.check("saved themes survive a reload", again.customs.length === 2 && again.customs[0].name === "Night reading" && again.customs[1].name === "Night reading copy", JSON.stringify(again.customs.map((c) => c.name)));
    R.check("the selected custom theme survives a reload", again.theme === "c:" + list[1].id && (await cssVar("--bg")) === bgBefore, again.theme);
    R.check("theme-color meta is right after a reload", (await meta()) === metaBefore, await meta());
    R.check("the night theme choice survives a reload", again.autoNight === "c:" + list[0].id, again.autoNight);
    await openSheet();
    R.check("the editor shows the reloaded theme", (await page.$eval("#customRow", (r) => r.classList.contains("show"))) && (await text("#cName")) === "Night reading copy");

    /* the old single scratch theme is carried over once */
    await page.evaluate(() => localStorage.setItem("ll_prefs", JSON.stringify({ theme: "custom", custom: { bg: "#223344", ink: "#e7e2d6", accent: "#e0a458", autoInk: true }, autoNight: "custom" })));
    await page.reload({ waitUntil: "load" });
    const mig = await page.evaluate(() => ({ theme: window.__ll.state.theme, customs: window.llThemes.customs(), autoNight: window.__ll.state.autoNight, bg: document.documentElement.style.getPropertyValue("--bg") }));
    R.check("an old scratch custom theme becomes \u201CMy theme\u201D", mig.customs.length === 1 && mig.customs[0].name === "My theme" && mig.customs[0].bg === "#223344" && mig.theme === "c:" + mig.customs[0].id && mig.autoNight === mig.theme && mig.bg === "#223344", JSON.stringify(mig));
    await page.reload({ waitUntil: "load" });
    R.check("it is carried over only once", (await customs()).length === 1);
    await page.evaluate(() => localStorage.setItem("ll_prefs", JSON.stringify({ theme: "c:nope", customs: [{ id: "ok", name: "Fine", bg: "#112233", ink: "#ffffff", autoInk: false, accent: "#ffcc00" }, { id: "bad", name: "Bad", bg: "red", accent: "#000" }, "junk", { id: "ok", name: "Twice", bg: "#000000", accent: "#ffffff" }] })));
    await page.reload({ waitUntil: "load" });
    const val = await page.evaluate(() => ({ theme: window.__ll.state.theme, customs: window.llThemes.customs() }));
    R.check("bad saved themes are dropped and an unknown selection falls back to Day", val.customs.length === 1 && val.customs[0].id === "ok" && val.customs[0].name === "Fine" && val.theme === "day", JSON.stringify(val));

    /* 8. screenshots of the editor: desktop and phone, light and dark */
    await page.evaluate(() => localStorage.removeItem("ll_prefs"));
    await page.reload({ waitUntil: "load" });
    await page.addStyleTag({ content: "#sheet{max-height:none !important;}" });   /* the whole editor in one picture */
    for (const [width, height] of [[1200, 800], [390, 844]]){
      await page.setViewportSize({ width, height });
      for (const seed of ["paper", "midnight"]){
        await page.evaluate((seed) => { window.llThemes.select(seed); window.llThemes.create(); }, seed);
        await openSheet();
        await page.$eval(".cst-adv", (d, open) => { d.open = open; }, seed === "midnight");
        await page.waitForTimeout(250);
        const file = path.join(SHOTS, "themes-editor-" + width + "-" + (seed === "paper" ? "light" : "dark") + ".png");
        await page.locator("#sheet").screenshot({ path: file });
        console.log("  shot " + file);
      }
    }
    R.check("no horizontal scroll at phone width", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    const unnamed = await page.$$eval("#themeChips button, #customRow input, #customRow button, #autoRow select", (els) => els.filter((el) =>
      !(el.getAttribute("aria-label") || (el.tagName === "BUTTON" && el.textContent.trim()) || (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest("label"))).map((el) => el.tagName + "#" + el.id));
    R.check("every theme control has an accessible name", !unnamed.length, unnamed.join(","));
    const tap = await page.$$eval("#customRow input[type=color], #customRow .sw", (els) => els.filter((el) => { const b = el.getBoundingClientRect(); return b.width < 36 || b.height < 36; }).length);
    R.check("pickers and swatches are at least 36px tap targets", tap === 0, tap + " too small");
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
  } catch (err){ R.check("(exception)", false, String(err).split("\n")[0]); console.log(err.stack); }
  await b.close(); server.close();
  process.exit(R.done());
})();
