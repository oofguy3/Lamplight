/* Type and themes, upgraded: text weight on variable families, letter / word / paragraph
   spacing, the Reset link, and the warmth overlay (its strength, its blend, its night window
   and the contrast it leaves behind). Screenshots go to $LL_SHOTS (default: the OS temp dir).
     NODE_PATH=$(npm root -g) node tests/type2.js */
const path = require("path"), os = require("os"), fs = require("fs");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = path.join(process.env.LL_SHOTS || os.tmpdir(), "lamplight-type2");

/* a fixed wall clock inside the page, so the night window can be asked about at 22:00 and 10:00 */
function fakeClock(iso){
  return function(when){
    var Real = Date, fixed = new Real(when).getTime();
    function D(a, b, c, d, e, f, g){
      if (arguments.length === 0) return new Real(fixed);
      if (arguments.length === 1) return new Real(a);
      return new Real(a, b, c, d, e || 0, f || 0, g || 0);
    }
    D.now = function(){ return fixed; };
    D.parse = Real.parse; D.UTC = Real.UTC; D.prototype = Real.prototype;
    window.Date = D;
  };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const section = (t) => console.log("\n" + t);
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); console.log(err.stack); } };
  const css = (page, sel, prop) => page.$eval(sel, (el, p) => getComputedStyle(el)[p], prop);
  const varOf = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const state = (page, k) => page.evaluate((k) => window.__ll.state[k], k);
  const setTheme = async (page, t) => { await page.evaluate((t) => window.llThemes.select(t), t); await page.waitForTimeout(500); };
  const warmOpacity = (page) => page.evaluate(() => parseFloat(document.getElementById("warmth").style.opacity || "0"));

  /* the real composited pixels of a patch of text: the page colour is the one that covers most
     of it, the ink the colour furthest from it that still has a body of pixels. The screenshot
     is decoded in the page itself (a canvas), so no PNG reader is needed here. */
  async function sampleContrast(page, buf){
    const b64 = buf.toString("base64");
    return page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const counts = new Map();
      for (let i = 0; i < d.length; i += 4){
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      const lum = (k) => {
        const ch = [(k >> 16) & 255, (k >> 8) & 255, k & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
      };
      let bg = 0, bgN = 0;
      counts.forEach((n, k) => { if (n > bgN){ bgN = n; bg = k; } });
      const Lbg = lum(bg);
      let ink = bg, far = -1;
      counts.forEach((n, k) => { if (n < 25) return; const dist = Math.abs(lum(k) - Lbg); if (dist > far){ far = dist; ink = k; } });
      const Link = lum(ink);
      const hex = (k) => "#" + k.toString(16).padStart(6, "0");
      return { bg: hex(bg), ink: hex(ink), ratio: (Math.max(Lbg, Link) + 0.05) / (Math.min(Lbg, Link) + 0.05) };
    }, b64);
  }
  /* a long paragraph of plain body text: shot as it is composited on screen, warm film included */
  async function textShot(page){
    const i = await page.evaluate(() => Array.from(document.querySelectorAll("#doc p")).findIndex((p) => p.textContent.length > 120));
    return page.locator("#doc p").nth(i).screenshot();
  }

  /* ---------------- weight ---------------- */
  section("Weight");
  await guard("weight", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");

    const lex = await page.evaluate(() => window.llType.range("lexend"));
    R.check("Lexend is a variable family: the slider runs 300–800", lex.min === 300 && lex.max === 800 && lex.two === false, JSON.stringify(lex));
    const geo = await page.evaluate(() => window.llType.range("serif"));
    R.check("Georgia has two weights: 400 and 700 in one step", geo.min === 400 && geo.max === 700 && geo.two === true && geo.step === 300, JSON.stringify(geo));

    await page.evaluate(() => { window.__ll.state.font = "lexend"; window.llType.apply(); });
    await page.waitForTimeout(400);
    const bounds = await page.$eval("#rWeight", (i) => ({ min: i.min, max: i.max, step: i.step }));
    R.check("choosing Lexend opens the slider to 300–800", bounds.min === "300" && bounds.max === "800" && bounds.step === "50", JSON.stringify(bounds));
    R.check("the Weight row is not dimmed for a variable family", !(await page.$eval("#weightRow", (r) => r.classList.contains("two-weights"))) && (await page.$eval("#weightNote", (n) => n.hidden)));

    await page.$eval("#rWeight", (i) => { i.value = "650"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(400);
    R.check("650 reaches --fw and the document", (await varOf(page, "--fw")) === "650" && (await css(page, "#doc", "fontWeight")) === "650");
    R.check("the value reads 650 in the sheet", (await page.$eval("#vWeight", (v) => v.textContent)) === "650", await page.$eval("#vWeight", (v) => v.textContent));
    const strong = await page.evaluate(() => {
      const s = document.querySelector("#doc strong, #doc b");
      return s ? parseInt(getComputedStyle(s).fontWeight, 10) : null;
    });
    R.check("bold in the text is at least 850 at weight 650", strong !== null && strong >= 850, String(strong));
    const head = await page.evaluate(() => parseInt(getComputedStyle(document.querySelector("#doc h1, #doc h2")).fontWeight, 10));
    R.check("headings step ahead of a half-bold text (750 at 650)", head === 750 && (await varOf(page, "--fwh")) === "750", String(head));

    await page.evaluate(() => { window.__ll.state.weight = 400; window.llType.apply(); });
    await page.waitForTimeout(250);
    R.check("at weight 400 headings are back at 700 and bold at 700", (await varOf(page, "--fwh")) === "700" && (await varOf(page, "--fwb")) === "700");

    /* back to a two-weight family */
    await page.evaluate(() => { window.__ll.state.weight = 650; window.__ll.state.font = "serif"; window.llType.apply(); });
    await page.waitForTimeout(400);
    R.check("Georgia snaps the weight to 700", (await state(page, "weight")) === 700 && (await varOf(page, "--fw")) === "700");
    const geoB = await page.$eval("#rWeight", (i) => ({ min: i.min, max: i.max, step: i.step }));
    R.check("its slider has only the two stops", geoB.min === "400" && geoB.max === "700" && geoB.step === "300", JSON.stringify(geoB));
    R.check("the row is dimmed and says so", (await page.$eval("#weightRow", (r) => r.classList.contains("two-weights"))) && !(await page.$eval("#weightNote", (n) => n.hidden)) &&
      /two weights/.test(await page.$eval("#weightNote", (n) => n.textContent)));
    const dimmed = parseFloat(await css(page, "#rWeight", "opacity"));
    R.check("only the control fades — the label and the value keep their contrast", dimmed < 1 && parseFloat(await css(page, "#vWeight", "opacity")) === 1, String(dimmed));
    await page.evaluate(() => { window.__ll.state.weight = 400; window.__ll.state.font = "serif"; window.llType.apply(); });

    /* the popover and the sheet are the same control twice */
    await page.evaluate(() => { window.__ll.state.font = "lexend"; window.__ll.state.weight = 650; window.llType.apply(); });
    await page.waitForTimeout(300);
    await page.click("#gear"); await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById("qMore").open = true; });
    R.check("opening the popover brings the weight over from the sheet",
      (await page.$eval("#qWeight", (i) => i.value)) === "650" && (await page.$eval("#qWeightV", (v) => v.textContent)) === "650" &&
      (await page.$eval("#qWeight", (i) => i.max)) === "800");
    await page.$eval("#qWeight", (i) => { i.value = "350"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(300);
    R.check("moving it in the popover moves the sheet's too", (await page.$eval("#rWeight", (i) => i.value)) === "350" && (await page.$eval("#vWeight", (v) => v.textContent)) === "350");
    await page.evaluate(() => { window.__ll.state.font = "serif"; window.__ll.state.weight = 400; window.llType.apply(); });
    await page.waitForTimeout(250);
    await page.$eval("#qLs", (i) => { i.value = "0.06"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(300);
    R.check("a change in the popover shows up in the sheet", (await page.$eval("#rLs", (i) => i.value)) === "0.06" && (await page.$eval("#vLs", (v) => v.textContent)) === "0.06 em");
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    await page.$eval("#rLs", (i) => { i.value = "0"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.click("#gear"); await page.waitForTimeout(300);
    R.check("and a change in the sheet shows up in the popover", (await page.$eval("#qLs", (i) => i.value)) === "0" && (await page.$eval("#qLsV", (v) => v.textContent)) === "0.00 em");
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- letter, word and paragraph spacing ---------------- */
  section("Spacing");
  await guard("spacing", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");

    await page.$eval("#rLs", (i) => { i.value = "0.08"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(300);
    const fs0 = parseFloat(await css(page, "#doc", "fontSize"));
    R.check("Letters sets --ls and the document's letter spacing", (await varOf(page, "--ls")) === "0.08em" &&
      Math.abs(parseFloat(await css(page, "#doc", "letterSpacing")) - fs0 * 0.08) < 0.6, await css(page, "#doc", "letterSpacing"));

    await page.$eval("#rWs", (i) => { i.value = "0.3"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(300);
    R.check("Words sets --ws and the document's word spacing", (await varOf(page, "--ws")) === "0.3em" &&
      Math.abs(parseFloat(await css(page, "#doc", "wordSpacing")) - fs0 * 0.3) < 0.6, await css(page, "#doc", "wordSpacing"));

    const gap0 = parseFloat(await css(page, "#doc p", "marginBottom"));
    await page.$eval("#rPgap", (i) => { i.value = "1.8"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(300);
    const gap1 = parseFloat(await css(page, "#doc p", "marginBottom"));
    R.check("Paragraphs sets --pgap and the gap under a paragraph", (await varOf(page, "--pgap")) === "1.8em" && gap1 > gap0 + 8, gap0 + " → " + gap1);
    R.check("list items take the same gap", Math.abs(parseFloat(await css(page, "#doc li", "marginBottom")) - gap1) < 0.6);
    R.check("the value rows read in em", (await page.$eval("#vLs", (v) => v.textContent)) === "0.08 em" && (await page.$eval("#vPgap", (v) => v.textContent)) === "1.80 em");
    R.check("the preview takes the same weight and spacing", (await css(page, "#typePreview", "letterSpacing")) === (await css(page, "#doc", "letterSpacing")) &&
      (await css(page, "#typePreview", "wordSpacing")) === (await css(page, "#doc", "wordSpacing")));

    /* Pages flow re-lays out through applyType's own path */
    await page.evaluate(() => { window.llType.reset(); });
    await page.waitForTimeout(300);
    await page.keyboard.press("p"); await page.waitForTimeout(700);
    const pages0 = await state(page, "totalPages");
    await page.$eval("#rLs", (i) => { i.value = "0.12"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(800);
    const pages1 = await state(page, "totalPages");
    R.check("Pages flow re-lays out: wide letter spacing needs more pages", pages0 > 1 && pages1 > pages0, pages0 + " → " + pages1);
    await page.keyboard.press("p"); await page.waitForTimeout(500);

    /* Reset */
    await page.evaluate(() => {
      const s = window.__ll.state;
      s.size = 24; s.lh = 2.1; s.width = 900; s.margin = 40; s.weight = 700; s.ls = 0.1; s.ws = 0.2; s.pgap = 1.6; s.justify = true; s.hyphens = true;
      window.llType.apply();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.llPop.sheetAt("#textGroup"));
    await page.waitForTimeout(500);
    await page.click("#typeReset"); await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const s = window.__ll.state;
      return { size: s.size, lh: s.lh, width: s.width, margin: s.margin, weight: s.weight, ls: s.ls, ws: s.ws, pgap: s.pgap, justify: s.justify, hyphens: s.hyphens, font: s.font };
    });
    R.check("Reset puts every typography setting back to its default",
      after.size === 19 && after.lh === 1.75 && after.width === 720 && after.margin === 0 && after.weight === 400 &&
      after.ls === 0 && after.ws === 0 && after.pgap === 0.95 && after.justify === false && after.hyphens === false, JSON.stringify(after));
    const toast = await page.evaluate(() => { const t = document.getElementById("toast"); return t ? t.textContent : ""; });
    R.check("and says so", /Text settings reset/.test(toast), toast);

    /* the defaults survive a reload */
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(600);
    const back = await page.evaluate(() => { const s = window.__ll.state; return { size: s.size, weight: s.weight, ls: s.ls, ws: s.ws, pgap: s.pgap }; });
    R.check("the reset settings persist across a reload", back.size === 19 && back.weight === 400 && back.ls === 0 && back.ws === 0 && back.pgap === 0.95, JSON.stringify(back));
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- warmth ---------------- */
  section("Warmth");
  await guard("warmth", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await setTheme(page, "day");

    R.check("the overlay is there, fixed over everything and deaf to the pointer", await page.evaluate(() => {
      const w = document.getElementById("warmth"), cs = getComputedStyle(w);
      return cs.position === "fixed" && cs.pointerEvents === "none" && parseInt(cs.zIndex, 10) >= 1000 && document.elementsFromPoint(600, 400).indexOf(w) < 0;
    }));
    R.check("at 0 % nothing is added", (await warmOpacity(page)) === 0);

    await page.$eval("#rWarm", (i) => { i.value = "50"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(500);
    const half = await warmOpacity(page);
    await page.$eval("#rWarm", (i) => { i.value = "100"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(500);
    const full = await warmOpacity(page);
    R.check("the opacity follows the slider, half at 50 %", full > 0 && Math.abs(half - full / 2) < 0.002, half + " / " + full);
    R.check("the value reads 100 % in the sheet and the lamp popover",
      (await page.$eval("#vWarm", (v) => v.textContent)) === "100 %" && (await page.$eval("#qWarmV", (v) => v.textContent)) === "100 %" &&
      (await page.$eval("#qWarm", (i) => i.value)) === "100");
    R.check("a light theme multiplies its warm amber", (await css(page, "#warmth", "mixBlendMode")) === "multiply" &&
      (await css(page, "#warmth", "backgroundColor")) === "rgb(255, 150, 50)");

    /* the composited pixels of a patch of body text, before and after */
    await page.waitForTimeout(300);
    const dayWarm = await sampleContrast(page, await textShot(page));
    await page.evaluate(() => window.llType.warmth.set(0)); await page.waitForTimeout(600);
    const dayPlain = await sampleContrast(page, await textShot(page));
    R.check("Day at 100 %: the page really is warmer on screen", dayWarm.bg !== dayPlain.bg, dayPlain.bg + " → " + dayWarm.bg);
    R.check("Day at 100 %: sampled text contrast stays at 4.5:1 or better", dayWarm.ratio >= 4.5,
      dayWarm.ink + " on " + dayWarm.bg + " = " + dayWarm.ratio.toFixed(2) + ":1 (was " + dayPlain.ratio.toFixed(2) + ")");

    await setTheme(page, "dusk");
    await page.evaluate(() => window.llType.warmth.set(100)); await page.waitForTimeout(700);
    R.check("a dark theme screens instead, at a lower strength", (await css(page, "#warmth", "mixBlendMode")) === "screen" &&
      (await page.evaluate(() => document.body.classList.contains("warm-dark"))) && (await warmOpacity(page)) < full);
    await page.waitForTimeout(300);
    const duskWarm = await sampleContrast(page, await textShot(page));
    await page.evaluate(() => window.llType.warmth.set(0)); await page.waitForTimeout(600);
    const duskPlain = await sampleContrast(page, await textShot(page));
    R.check("Dusk at 100 %: the page really is warmer on screen", duskWarm.bg !== duskPlain.bg, duskPlain.bg + " → " + duskWarm.bg);
    R.check("Dusk at 100 %: sampled text contrast stays at 4.5:1 or better", duskWarm.ratio >= 4.5,
      duskWarm.ink + " on " + duskWarm.bg + " = " + duskWarm.ratio.toFixed(2) + ":1 (was " + duskPlain.ratio.toFixed(2) + ")");

    /* every built-in theme, through the film the app would really put on it */
    const audit = await page.evaluate(() => {
      const T = window.llThemes.THEMES, W = window.llType.warmth, C = window.llThemes.contrast;
      const pairs = [["ink", "bg"], ["ink", "panel"], ["muted", "bg"], ["muted", "panel"]];
      const keep = window.__ll.state.theme, out = [];
      for (const id in T){
        window.llThemes.select(id);
        W.set(100);
        const a = W.opacity(), screen = document.body.classList.contains("warm-dark");
        let lo = 99;
        pairs.forEach(function(p){
          const r = C(W.through(T[id][p[0]], screen, a), W.through(T[id][p[1]], screen, a));
          if (r < lo) lo = r;
        });
        out.push({ id: id, a: Math.round(a * 1000) / 1000, screen: screen, lo: Math.round(lo * 100) / 100 });
      }
      W.set(0); window.llThemes.select(keep);
      return out;
    });
    const low = audit.filter((t) => t.lo < 4.5);
    R.check("all 30 themes keep their text at 4.5:1 through a full-strength film", audit.length === 30 && low.length === 0,
      low.map((t) => t.id + " " + t.lo).join(", "));
    R.check("a roomy theme wears the full film, a tight one less", audit.some((t) => t.a >= 0.34) && audit.some((t) => !t.screen && t.a < 0.2),
      audit.map((t) => t.id + ":" + t.a).join(" "));

    /* paper and forced colours have no evening */
    await page.evaluate(() => window.llType.warmth.set(100)); await page.waitForTimeout(400);
    await page.emulateMedia({ media: "print" });
    R.check("the film is off on paper", (await css(page, "#warmth", "display")) === "none");
    await page.emulateMedia({ media: "screen" });
    await page.emulateMedia({ forcedColors: "active" });
    R.check("the film is off under forced colours", (await css(page, "#warmth", "display")) === "none");
    await page.emulateMedia({ forcedColors: "none" });
    await page.evaluate(() => window.llType.warmth.set(0));
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- warm at night ---------------- */
  section("Warm at night");
  await guard("night", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, timezoneId: "UTC" });
    await ctx.addInitScript(fakeClock(), "2024-01-15T22:00:00Z");
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await setTheme(page, "day");
    await page.evaluate(() => { window.llType.warmth.set(80); window.llType.warmth.setAuto(true); });
    await page.waitForTimeout(500);
    R.check("at 22:00 with Warm at night on, the film is on", (await page.evaluate(() => window.llType.warmth.isNight())) === true &&
      (await page.evaluate(() => window.llType.warmth.level())) === 80 && (await warmOpacity(page)) > 0);
    R.check("both checkboxes show it", (await page.$eval("#cWarmAuto", (c) => c.checked)) && (await page.$eval("#qWarmAuto", (c) => c.checked)));
    R.check("the hint says the film is on now", /night now/.test(await page.$eval("#warmHint", (h) => h.textContent)));

    await page.evaluate((fn) => { new Function("when", "(" + fn + ")(when)")("2024-01-15T10:00:00Z"); window.llType.warmth.apply(); },
      String(fakeClock()));
    await page.waitForTimeout(500);
    R.check("at 10:00 the same setting leaves the screen alone", (await page.evaluate(() => window.llType.warmth.isNight())) === false &&
      (await page.evaluate(() => window.llType.warmth.level())) === 0 && (await warmOpacity(page)) === 0);
    R.check("the slider still remembers the chosen level", (await state(page, "warmth")) === 80 && (await page.$eval("#rWarm", (i) => i.value)) === "80");
    R.check("the hint says it is waiting for the night", /night window/.test(await page.$eval("#warmHint", (h) => h.textContent)));

    /* with Auto on, the window is Auto's own */
    await page.evaluate(() => {
      const s = window.__ll.state;
      s.auto = "time"; s.nightFrom = "09:00"; s.nightTo = "18:00";
      window.__ll.AutoTheme.apply(); window.llType.warmth.apply();
    });
    await page.waitForTimeout(400);
    R.check("with Auto by time, warmth follows Auto's night window", (await page.evaluate(() => window.llType.warmth.isNight())) === true &&
      (await warmOpacity(page)) > 0);

    await page.evaluate(() => { const s = window.__ll.state; s.auto = "off"; window.llType.warmth.setAuto(false); window.llType.warmth.set(0); });
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- what is remembered ---------------- */
  section("Remembered settings");
  await guard("prefs", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await page.evaluate(() => {
      const s = window.__ll.state;
      s.font = "lexend"; s.weight = 600; s.ls = 0.05; s.ws = 0.16; s.pgap = 1.3;
      window.llType.apply(); window.llType.warmth.set(40); window.llType.warmth.setAuto(true);
    });
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(700);
    const kept = await page.evaluate(() => { const s = window.__ll.state; return { weight: s.weight, ls: s.ls, ws: s.ws, pgap: s.pgap, warmth: s.warmth, warmAuto: s.warmAuto }; });
    R.check("weight, spacing, warmth and the night switch all come back",
      kept.weight === 600 && kept.ls === 0.05 && kept.ws === 0.16 && kept.pgap === 1.3 && kept.warmth === 40 && kept.warmAuto === true, JSON.stringify(kept));
    R.check("and the rows show them", (await page.$eval("#rWeight", (i) => i.value)) === "600" && (await page.$eval("#vWarm", (v) => v.textContent)) === "40 %");

    /* nonsense in storage falls back to the defaults */
    await page.evaluate(() => {
      const o = JSON.parse(localStorage.getItem("ll_prefs") || "{}");
      o.weight = "heavy"; o.ls = 99; o.ws = -3; o.pgap = null; o.warmth = 5000; o.warmAuto = "yes";
      localStorage.setItem("ll_prefs", JSON.stringify(o));
    });
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(700);
    const safe = await page.evaluate(() => { const s = window.__ll.state; return { weight: s.weight, ls: s.ls, ws: s.ws, pgap: s.pgap, warmth: s.warmth, warmAuto: s.warmAuto }; });
    R.check("bad stored values fall back to the defaults or the nearest legal value",
      safe.weight === 400 && safe.ls === 0.12 && safe.ws === 0 && safe.pgap === 0.95 && safe.warmth === 100 && safe.warmAuto === false, JSON.stringify(safe));
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- screenshots ---------------- */
  section("Screenshots");
  for (const size of [{ w: 1200, h: 800, tag: "desktop" }, { w: 390, h: 844, tag: "phone" }]){
    for (const theme of ["day", "dusk"]){
      await guard("shots " + size.tag + " " + theme, async () => {
        const ctx = await b.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: size.w < 500, isMobile: size.w < 500 });
        const page = await newPage(ctx, url);
        await openFixture(page, "sample.md");
        await setTheme(page, theme);
        const shot = (n) => page.screenshot({ path: path.join(SHOTS, size.tag + "-" + theme + "-" + n + ".png") });
        await page.evaluate(() => window.llPop.sheetAt("#textGroup")); await page.waitForTimeout(700);
        await shot("text-group");
        await page.evaluate(() => window.llPop.sheetAt("#themeGroup")); await page.waitForTimeout(700);
        await shot("theme-group");
        await page.evaluate(() => window.llPop.sheet(false)); await page.waitForTimeout(400);
        await page.click("#gear"); await page.waitForTimeout(350);
        await page.evaluate(() => { document.getElementById("qMore").open = true; }); await page.waitForTimeout(250);
        await shot("type-popover");
        await page.keyboard.press("Escape"); await page.waitForTimeout(300);
        await page.click("#lamp"); await page.waitForTimeout(350);
        await shot("theme-popover");
        await page.keyboard.press("Escape"); await page.waitForTimeout(300);
        await shot("warm-0");
        await page.evaluate(() => window.llType.warmth.set(100)); await page.waitForTimeout(700);
        await shot("warm-100");
        await page.evaluate(() => window.llType.warmth.set(0));
        R.check("screenshots " + size.tag + " " + theme + ": no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
        await ctx.close();
      });
    }
  }
  console.log("screenshots in " + SHOTS);

  await b.close(); server.close();
  process.exit(R.done());
})();
