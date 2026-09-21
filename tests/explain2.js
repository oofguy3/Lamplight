/* Explain and Simplify, upgraded, in the browser: the Simpler tab's four strengths (Light,
   Plain, Very plain, For a 10-year-old) which persist across a reload, and the Explain tab's
   Style line — the register as a pill, one row per figure of speech, and a row marking its own
   words in the quote above. Screenshots at two widths in Day and Dusk go to $LL_SHOTS
   (default: the OS temp dir).
     NODE_PATH=$(npm root -g) node tests/explain2.js */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-explain2");

const SENTENCE = "Outside, the unexpected rain had started again, and the street lights made the puddles glitter like spilled coins.";
const LEVELS = ["Light", "Plain", "Very plain", "For a 10-year-old"];

/* the screen rectangle of a phrase in the document, scrolled into view */
async function phraseRect(page, phrase){
  return page.evaluate((phrase) => {
    const w = document.createTreeWalker(document.getElementById("doc"), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.textContent.indexOf(phrase) >= 0) break;
    if (!n) return null;
    const i = n.textContent.indexOf(phrase), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + phrase.length);
    let b = r.getBoundingClientRect(); window.scrollBy(0, b.top - window.innerHeight / 2);
    const rects = Array.from(r.getClientRects());
    const first = rects[0], last = rects[rects.length - 1];
    return { x1: first.left + 2, y1: first.top + first.height / 2, x2: last.right - 2, y2: last.top + last.height / 2 };
  }, phrase);
}
async function selectPhrase(page, phrase){
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForTimeout(250);
  const b = await phraseRect(page, phrase);
  if (!b) throw new Error("phrase not in the text: " + phrase);
  await page.mouse.move(b.x1, b.y1); await page.mouse.down(); await page.mouse.move(b.x2, b.y2, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(350);
}
const styleInfo = (page) => page.evaluate(() => ({
  section: !!document.querySelector("#dictExpl .style"),
  header: (Array.from(document.querySelectorAll("#dictExpl .sec")).map((s) => s.textContent)[0]) || "",
  register: (document.querySelector("#dictExpl .reg .pill") || {}).textContent || "",
  note: (document.querySelector("#dictExpl .reg .rnote") || {}).textContent || "",
  rows: Array.from(document.querySelectorAll("#dictExpl .figrow")).map((b) => ({
    tag: b.tagName, pressed: b.getAttribute("aria-pressed"),
    kind: (b.querySelector(".pill") || {}).textContent, text: (b.querySelector(".ftext") || {}).textContent,
    note: (b.querySelector(".fnote") || {}).textContent
  })),
  /* the Style line must come before the clauses */
  first: (document.querySelector("#dictExpl > *") || {}).className,
  mark: (document.querySelector("#dictQuote mark.fig") || {}).textContent || null,
  quote: (document.getElementById("dictQuote") || {}).textContent || ""
}));
const levelInfo = (page) => page.evaluate(() => ({
  group: !!document.getElementById("simpLevels"),
  role: (document.getElementById("simpLevels") || {}).getAttribute ? document.getElementById("simpLevels").getAttribute("role") : null,
  labelled: (document.getElementById("simpLevels") || {}).getAttribute ? document.getElementById("simpLevels").getAttribute("aria-labelledby") : null,
  label: (document.getElementById("simpLevelL") || {}).textContent || "",
  chips: Array.from(document.querySelectorAll("#simpLevels .chip")).map((c) => ({ label: c.textContent, level: c.dataset.l, pressed: c.getAttribute("aria-pressed"), tag: c.tagName })),
  on: (Array.from(document.querySelectorAll("#simpLevels .chip")).find((c) => c.getAttribute("aria-pressed") === "true") || {}).textContent,
  simple: (document.querySelector("#dictCard .simple") || {}).textContent,
  summary: (document.getElementById("simpSum") || {}).textContent,
  stored: localStorage.getItem("ll_simplify_level")
}));
const simplerReady = (page) => page.waitForFunction(() => document.querySelector("#dictCard .simple") && document.getElementById("simpLevels"), null, { timeout: 30000 });
const explainReady = (page) => page.waitForFunction(() => document.querySelector("#dictCard .clause, #dictExpl .note"), null, { timeout: 30000 });
/* open the card on a tab for an arbitrary passage */
async function openOn(page, text, tab){
  await page.evaluate((t) => window.llSimplify.render(t, null), text);
  await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open"), null, { timeout: 20000 });
  if (tab !== "simpler") await page.click('#dictCard [role=tab][data-tab="' + tab + '"]');
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
  const setTheme = (page, key) => page.evaluate((k) => document.querySelector('#themeChips [data-theme="' + k + '"]').click(), key);

  /* ---- desktop ---- */
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  let page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  try {
    /* ---------- the Explain tab's Style line ---------- */
    await selectPhrase(page, SENTENCE);
    await page.click("#dictPill [data-act=lookup]");
    await explainReady(page);
    await page.waitForFunction(() => document.querySelector("#dictExpl .style"), null, { timeout: 20000 });
    let st = await styleInfo(page);
    /* the selection may leave the closing full stop out: the card's own quote is the truth */
    const QUOTE = st.quote;
    R.check("the Explain tab opens with a Style section above the clauses", st.section && st.header === "Style" && st.first === "sec", JSON.stringify({ header: st.header, first: st.first }));
    R.check("the register is a pill with a note beside it", st.register.length > 0 && st.note.length > 0, st.register + " / " + st.note);
    R.check("the simile is listed, quoted, with a note naming the coins",
      st.rows.some((x) => x.kind === "simile" && /spilled coins/.test(x.text) && /coins/.test(x.note)), JSON.stringify(st.rows));
    R.check("every device row is a real button, not pressed to begin with",
      st.rows.length >= 1 && st.rows.every((x) => x.tag === "BUTTON" && x.pressed === "false"), JSON.stringify(st.rows.map((x) => x.tag + ":" + x.pressed)));
    R.check("the quote starts unmarked", st.mark === null && QUOTE.indexOf("spilled coins") > 0, st.quote);
    await shot(page, "explain2-desktop-day-style");

    /* hovering a row marks its words in the quote */
    await page.hover("#dictExpl .figrow");
    await page.waitForTimeout(200);
    st = await styleInfo(page);
    R.check("hovering a device row marks its span in the quote", /spilled coins/.test(st.mark || ""), JSON.stringify(st.mark));
    R.check("…and the quote still reads the same", st.quote === QUOTE, st.quote);
    await shot(page, "explain2-desktop-day-hover");
    /* clicking holds the mark; clicking again lets it go */
    await page.click("#dictExpl .figrow");
    await page.waitForTimeout(150);
    await page.mouse.move(600, 20);
    await page.waitForTimeout(200);
    st = await styleInfo(page);
    R.check("tapping the row holds the mark and presses the button", st.rows[0].pressed === "true" && /spilled coins/.test(st.mark || ""), JSON.stringify({ pressed: st.rows[0].pressed, mark: st.mark }));
    await page.click("#dictExpl .figrow");
    await page.mouse.move(600, 20);
    await page.waitForTimeout(200);
    st = await styleInfo(page);
    R.check("tapping again clears it", st.rows[0].pressed === "false" && st.mark === null && st.quote === QUOTE, JSON.stringify({ pressed: st.rows[0].pressed, mark: st.mark }));

    /* a plain everyday sentence gets no Style line */
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    await openOn(page, "The cat sat on the mat.", "explain");
    await explainReady(page);
    await page.waitForTimeout(400);
    st = await styleInfo(page);
    R.check("plain everyday prose shows no Style line", !st.section && st.rows.length === 0, JSON.stringify({ section: st.section, rows: st.rows.length }));
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);

    /* ---------- the Simpler tab's four strengths ---------- */
    await selectPhrase(page, SENTENCE);
    await page.click("#dictPill [data-act=lookup]");
    await page.click('#dictCard [role=tab][data-m="simplify"]');
    await simplerReady(page);
    let L = await levelInfo(page);
    R.check("the Simpler tab offers the four strengths in order", L.chips.map((c) => c.label).join(" · ") === LEVELS.join(" · "), L.chips.map((c) => c.label).join(" · "));
    R.check("…as a labelled group of buttons with aria-pressed", L.group && L.role === "group" && L.labelled === "simpLevelL" && L.label === "How plain" &&
      L.chips.every((c) => c.tag === "BUTTON" && /^(true|false)$/.test(c.pressed)), JSON.stringify({ role: L.role, labelled: L.labelled, label: L.label }));
    R.check("Plain is the one chosen to begin with, and the summary names it", L.on === "Plain" && /^Plain · /.test(L.summary), L.on + " / " + L.summary);
    const plainText = L.simple;
    await shot(page, "explain2-desktop-day-plain");

    /* for a ten-year-old */
    await page.click('#simpLevels [data-l="kid"]');
    await page.waitForFunction((was) => { const s = document.querySelector("#dictCard .simple"); return s && s.textContent !== was; }, plainText, { timeout: 30000 });
    L = await levelInfo(page);
    const kidText = L.simple;
    R.check("choosing For a 10-year-old redraws the passage", kidText !== plainText && kidText.length > 0, kidText);
    R.check("…the chip is the pressed one and the summary names the level", L.on === "For a 10-year-old" && /^For a 10-year-old · /.test(L.summary), L.on + " / " + L.summary);
    R.check("…and the choice is remembered in ll_simplify_level", L.stored === "kid", String(L.stored));
    R.check("only one strength is pressed at a time", L.chips.filter((c) => c.pressed === "true").length === 1, JSON.stringify(L.chips.map((c) => c.pressed)));
    await shot(page, "explain2-desktop-day-kid");

    /* the lightest touch */
    await page.click('#simpLevels [data-l="light"]');
    await page.waitForFunction((was) => { const s = document.querySelector("#dictCard .simple"); return s && s.textContent !== was; }, kidText, { timeout: 30000 });
    L = await levelInfo(page);
    R.check("Light changes the least of the four", L.on === "Light" && L.simple !== kidText && L.simple.length >= plainText.length, L.simple);
    R.check("…and the summary names Light", /^Light · /.test(L.summary), L.summary);

    R.check("the four strengths are on window.llSimplify", await page.evaluate(() => {
      const S = window.llSimplify;
      return !!S && Array.isArray(S.levels) && S.levels.length === 4 && typeof S.level === "function" && S.level() === "light";
    }));
    const api = await page.evaluate(() => window.llSimplify.simplify("She smiled, although she was tired.", "kid").then((r) => ({ text: r.text, level: r.level })));
    /* at this strength the closing clause becomes its own sentence, and a rare word may pick up
       a short meaning in brackets on the way */
    R.check("llSimplify.simplify(text, level) simplifies at that level",
      api.level === "kid" && /^She smiled\. She was tired.*, though\.$/.test(api.text), JSON.stringify(api));
    const api2 = await page.evaluate(() => window.llSimplify.simplify("She smiled, although she was tired.").then((r) => ({ text: r.text, level: r.level })));
    R.check("…and with no level it uses the one the reader chose", api2.level === "light" && api2.text === "She smiled, although she was tired.", JSON.stringify(api2));

    /* dusk */
    await setTheme(page, "dusk");
    await page.click('#simpLevels [data-l="kid"]');
    await page.waitForFunction(() => { const c = document.querySelector('#simpLevels [data-l="kid"]'); return c && c.getAttribute("aria-pressed") === "true"; }, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await shot(page, "explain2-desktop-dusk-kid");
    await page.click('#dictCard [role=tab][data-tab="explain"]');
    await page.waitForFunction(() => document.querySelector("#dictExpl .style"), null, { timeout: 20000 });
    await page.hover("#dictExpl .figrow");
    await page.waitForTimeout(400);
    await shot(page, "explain2-desktop-dusk-style");
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);

    /* the choice survives a reload */
    await page.reload({ waitUntil: "load" });
    await openFixture(page, "sample.md");
    await openOn(page, SENTENCE, "simpler");
    await simplerReady(page);
    L = await levelInfo(page);
    R.check("the chosen strength survives a reload", L.on === "For a 10-year-old" && L.stored === "kid" && /^For a 10-year-old · /.test(L.summary) && /\(= /.test(L.simple), L.on + " / " + L.summary);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    R.check("no page errors (desktop)", !(page._errors || []).length, (page._errors || []).join(" | "));
  } catch (err){ R.check("desktop (exception)", false, String(err).split("\n")[0]); }
  await ctx.close();

  /* ---- phone ---- */
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await newPage(phone, url);
  await openFixture(page, "sample.md");
  try {
    await openOn(page, SENTENCE, "simpler");
    await simplerReady(page);
    await page.waitForTimeout(400);
    let fits = await page.evaluate(() => {
      const c = document.getElementById("dictCard");
      return c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    R.check("phone: the strengths do not push the card wide", fits);
    const L = await levelInfo(page);
    R.check("phone: all four strengths are there", L.chips.length === 4 && L.on === "Plain", JSON.stringify(L.chips.map((c) => c.label)));
    R.check("phone: each chip is a 40px touch target", await page.evaluate(() =>
      Array.from(document.querySelectorAll("#simpLevels .chip")).every((c) => c.getBoundingClientRect().height >= 40)));
    await shot(page, "explain2-phone-day-levels");
    await page.click('#simpLevels [data-l="kid"]');
    await page.waitForFunction(() => document.getElementById("simpSum") && /^For a 10-year-old · /.test(document.getElementById("simpSum").textContent), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await shot(page, "explain2-phone-day-kid");

    await page.click('#dictCard [role=tab][data-tab="explain"]');
    await page.waitForFunction(() => document.querySelector("#dictExpl .style"), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    fits = await page.evaluate(() => {
      const c = document.getElementById("dictCard");
      return c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    R.check("phone: the Style rows do not push the card wide", fits);
    await page.click("#dictExpl .figrow");
    await page.waitForTimeout(250);
    const marked = await page.evaluate(() => (document.querySelector("#dictQuote mark.fig") || {}).textContent || null);
    R.check("phone: tapping a device row marks the quote", /spilled coins/.test(marked || ""), String(marked));
    await shot(page, "explain2-phone-day-style");
    await setTheme(page, "dusk");
    await page.waitForTimeout(500);
    await shot(page, "explain2-phone-dusk-style");
    await page.click('#dictCard [role=tab][data-m="simplify"]');
    await simplerReady(page);
    await page.waitForTimeout(400);
    await shot(page, "explain2-phone-dusk-levels");
    R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
  } catch (err){ R.check("phone (exception)", false, String(err).split("\n")[0]); }
  await phone.close();

  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
