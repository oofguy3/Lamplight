/* Speed reading and focus reading: focus reading on and off on a long plain-text book in a time budget (a .txt is
   one big text node, cut into paragraphs and put back together), the text unchanged by it, a search hit's highlight
   kept once its paragraph is bolded; speed reading keeping its word when the app is left, closing on Back, landing
   the book on its word, and its handling of Dutch (abbreviations, the recognition letter, long compounds).
     NODE_PATH=$(npm root -g) node tests/reading.js */
const path = require("path"), fs = require("fs"), os = require("os");
const { serve, browser, openFixture, makeReport } = require("./lib");

/* a long plain-text book, made here rather than kept as a fixture: about 1 000 000 characters in 4 500 paragraphs, with
   accented letters and curly apostrophes (as a Dutch novel has: its text is then stored two bytes a letter) */
function longBook(){
  const words = ["de", "lamp", "brandde", "nog", "toen", "zij", "het", "boek", "dichtsloeg", "en", "naar", "buiten", "keek", "waar", "regen", "over",
    "straat", "liep", "eensklaps", "hoorde", "hij", "voetstappen", "op", "trap", "maar", "niemand", "kwam", "binnen", "stilte", "bleef", "één", "café", "zo’n"];
  let seed = 7;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };     /* Park–Miller: the same book every run */
  const paras = [];
  for (let p = 0; p < 4500; p++){
    const sents = [];
    for (let s = 0; s < 3; s++){
      const n = 8 + rnd(10), ws = [];
      for (let k = 0; k < n; k++) ws.push(words[rnd(words.length)]);
      ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1);
      sents.push(ws.join(" ") + ".");
    }
    paras.push(sents.join(" "));
  }
  const file = path.join(os.tmpdir(), "lamplight-long.txt");
  fs.writeFileSync(file, paras.join("\n\n") + "\n");
  return file;
}

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const errors = [];
  let page, st;

  /* ---------- 1. focus reading on a long .txt, and search with it ---------- */
  const A = await b.newContext({ viewport: { width: 412, height: 860 } });
  page = await A.newPage();
  page.on("pageerror", (e) => errors.push("A: " + e));
  await page.goto(url, { waitUntil: "load" });
  await page.setInputFiles("#fileInput", longBook());
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 900000, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const text0 = await page.evaluate(() => document.getElementById("doc").textContent);
  const setFocus = (on) => page.evaluate((on) => { const c = document.getElementById("cFocus"); c.checked = on; const t0 = performance.now(); c.dispatchEvent(new Event("change")); return Math.round(performance.now() - t0); }, on);
  let ms = await setFocus(true);
  await page.waitForTimeout(1200);
  st = await page.evaluate(() => ({ bold: document.querySelectorAll("#doc b.ll-focus").length, chunks: document.querySelectorAll("#doc span.ll-fchunk").length }));
  R.check("focus on, on a " + text0.length + "-character .txt: well under 2 s (cutting it into paragraphs was quadratic)", ms < 2000 && st.bold > 0 && st.chunks > 4000, ms + " ms, " + JSON.stringify(st));
  /* a search hit far on, in a paragraph not bolded yet, whose end falls inside a word's bold start ("eens" in "eensklaps") */
  await page.evaluate(() => window.Search.openPanel());
  await page.fill("#findInput", "eens");
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.Search.go(300); window.__ll.Side.close(); });
  await page.waitForTimeout(100);
  const right = await page.evaluate(() => { const h = CSS.highlights.get("ll-find-cur"), r = h && Array.from(h)[0]; return r ? r.toString() : null; });
  await page.waitForTimeout(1500);
  st = await page.evaluate(() => {
    const h = CSS.highlights.get("ll-find-cur"), r = h && Array.from(h)[0];
    return { n: window.Search.results().length, cur: r ? r.toString() : null, inBold: !!(r && r.startContainer.parentNode && r.startContainer.parentNode.closest("b.ll-focus")) };
  });
  R.check("with focus on, a search hit gone to keeps its highlight once its paragraph is bolded", right === "eens" && st.n > 300 && st.cur === "eens" && st.inBold, JSON.stringify(st) + " right after: " + right);
  for (let k = 0; k < 20; k++){ await page.evaluate(() => window.scrollBy(0, innerHeight * 0.9)); await page.waitForTimeout(60); }
  await page.waitForTimeout(600);
  ms = await setFocus(false);
  st = await page.evaluate(() => ({ bold: document.querySelectorAll("#doc b.ll-focus").length, chunks: document.querySelectorAll("#doc span.ll-fchunk").length, nodes: window.__ll.Anchor.textNodes().length, same: false }));
  const text1 = await page.evaluate(() => document.getElementById("doc").textContent);
  R.check("focus off: under 2 s (putting it back together took minutes), back to one text node, the text exactly as it was", ms < 2000 && st.bold === 0 && st.chunks === 0 && st.nodes === 1 && text1 === text0, ms + " ms, " + JSON.stringify(st));
  await A.close();

  /* ---------- 2. speed reading: its word is the place ---------- */
  const C = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  page = await C.newPage();
  page.on("pageerror", (e) => errors.push("C: " + e));
  page.on("dialog", (d) => d.accept());
  await page.goto(url, { waitUntil: "load" });
  await openFixture(page, "sample.txt");
  const saved = () => page.evaluate(() => new Promise((res) => { const id = window.__ll.Library.currentId();
    window.__ll.Library.tx("positions", "readonly", (s) => { const q = s.get(id); q.onsuccess = () => res(q.result ? q.result.off : null); }); }));
  await page.evaluate(() => window.llRsvp.open());
  await page.evaluate(() => { for (let k = 0; k < 12; k++) window.llRsvp.fwd(); });
  const s1 = await page.evaluate(() => window.llRsvp.state());
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(400);
  const off1 = await saved();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });
  R.check("the app left with speed reading open saves the word it is at", s1.offset > 0 && off1 === s1.offset, JSON.stringify({ word: s1.offset, saved: off1 }));
  await page.goBack();
  await page.waitForTimeout(800);
  st = await page.evaluate(() => ({ open: window.llRsvp.isOpen(), mode: window.__ll.state.mode, top: window.__ll.Library.topCharOffset() }));
  R.check("Back closes speed reading (the app stays) and the book is at its word", !st.open && st.mode === "doc" && Math.abs(st.top - s1.offset) < 120, JSON.stringify(st) + " word " + s1.offset);
  await page.evaluate(() => { window.llRsvp.open(); window.llRsvp.fwd(); window.llRsvp.fwd(); });
  const s2 = await page.evaluate(() => window.llRsvp.state());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  st = await page.evaluate(() => ({ open: window.llRsvp.isOpen(), top: window.__ll.Library.topCharOffset() }));
  R.check("closing it any other way lands the book on its word too", !st.open && Math.abs(st.top - s2.offset) < 120, JSON.stringify(st) + " word " + s2.offset);
  await C.close();

  /* ---------- 3. speed reading in Dutch ---------- */
  const D = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  page = await D.newPage();
  page.on("pageerror", (e) => errors.push("D: " + e));
  await page.goto(url, { waitUntil: "load" });
  const nl = path.join(os.tmpdir(), "lamplight-nl.txt");
  fs.writeFileSync(nl, "De arbeidsongeschiktheidsverzekering van dhr. Jansen was verlopen. „Waarom?” vroeg zij. Het gaat o.a. om geld.\n");
  await page.setInputFiles("#fileInput", nl);
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && /Jansen/.test(document.getElementById("doc").textContent));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.llRsvp.open());
  st = await page.evaluate(() => {
    const L = window.llRsvp, n = L.state().words, out = {};
    const el = document.getElementById("rsvp"), o = el.querySelector(".rsvp-orp"), word = el.querySelector(".rsvp-word");
    for (let k = 0; k < n; k++){
      L.seek(k);
      const s = L.state();
      out[s.word] = { d: Math.round(L.delay(s.i)), orp: o.textContent, fs: parseFloat(getComputedStyle(word).fontSize) };
    }
    return { n, out, base: Math.round(L.delay(0)) };
  });
  const w = st.out;
  R.check("dhr. is not a sentence end: no long pause", w["dhr."] && w["dhr."].d < 1.5 * st.base, JSON.stringify(w["dhr."]));
  R.check("a question in dialogue that the sentence carries on after gets a pause", w["„Waarom?”"] && w["„Waarom?”"].d > 1.3 * st.base, JSON.stringify(w["„Waarom?”"]));
  R.check("o.a.: the recognition letter is a letter, not a dot", w["o.a."] && w["o.a."].orp === "a", JSON.stringify(w["o.a."]));
  const parts = Object.keys(w).filter((k) => /-$/.test(k));
  R.check("a long compound comes in frames with a hyphen, each at the full size", parts.length >= 2 && parts.concat(["verzekering"]).every((k) => w[k] && w[k].fs >= 30), JSON.stringify(parts.map((k) => k + " " + (w[k] && w[k].fs))));
  await D.close();

  R.check("no page errors", !errors.length, errors.join(" | "));
  await b.close(); server.close();
  process.exit(R.done());
})();
