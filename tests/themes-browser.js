/* Themes in the browser: every built-in applies; the six looks, in the settings sheet and the lamp's
   popover (their names, each drawn as its day theme and night theme side by side, the look on
   screen marked); t between day and night; the custom editor on a theme made with llThemes.create
   (pickers and hex fields, the contrast meter and Fix contrast, rename / duplicate / save as /
   delete); New theme opening the maker; the old scratch theme's migration, persistence across a
   reload, the day / night lists and the theme-color meta. Screenshots of the editor go to $LL_SHOTS
   (default: the OS temp dir). */
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
  /* a look, t or a built-in picked by id cross-fades (the theme lands a frame or two later): wait for it */
  const settle = (k) => page.waitForFunction((t) => window.__ll.state.theme === t, k, { timeout: 1500 }).catch(() => {});
  /* a hex colour as getComputedStyle gives it */
  const asRgb = (h) => "rgb(" + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ") + ")";
  const NAMES = ["Day & Dusk", "Paper & Ink", "Sepia & Cocoa", "Sage & Forest", "Sea air & Canals", "Contrast"];
  try {
    /* 1. every built-in theme applies */
    const THEMES = await page.evaluate(() => window.llThemes.THEMES);
    const ids = Object.keys(THEMES);
    let applied = 0, wrong = [];
    for (const id of ids){
      await page.evaluate((id) => window.llThemes.select(id), id);
      if ((await cssVar("--bg")) === THEMES[id].bg.toLowerCase() && (await cssVar("--panel")) === THEMES[id].panel.toLowerCase() &&
          (await cssVar("--raise")).toLowerCase() === THEMES[id].raise.toLowerCase() && (await cssVar("--lamp")).toLowerCase() === THEMES[id].lamp.toLowerCase()) applied++; else wrong.push(id);
    }
    R.check("every built-in theme applies, its raised surface and lamp too (" + applied + " of " + ids.length + ")", applied === ids.length && ids.length === 12, wrong.join(","));
    /* the looks: a day theme and a night theme each, in the picker's order */
    const LOOKS = await page.evaluate(() => window.llThemes.LOOKS);
    const pairs = LOOKS.map((l) => l.id + ":" + l.day + "/" + l.night).join(",");
    R.check("the looks pair the built-ins, day half first: Day & Dusk, Paper & Ink, Sepia & Cocoa, Sage & Forest, Sea air & Canals, Contrast",
      pairs === "day:day/dusk,paper:paper/ink,sepia:sepia/cocoa,sage:sage/forest,seaair:seaair/canals,hicon:hicon/hidark" && LOOKS.every((l) => THEMES[l.day] && THEMES[l.night]), pairs);
    await page.evaluate(() => window.llThemes.pick("day")); await settle("day");
    await openSheet();
    const tiles = await page.evaluate(() => ({ names: Array.from(document.querySelectorAll("#themeChips .tile.look .tile-n")).map((n) => n.textContent),
      labels: Array.from(document.querySelectorAll("#themeChips .sub-label")).map((l) => l.textContent), looks: document.querySelectorAll("#themeChips .tile.look").length,
      own: document.querySelectorAll("#themeChips .chip[data-theme]").length, pages: Array.from(document.querySelectorAll("#themeChips .tile.look .pg")).map((g) => g.dataset.t).join(",") }));
    R.check("the sheet's tiles are named for the six looks, then Mine", tiles.names.join("|") === NAMES.join("|") && tiles.labels.join("|") === "Mine", JSON.stringify(tiles));
    R.check("one tile per look, drawing its two themes, and none for a single built-in", tiles.looks === 6 && tiles.own === 0 && tiles.pages === LOOKS.map((l) => l.day + "," + l.night).join(","), JSON.stringify(tiles));
    /* each half is a small page in its theme's colours: the page, "Aa" in the text colour, lines of
       secondary text, the panel strip and the lamp on it (the expected values from the table) */
    const sw = await page.$$eval('#themeChips [data-look="sepia"] .pg', (pgs) => pgs.map((g) => ({ t: g.dataset.t, bg: getComputedStyle(g).backgroundColor, ink: getComputedStyle(g.querySelector("b")).color,
      muted: getComputedStyle(g.querySelector("s")).backgroundColor, panel: getComputedStyle(g.querySelector("u")).backgroundColor, lamp: getComputedStyle(g.querySelector("em")).backgroundColor, x: g.getBoundingClientRect().left })));
    const want = (id) => ({ t: id, bg: asRgb(THEMES[id].bg), ink: asRgb(THEMES[id].ink), muted: asRgb(THEMES[id].muted), panel: asRgb(THEMES[id].panel), lamp: asRgb(THEMES[id].lamp) });
    R.check("the Sepia & Cocoa tile draws Sepia on the left and Cocoa on the right: page, text, secondary text, panel and lamp",
      sw.length === 2 && sw[0].x < sw[1].x && ["sepia", "cocoa"].every((id, i) => Object.entries(want(id)).every(([k, v]) => sw[i][k] === v)), JSON.stringify(sw));
    await page.evaluate(() => window.llThemes.pick("hidark")); await settle("hidark");
    const pressed = await page.$$eval('#themeChips .chip[aria-pressed="true"]', (els) => els.map((e) => e.dataset.look || e.dataset.theme).join(","));
    R.check("the look of the theme on screen is marked, and only it", pressed === "hicon", pressed);

    /* 2. the lamp opens the theme popover on the look on screen; t switches day / night */
    await page.evaluate(() => window.llThemes.pick("cocoa")); await settle("cocoa");
    await page.click("#lamp"); await page.waitForTimeout(150);
    R.check("the lamp opens the theme popover", await page.evaluate(() => window.llPop.is("theme") && document.getElementById("pop").classList.contains("open") && document.getElementById("lamp").getAttribute("aria-expanded") === "true"));
    const rows = await page.evaluate(() => ({ looks: Array.from(document.querySelectorAll("#qLooks .tile.look")).map((c) => c.dataset.look).join(","), names: Array.from(document.querySelectorAll("#qLooks .tile.look .tile-n")).map((n) => n.textContent).join("|"),
      on: Array.from(document.querySelectorAll('#qLooks .chip[aria-pressed="true"]')).map((c) => c.dataset.look).join(","), focus: document.activeElement && document.activeElement.dataset.look }));
    R.check("the popover lists the six looks in order, with the current one marked", rows.looks === LOOKS.map((l) => l.id).join(",") && rows.names === NAMES.join("|") && rows.on === "sepia", JSON.stringify(rows));
    R.check("the popover opens on the current look: its tile has the focus", rows.focus === "sepia", JSON.stringify(rows));
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    /* back to Day & Dusk, with Day on screen; t cross-fades too */
    await page.evaluate(() => window.llThemes.pick("day")); await settle("day");
    await page.keyboard.press("t"); await settle("dusk");
    R.check("the t key goes to the night theme", (await state("theme")) === "dusk", await state("theme"));
    await page.keyboard.press("t"); await settle("day");
    R.check("t again goes back to the day theme", (await state("theme")) === "day", await state("theme"));
    await page.evaluate(() => window.llThemes.select("paper"));
    await page.keyboard.press("t"); await settle("dusk");
    R.check("from a light theme that is neither, t goes to the night theme", (await state("theme")) === "dusk", await state("theme"));

    /* 7. theme-color meta */
    await page.evaluate(() => window.llThemes.select("dusk"));
    R.check("theme-color meta follows the panel", (await meta()) === THEMES.dusk.panel.toLowerCase(), await meta());

    /* 3. a saved theme from the colours on screen (llThemes.create; New theme opens the maker, 3b
       below), and the editor on it */
    await page.evaluate(() => window.llThemes.select("paper"));
    await page.evaluate(() => window.llThemes.create());
    let theme = await state("theme"), list = await customs();
    R.check("llThemes.create() makes a saved theme and selects it", /^c:/.test(theme) && list.length === 1 && theme === "c:" + list[0].id, theme);
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
    /* Custom 1 went into the day half (Paper, a light page, was on screen) and each copy took its
       place there, so the deleted theme was the day half on screen: that half falls back to Day and
       stays on screen, and the night half keeps Dusk */
    const del = await page.evaluate(() => { const s = window.__ll.state; return { theme: s.theme, pair: s.autoDay + "/" + s.autoNight, editor: document.getElementById("customRow").classList.contains("show") }; });
    R.check("after a delete, the day half shows its fallback, Day, and the editor closes", del.theme === "day" && del.pair === "day/dusk" && !del.editor, JSON.stringify(del));

    /* 6. the day / night lists */
    await page.click('#autoChips .chip[data-auto="time"]');
    const og = await page.$$eval("#autoDay optgroup", (gs) => gs.map((g) => ({ label: g.label, n: g.querySelectorAll("option").length })));
    R.check("the day list is grouped Light, Dark and Mine, every built-in under Light or Dark, and lists the saved themes",
      og.map((g) => g.label).join(",") === "Light,Dark,Mine" && og[0].n + og[1].n === ids.length && og[2].n === 2, JSON.stringify(og));
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

    /* 7b. a theme saved from a light built-in derives secondary text that reads on the panel too */
    const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (const seed of ["day", "sepia", "paper"]){
      await page.evaluate((s) => window.llThemes.select(s), seed);
      await openSheet();
      await page.evaluate(() => window.llThemes.create()); await page.waitForTimeout(100);
      const got = await page.evaluate(() => { const st = document.documentElement.style; return { muted: st.getPropertyValue("--muted").trim(), panel: st.getPropertyValue("--panel").trim(), bg: st.getPropertyValue("--bg").trim(),
        low: Array.from(document.querySelectorAll("#cMeter .meter-row.low")).map((r) => r.dataset.k), rows: document.querySelectorAll("#cMeter .meter-row").length, panelRow: !!document.querySelector('#cMeter [data-k="mutedPanel"]') }; });
      const onPanel = ratio(got.muted, got.panel), onBg = ratio(got.muted, got.bg);
      R.check("saved from " + seed + ": secondary text reads on the panel (" + onPanel.toFixed(2) + ") and the background (" + onBg.toFixed(2) + "), no meter row low", onPanel >= 4.5 && onBg >= 4.5 && !got.low.length && got.panelRow, JSON.stringify(got));
    }

    /* 3b. New theme opens the maker on the colours on screen, and Save puts the new theme on screen,
       in the half on screen */
    await page.evaluate(() => window.llThemes.select("paper"));
    await openSheet();
    const n0 = (await customs()).length;
    await page.click("#themeChips .chip-new");
    await page.waitForFunction(() => window.__ll.Side.is("maker") && document.getElementById("mkSave"), null, { timeout: 5000 }).catch(() => {});
    const mk = await page.evaluate(() => ({ title: document.getElementById("sideTitle").textContent, name: (document.getElementById("mkName") || {}).value, draft: window.llThemes.maker.draft() }));
    await page.click("#mkSave");
    await page.waitForFunction((n) => { const c = window.llThemes.customs(); return c.length === n + 1 && window.__ll.state.theme === "c:" + c[n].id; }, n0, { timeout: 5000 }).catch(() => {});
    const made = await page.evaluate(() => { const c = window.llThemes.customs(), last = c[c.length - 1];
      return { n: c.length, theme: window.__ll.state.theme, id: last ? "c:" + last.id : null, name: last && last.name, bg: last && last.bg, day: window.__ll.state.autoDay, maker: window.__ll.Side.is("maker") }; });
    R.check("New theme opens the maker on the colours on screen, and Save puts the new theme on screen",
      mk.title === "Your own theme" && mk.name === "My Paper" && !!mk.draft && mk.draft.bg === THEMES.paper.bg.toLowerCase() &&
      made.n === n0 + 1 && made.theme === made.id && made.day === made.id && made.name === "My Paper" && made.bg === THEMES.paper.bg.toLowerCase() && !made.maker, JSON.stringify({ mk, made }));

    /* 8. screenshots of the editor: desktop and phone, light and dark. A clean profile with Day and night
       off: with nothing stored the reload would be a first run, on Follow phone, and the first theme made
       would bring its one-time toast ("Day and night is on: …") into the pictures */
    await page.evaluate(() => localStorage.setItem("ll_prefs", JSON.stringify({ auto: "off" })));
    await page.reload({ waitUntil: "load" });
    await page.addStyleTag({ content: "#sheet{max-height:none !important;}" });   /* the whole editor in one picture */
    for (const [width, height] of [[1200, 800], [390, 844]]){
      await page.setViewportSize({ width, height });
      for (const seed of ["paper", "canals"]){
        await page.evaluate((seed) => { window.llThemes.select(seed); window.llThemes.create(); }, seed);
        await openSheet();
        await page.$eval(".cst-adv", (d, open) => { d.open = open; }, seed === "canals");
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
