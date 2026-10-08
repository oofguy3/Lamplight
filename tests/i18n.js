/* The interface's language (i18n.js): English and Dutch.
   Node: the Dutch table's own checks (placeholders, formal "u") and every literal key the scripts pass to
   _t / _tc / _tn / plural has Dutch. Browser: an English device gets English, a Dutch device Dutch (the
   static markup, the language row), no key without Dutch on the main screens (ll_i18n_debug logs them),
   Dutch numbers, dates and "3 uur geleden", and switching the language in Settings keeps the book and the place.
     NODE_PATH=$(npm root -g) node tests/i18n.js                                                        */
const fs = require("fs"), path = require("path");
const L = require("./lib.js");
const I = require("../i18n.js");

(async () => {
  const R = L.makeReport();

  /* ---- the table ---- */
  R.check("table: placeholders match and no formal “u”", I.check().length === 0, I.check().slice(0, 5).join(" | "));
  const S = String.raw`"(?:[^"\\]|\\.)*"`;
  const miss = [];
  function has(k, ctx){ return (ctx && (ctx + "|" + k) in I.NL) || k in I.NL; }
  for (const f of ["app.js", "audiobook.js", "translate.js", "sounds.js", "explain.js", "morph.js"]){
    const src = fs.readFileSync(path.join(L.ROOT, f), "utf8");
    for (const m of src.matchAll(new RegExp(String.raw`\b_t\((` + S + `)`, "g"))){ const k = JSON.parse(m[1]); if (!has(k)) miss.push(f + ": " + k); }
    for (const m of src.matchAll(new RegExp(String.raw`\b_tc\((` + S + String.raw`),\s*(` + S + `)`, "g"))){ const k = JSON.parse(m[2]); if (!has(k, JSON.parse(m[1]))) miss.push(f + ": " + k); }
    for (const m of src.matchAll(new RegExp(String.raw`\b(?:_tn|plural)\([^,()]+(?:\([^()]*\))?[^,()]*,\s*(` + S + String.raw`),\s*(` + S + `)`, "g"))){
      [m[1], m[2]].forEach((x) => { const k = JSON.parse(x); if (!has(k)) miss.push(f + ": " + k); });
    }
  }
  /* the comment at the top of app.js shows the call with an example key */
  const real = miss.filter((x) => !/: 1 book$/.test(x));
  R.check("table: every literal key in the scripts has Dutch", real.length === 0, real.slice(0, 8).join(" | "));

  const { server, url } = await L.serve(0);
  const b = await L.browser();
  try {
    /* ---- an English device ---- */
    const en = await b.newContext({ locale: "en-US", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p1 = await L.newPage(en, url);
    await p1.waitForTimeout(300);
    const e1 = await p1.evaluate(() => ({ lang: document.documentElement.lang, open: document.getElementById("openBtn2").textContent.trim(),
      chips: [...document.querySelectorAll("#uiLangChips .chip")].map((c) => c.textContent + ":" + c.getAttribute("aria-pressed")), setting: LL_I18N.setting(), l: LL_I18N.lang() }));
    R.check("English device: English interface, Automatic chosen", e1.lang === "en" && e1.open === "Open a file" && e1.l === "en" && e1.setting === "auto" && e1.chips[0] === "Automatic:true", JSON.stringify(e1));
    await en.close();

    /* ---- a Dutch device, with the debug log on ---- */
    const nl = await b.newContext({ locale: "nl-NL", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await nl.addInitScript(() => { try { localStorage.setItem("ll_i18n_debug", "1"); localStorage.setItem("ll_tips", "seen"); } catch(_){} });
    const noDutch = new Set();
    nl.on("console", (m) => { const k = /^\[i18n\] no Dutch for: ([\s\S]*)$/.exec(m.text()); if (k) noDutch.add(k[1]); });
    const p2 = await L.newPage(nl, url);
    await p2.waitForTimeout(300);
    const d1 = await p2.evaluate(() => ({ lang: document.documentElement.lang, open: document.getElementById("openBtn2").textContent.trim(),
      h1: document.querySelector(".hero h1").textContent, search: document.getElementById("searchBtn").getAttribute("aria-label"),
      label: document.getElementById("uiLangL").textContent, chips: [...document.querySelectorAll("#uiLangChips .chip")].map((c) => c.textContent + ":" + c.getAttribute("aria-pressed")),
      num: LL_I18N.num(1.5), ago: LL_I18N.ago(Date.now() - 3 * 3600e3 - 60e3), now: LL_I18N.ago(Date.now()), date: LL_I18N.date(new Date(2026, 8, 29)) }));
    R.check("Dutch device: Dutch markup", d1.lang === "nl" && d1.open === "Bestand openen" && d1.h1 === "Een rustige plek om te lezen." && d1.search === "Zoeken in het document", JSON.stringify(d1));
    R.check("Dutch device: the language row", d1.label === "Taal van de app" && d1.chips.join() === "Automatisch:true,Nederlands:false,English:false", JSON.stringify(d1.chips));
    R.check("Dutch device: 1,5 · 3 uur geleden · zojuist · 29 sep 2026", d1.num === "1,5" && d1.ago === "3 uur geleden" && d1.now === "zojuist" && /^29 sep\.? 2026$/.test(d1.date), JSON.stringify(d1));

    /* the main screens with a book open */
    await L.openFixture(p2, "sample.txt");
    const screens = await p2.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      document.getElementById("more").click(); await wait(300);
      out.menu = [...document.querySelectorAll("#moreMenu button[role=menuitem]")].map((x) => x.textContent.replace(/­/g, "").trim());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(200);
      window.llPop.sheet(true); await wait(300); window.llPop.sheet(false);
      window.llSpeak.openPanel(); await wait(400); window.__ll.Side.close();
      window.llStats.openPanel(); await wait(300); window.__ll.Side.close();
      window.llStorage.openPanel(); await wait(800); window.__ll.Side.close();
      window.llJournal.openPanel(); await wait(300); window.__ll.Side.close();
      window.llAbout.openPanel(); await wait(1200); window.__ll.Side.close();
      window.__ll.Sounds.openPanel(); await wait(800); window.__ll.Side.close();
      window.llDict.defineWord("unexpected"); await wait(1500);
      out.pos = [...document.querySelectorAll("#dictCard .pos")].map((x) => x.textContent);
      return out;
    });
    /* a phone while reading: Read aloud (Voorlezen) is in the dock, not the sheet */
    R.check("Dutch device: the menu in Dutch", ["Bladwijzer zetten", "Wat voorafging…", "Leesstatistieken", "Bestand openen…"].every((w) => screens.menu.some((x) => x.indexOf(w) === 0)) &&
      !screens.menu.some((x) => x.indexOf("Voorlezen") === 0), JSON.stringify(screens.menu));
    R.check("Dutch device: the word class in the card is Dutch", screens.pos.length && screens.pos.every((x) => /naamwoord|werkwoord|bijwoord/.test(x)), JSON.stringify(screens.pos));
    R.check("Dutch device: no key without Dutch on the main screens", noDutch.size === 0, [...noDutch].slice(0, 8).join(" | "));
    await p2.keyboard.press("Escape");

    /* switch to English in the settings: the page reloads at the same place */
    await p2.evaluate(() => { const h = document.documentElement; window.scrollTo(0, (h.scrollHeight - h.clientHeight) * 0.5); });
    await p2.waitForTimeout(900);
    const before = await p2.evaluate(() => ({ off: window.__ll.Library.topCharOffset(), id: window.__ll.Library.currentId() }));
    await p2.evaluate(() => window.llPop.sheet(true));
    await p2.waitForTimeout(300);
    const nav = p2.waitForNavigation({ waitUntil: "load" });
    await p2.evaluate(() => document.querySelector('#uiLangChips .chip[data-uilang="en"]').click());
    await nav;
    await p2.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 100, null, { timeout: 15000 });
    await p2.waitForTimeout(1500);
    await p2.evaluate(() => { const c = document.getElementById("sheetClose"); if (c) c.click(); });
    await p2.waitForTimeout(500);
    const after = await p2.evaluate(() => ({ off: window.__ll.Library.topCharOffset(), id: window.__ll.Library.currentId(), lang: document.documentElement.lang, setting: LL_I18N.setting(),
      open: document.getElementById("openBtn2").textContent.trim() }));
    R.check("switch to English: English after the reload", after.lang === "en" && after.setting === "en" && after.open === "Open a file", JSON.stringify(after));
    R.check("switch to English: same book, same place", after.id === before.id && Math.abs(after.off - before.off) < 400, JSON.stringify({ before, after }));
    R.check("Dutch device: no page errors", !(p2._errors || []).length, (p2._errors || []).join(" | "));
    await nl.close();
  } catch (e){ R.check("ran without throwing", false, String(e && e.stack || e)); }
  await b.close(); server.close();
  process.exit(R.done());
})();
