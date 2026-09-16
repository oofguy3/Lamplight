/* Regression pass over the features that existed before the 2026-09 additions:
   library + resume, tabs, marks, search, contents, explain card, reading aids, keyboard
   shortcuts, settings, PDF controls, the service worker (offline reload, dictionary offline),
   the update toast and the install manifest.  NODE_PATH=$(npm root -g) node tests/regression.js */
const fs = require("fs"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport, ROOT } = require("./lib");

/* a fake speech engine so read-aloud can be exercised headlessly */
const SPEECH_STUB = `(() => {
  const voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true }, { name: "Daniel", lang: "en-GB", localService: true, default: false }];
  window.__spoken = [];
  const synth = { getVoices(){ return voices; }, speak(u){ window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend({}), 30); },
    cancel(){}, pause(){}, resume(){}, addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
  /* the real speechSynthesis is an accessor on window: replace it with a plain property */
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
})();`;

async function textPoint(page, word){
  return page.evaluate((word) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.textContent.indexOf(word) >= 0) break;
    if (!n) return null;
    const i = n.textContent.indexOf(word), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length);
    let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 2); b = r.getBoundingClientRect();
    return { x: b.left + 3, y: b.top + b.height / 2, right: b.right - 3 };
  }, word);
}

(async () => {
  let swVersion = null;
  const { server, url, overrides } = await serve(0, { overrides: {
    "/sw.js": () => { const src = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"); return swVersion ? src.replace(/const VERSION = "[^"]+"/, 'const VERSION = "' + swVersion + '"') : src; }
  } });
  const b = await browser();
  const R = makeReport();
  const section = (t) => console.log("\n" + t);
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); } };

  /* ---------------- reading, library, tabs, marks, search, contents ---------------- */
  section("Library, tabs, marks, search, contents");
  await guard("library", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addInitScript(SPEECH_STUB);
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    R.check("title shows the file", /sample\.md/.test(await page.title()));
    /* scroll a good way in, wait for the position to be saved, then reload and reopen from the library */
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.6));
    await page.waitForTimeout(900);
    const wanted = await page.evaluate(() => window.__ll.Library.topCharOffset());
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".lib-item").length > 0, null, { timeout: 10000 });
    const libText = await page.$eval("#libList", (e) => e.textContent);
    R.check("library lists the file with a percentage", /sample\.md/.test(await page.$eval("#libList", (e) => e.innerHTML)) && /\d+%/.test(libText), libText.slice(0, 80));
    await page.click(".lib-item");
    await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && window.scrollY > 200, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const got = await page.evaluate(() => window.__ll.Library.topCharOffset());
    R.check("reopening resumes at the saved place", Math.abs(got - wanted) < 400, "wanted " + wanted + " got " + got);

    /* a second file becomes a tab; Ctrl+Tab switches */
    await page.setInputFiles("#fileInput", [path.join(__dirname, "fixtures", "sample.txt")]);
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 2, null, { timeout: 15000 });
    R.check("two open files show as tabs", true);
    await page.keyboard.press("Control+Tab"); await page.waitForTimeout(800);
    R.check("Ctrl+Tab switches document", /sample\.md/.test(await page.title()), await page.title());
    await page.click("#tabs .tab.on .tab-x"); await page.waitForTimeout(500);
    R.check("closing the active tab shows the other file", /sample\.txt/.test(await page.title()), await page.title());
    await openFixture(page, "sample.md");

    /* marks: bookmark, highlight from a selection, panel, export */
    await page.keyboard.press("b"); await page.waitForTimeout(300);
    const pt = await textPoint(page, "extraordinary");
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.right + 60, pt.y, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(() => document.getElementById("dictPill").classList.contains("on"), null, { timeout: 5000 }).catch(() => null);
    const pillOn = await page.$eval("#dictPill", (p) => p.classList.contains("on"));
    R.check("selecting text shows the Explain / Highlight pill", pillOn);
    if (pillOn) await page.click("#dictPill [data-act=mark]");
    await page.waitForTimeout(300);
    const marks = await page.evaluate(() => document.querySelectorAll("#doc mark.ll-mark").length);
    R.check("highlight drawn in the text", marks >= 1, String(marks));
    await page.keyboard.press("n"); await page.waitForTimeout(400);
    const panel = await page.$eval("#side", (s) => s.classList.contains("open") ? s.textContent : "");
    R.check("Bookmarks & notes panel lists both", /Bookmark/i.test(panel) && /extraordinary/.test(panel), panel.slice(0, 120));
    const md = await page.evaluate(() => window.__ll.Marks.toMarkdown());
    R.check("notes export as Markdown", /## Highlights/.test(md) && /extraordinary/.test(md));
    await page.keyboard.press("Escape");
    /* marks survive a reload */
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".lib-item").length > 0, null, { timeout: 10000 });
    await page.click(".lib-item");
    await page.waitForFunction(() => document.querySelectorAll("#doc mark.ll-mark").length >= 1, null, { timeout: 15000 }).catch(() => null);
    R.check("highlights persist across reload", (await page.evaluate(() => document.querySelectorAll("#doc mark.ll-mark").length)) >= 1);

    /* search */
    await page.keyboard.press("/"); await page.waitForTimeout(300);
    await page.keyboard.type("punctual"); await page.waitForTimeout(600);
    const found = await page.evaluate(() => document.querySelectorAll(".find-item").length);
    R.check("search lists matches", found >= 1, String(found));
    await page.keyboard.press("Enter"); await page.waitForTimeout(400);
    R.check("search keeps the panel open with a current match", await page.evaluate(() => !!document.querySelector(".find-item.cur")));
    await page.keyboard.press("Escape");
    /* contents */
    await page.keyboard.press("c"); await page.waitForTimeout(300);
    const toc = await page.evaluate(() => Array.from(document.querySelectorAll(".toc-item")).map((t) => t.textContent.trim()));
    R.check("contents lists the chapters", toc.length >= 4 && toc.some((t) => /Chapter 2/.test(t)), toc.join(" | ").slice(0, 100));
    await page.click(".toc-item:nth-child(3)"); await page.waitForTimeout(400);
    R.check("contents entry scrolls the text", (await page.evaluate(() => window.scrollY)) > 50);
    await page.keyboard.press("Escape");
    /* explain card by right-click */
    const sp = await textPoint(page, "Nobody could have");
    await page.mouse.click(sp.x, sp.y, { button: "right" });
    await page.waitForFunction(() => /main clause|parts|who \/ what/.test(document.getElementById("dictCard").textContent), null, { timeout: 20000 }).catch(() => null);
    const card = await page.$eval("#dictCard", (c) => c.textContent);
    R.check("explain card breaks the sentence down", /Nobody could have predicted/.test(card) && /did what|who \/ what/.test(card), card.slice(0, 120));
    R.check("explain card glosses key words", /Key words/.test(card) || /In plainer words/.test(card));
    await page.keyboard.press("Escape");
    /* read aloud with the stubbed engine */
    await page.keyboard.press("r"); await page.waitForTimeout(700);
    const spoken = await page.evaluate(() => window.__spoken.length);
    R.check("read aloud speaks sentences", spoken >= 2 && (await page.$eval("#tts", (t) => t.classList.contains("on"))), String(spoken));
    await page.keyboard.press("r"); await page.waitForTimeout(200);
    R.check("read aloud stops", await page.$eval("#tts", (t) => !t.classList.contains("on")));
    /* ruler + auto-scroll */
    await page.keyboard.press("l"); await page.waitForTimeout(200);
    R.check("ruler toggles on", await page.$eval("#ruler", (r) => r.classList.contains("on")));
    await page.keyboard.press("l");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press("a"); await page.waitForTimeout(1800);
    R.check("auto-scroll moves the page", (await page.evaluate(() => window.scrollY)) > 5 && (await page.$eval("#autoBar", (a) => a.classList.contains("on"))));
    await page.keyboard.press("a");
    /* keyboard help, settings sheet, theme cycle, text size */
    await page.keyboard.press("?"); await page.waitForTimeout(300);
    R.check("keyboard shortcuts panel", /Keyboard shortcuts/.test(await page.$eval("#sideTitle", (t) => t.textContent)));
    await page.keyboard.press("Escape");
    await page.keyboard.press("s"); await page.waitForTimeout(300);
    R.check("settings sheet opens with s", await page.$eval("#sheet", (s) => s.classList.contains("open")));
    const t0 = await page.evaluate(() => window.__ll.state.theme);
    await page.keyboard.press("t"); await page.waitForTimeout(100);
    R.check("t cycles the theme", (await page.evaluate(() => window.__ll.state.theme)) !== t0);
    const s0 = await page.evaluate(() => window.__ll.state.size);
    await page.keyboard.press("+"); await page.waitForTimeout(100);
    R.check("+ grows the text", (await page.evaluate(() => window.__ll.state.size)) === s0 + 1);
    await page.keyboard.press("-");
    await page.keyboard.press("Escape");
    /* pages flow: bars hide on middle tap, Home/End */
    await page.keyboard.press("p"); await page.waitForTimeout(500);
    await page.keyboard.press("End"); await page.waitForTimeout(400);
    const info = await page.$eval("#pgInfo", (e) => e.textContent);
    R.check("End goes to the last page", (() => { const m = /(\d+) \/ (\d+)$/.exec(info); return m && m[1] === m[2]; })(), info);
    await page.keyboard.press("Home"); await page.waitForTimeout(400);
    R.check("Home goes to the first page", /^1 \//.test(await page.$eval("#pgInfo", (e) => e.textContent)));
    await page.keyboard.press("p");
    await page.keyboard.press("h"); await page.waitForTimeout(300);
    R.check("h goes home to the library", await page.$eval("#library", (l) => l.classList.contains("show")));
    R.check("no page errors in the session", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- PDF controls ---------------- */
  section("PDF");
  await guard("pdf", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.pdf");
    const w0 = await page.$eval("#pdf canvas", (c) => c.getBoundingClientRect().width);
    await page.keyboard.press("+"); await page.waitForTimeout(900);
    const w1 = await page.$eval("#pdf canvas", (c) => c.getBoundingClientRect().width);
    R.check("zoom enlarges the page", w1 > w0, w0 + " -> " + w1);
    await page.keyboard.press("-"); await page.waitForTimeout(300);
    await page.keyboard.press("c"); await page.waitForTimeout(600);
    const toc = await page.evaluate(() => Array.from(document.querySelectorAll(".toc-item")).map((t) => t.textContent.trim()));
    R.check("PDF outline in Contents", toc.length === 5 && /Chapter 3/.test(toc.join(" ")), toc.join(" | "));
    await page.click(".toc-item:nth-child(4)"); await page.waitForTimeout(700);
    R.check("outline entry scrolls to page 4", (await page.evaluate(() => window.__ll.Library.currentPdfPage())) === 4);
    await page.keyboard.press("Escape");
    await page.keyboard.press("/"); await page.waitForTimeout(300); await page.keyboard.type("Chapter 5"); await page.waitForTimeout(2500);
    const hits = await page.evaluate(() => document.querySelectorAll(".find-item").length);
    R.check("search finds text in the PDF", hits >= 1, String(hits));
    await page.keyboard.press("Escape");
    /* dark theme softens pages */
    await page.evaluate(() => { window.__ll.state.theme = "dusk"; });
    await page.keyboard.press("t"); await page.waitForTimeout(200);
    R.check("dark theme softens PDF pages", await page.evaluate(() => document.body.classList.contains("soften")));
    R.check("no page errors (pdf)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------------- install manifest ---------------- */
  section("Install");
  await guard("install", async () => {
    const ctx = await b.newContext();
    const page = await newPage(ctx, url);
    const man = await page.evaluate(async () => { const r = await fetch(document.querySelector("link[rel=manifest]").href); return { ok: r.ok, type: r.headers.get("content-type"), json: await r.json() }; });
    R.check("manifest is served and valid", man.ok && man.json.name === "Lamplight" && man.json.display === "standalone" && man.json.start_url && man.json.scope);
    R.check("manifest icons exist", await page.evaluate(async (icons) => { for (const i of icons){ const r = await fetch(i.src); if (!r.ok) return false; } return true; }, man.json.icons));
    R.check("manifest has 192 and 512 icons incl. maskable", man.json.icons.some((i) => i.sizes === "192x192") && man.json.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
    R.check("file handlers and share target declared", !!(man.json.file_handlers && man.json.share_target && man.json.shortcuts));
    await ctx.close();
  });

  /* ---------------- service worker: offline reload, dictionary offline, update toast ---------------- */
  section("Offline and updates");
  await guard("offline", async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await newPage(ctx, url);
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 60000 }).catch(() => null);
    const controlled = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    R.check("service worker controls the page", controlled);
    /* wait until the precache holds the shell and every dictionary chunk */
    const cached = await page.evaluate(async () => {
      for (let i = 0; i < 120; i++){
        const keys = await caches.keys(); const k = keys.filter((x) => /^lamplight-\d/.test(x))[0];
        if (k){ const c = await caches.open(k); const all = await c.keys(); const urls = all.map((r) => r.url);
          if (urls.some((u) => /app\.js$/.test(u)) && urls.filter((u) => /dict\d\.json$/.test(u)).length === 6 && urls.some((u) => /explain\.js$/.test(u))) return { key: k, n: urls.length }; }
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    });
    R.check("precache holds the app, explainer and all dictionary chunks", !!cached, JSON.stringify(cached));
    const version = await page.evaluate(() => new Promise((res) => { navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "VERSION") res(e.data.version); }); navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }); setTimeout(() => res(null), 3000); }));
    R.check("worker reports its version", !!version, String(version));
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    R.check("app reloads offline", await page.evaluate(() => !!document.getElementById("openBtn") && getComputedStyle(document.body).backgroundColor !== ""));
    await openFixture(page, "sample.txt");
    R.check("a file opens offline", /lamp hums/.test(await page.$eval("#doc", (d) => d.textContent)));
    const pt = await textPoint(page, "quietly");
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction(() => /quiet/.test((document.querySelector("#dictCard .term") || {}).textContent || ""), null, { timeout: 30000 }).catch(() => null);
    const term = await page.evaluate(() => (document.querySelector("#dictCard .term") || {}).textContent || "");
    R.check("dictionary works offline", /quiet/.test(term), term);
    await page.keyboard.press("Escape");
    const sp = await textPoint(page, "Nobody could have");
    await page.mouse.click(sp.x, sp.y, { button: "right" });
    await page.waitForFunction(() => /did what|who \/ what/.test(document.getElementById("dictCard").textContent), null, { timeout: 30000 }).catch(() => null);
    R.check("explainer works offline", /did what|who \/ what/.test(await page.$eval("#dictCard", (c) => c.textContent)));
    R.check("offline note shown, no AI button", await page.evaluate(() => /Offline/.test(document.getElementById("dictCard").textContent) && !document.getElementById("dictAiBtn")));
    await page.keyboard.press("Escape");
    await ctx.setOffline(false);
    /* a new release: the server now hands out sw.js with a bumped VERSION */
    swVersion = "9999.test-1";
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.waitForSelector("#updateToast", { timeout: 30000 }).catch(() => null);
    R.check("update toast appears for a new version", await page.evaluate(() => !!document.getElementById("updateToast")));
    const nav = page.waitForNavigation({ waitUntil: "load", timeout: 30000 }).catch(() => null);
    await page.click("#updateReload").catch(() => null);
    await nav;
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => null);
    const v2 = await page.evaluate(() => new Promise((res) => { navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "VERSION") res(e.data.version); }); navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }); setTimeout(() => res(null), 3000); }));
    R.check("reload switches to the new version", v2 === "9999.test-1", String(v2));
    const oldGone = await page.evaluate(async () => { const keys = await caches.keys(); return keys.filter((k) => /^lamplight-\d/.test(k)); });
    R.check("old cache is removed on activate", oldGone.length === 1 && /9999/.test(oldGone[0]), oldGone.join(","));
    /* app shortcut: ?action=continue reopens the last book */
    await page.goto(url + "?action=continue", { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("docView").style.display === "block", null, { timeout: 15000 }).catch(() => null);
    R.check("?action=continue reopens the last file", /sample\.txt/.test(await page.title()), await page.title());
    R.check("no page errors (offline/updates)", !(page._errors || []).length, (page._errors || []).join(" | "));
    swVersion = null;
    await ctx.close();
  });

  /* ---------------- phone width and accessibility basics ---------------- */
  section("Phone width");
  await guard("phone", async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await newPage(ctx, url);
    await openFixture(page, "sample.epub");
    R.check("EPUB title from metadata", /The Lamp/.test(await page.$eval("#fname", (e) => e.textContent)), await page.$eval("#fname", (e) => e.textContent));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    R.check("no horizontal overflow on a phone", !overflow);
    await page.tap("#gear"); await page.waitForTimeout(300);
    R.check("settings sheet opens on touch", await page.$eval("#sheet", (s) => s.classList.contains("open")));
    const sheetOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    R.check("sheet fits the phone width", !sheetOverflow);
    await page.tap("#gear");
    /* every button has an accessible name */
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll("button")).filter((b) => b.offsetParent !== null && !(b.textContent.trim() || b.getAttribute("aria-label") || b.getAttribute("title"))).map((b) => b.id || b.className));
    R.check("all visible buttons have a name", unnamed.length === 0, unnamed.join(","));
    await ctx.close();
  });

  await b.close(); server.close();
  process.exit(R.done());
})();
