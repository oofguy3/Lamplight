/* Simplify in the browser: the pill offers it for a selection of three words or more, the Simpler
   card shows the plainer text with each change dotted and explained, Copy and Read aloud work,
   the explain card hands over to it, a plain sentence says so. Screenshots at two widths in Day
   and Dusk go to $LL_SHOTS (default: the OS temp dir).
     NODE_PATH=$(npm root -g) node tests/simplify.js */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-simplify");

/* a fake speech engine: headless Chromium has no voices; every utterance is logged */
const SPEECH_STUB = `(() => {
  const voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true }, { name: "Daniel", lang: "en-GB", localService: true, default: false }];
  window.__spoken = [];
  const synth = { getVoices(){ return voices; }, speak(u){ window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate }); setTimeout(() => u.onend && u.onend({}), 30); },
    cancel(){}, pause(){}, resume(){}, addEventListener(){}, removeEventListener(){}, speaking: false, pending: false, paused: false };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: function(t){ this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ""; }, configurable: true, writable: true });
})();`;

const SENTENCE = "Nobody could have predicted the extraordinary consequences of that small, deliberate decision.";

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
  /* a mouse-down inside an old selection would drag its text instead of selecting anew */
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForTimeout(250);
  const b = await phraseRect(page, phrase);
  if (!b) throw new Error("phrase not in the text: " + phrase);
  await page.mouse.move(b.x1, b.y1); await page.mouse.down(); await page.mouse.move(b.x2, b.y2, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(350);
}
const pillState = (page) => page.evaluate(() => {
  const p = document.getElementById("dictPill");
  return { on: p.classList.contains("on"), buttons: Array.from(p.querySelectorAll("button")).filter((b) => b.style.display !== "none").map((b) => b.textContent) };
});
const cardOpen = (page) => page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open") && document.querySelector("#dictCard .simple"), null, { timeout: 30000 });
const cardInfo = (page) => page.evaluate(() => ({
  title: (document.querySelector("#dictCard .term") || {}).textContent,
  quote: (document.querySelector("#dictCard .quote") || {}).textContent,
  simple: (document.querySelector("#dictCard .simple") || {}).textContent,
  changes: Array.from(document.querySelectorAll("#dictCard .chg")).map((c) => ({ text: c.textContent, title: c.getAttribute("title"), expanded: c.getAttribute("aria-expanded") })),
  summary: (document.getElementById("simpSum") || {}).textContent,
  acts: Array.from(document.querySelectorAll("#simpActs button")).map((b) => b.textContent),
  offline: !!Array.from(document.querySelectorAll("#dictCard .note")).find((n) => /Offline/.test(n.textContent))
}));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
  const setTheme = (page, key) => page.evaluate((k) => document.querySelector('#themeChips [data-theme="' + k + '"]').click(), key);

  /* ---- desktop ---- */
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(SPEECH_STUB);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url.replace(/\/$/, "") }).catch(() => null);
  let page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  try {
    /* 1. the pill: Simplify between Explain and Highlight for a sentence, hidden for one word */
    await selectPhrase(page, SENTENCE);
    let pill = await pillState(page);
    R.check("selecting a sentence shows the pill", pill.on, JSON.stringify(pill));
    R.check("pill reads Explain · Simplify · Highlight · Translate", pill.buttons.join(" · ") === "Explain · Simplify · Highlight · Translate", pill.buttons.join(" · "));
    R.check("the Simplify button carries data-act=simplify", await page.$eval("#dictPill [data-act=simplify]", (b) => b.textContent === "Simplify"));

    /* 2. the Simpler card */
    await page.click("#dictPill [data-act=simplify]");
    await cardOpen(page);
    let info = await cardInfo(page);
    R.check("card title is Simpler", info.title === "Simpler", info.title);
    R.check("the original is quoted above", info.quote === SENTENCE, info.quote);
    R.check("the simplified text differs from the original", info.simple && info.simple !== SENTENCE, info.simple);
    R.check("at least one change, with a title starting 'was:'", info.changes.length >= 1 && info.changes.every((c) => /^was: /.test(c.title)), JSON.stringify(info.changes));
    R.check("extraordinary became a plainer word", info.changes.some((c) => c.title === "was: extraordinary") && !/extraordinary/.test(info.simple), info.simple);
    R.check("summary line counts the changes", /\d+ words? swapped/.test(info.summary), info.summary);
    R.check("actions: Copy, Read aloud, Highlight, Simplify with AI", info.acts.join("|") === "Copy|Read aloud|Highlight|Simplify with AI", info.acts.join("|"));
    R.check("no offline note while online", !info.offline);
    R.check("card is a labelled dialog with real buttons", await page.evaluate(() => document.getElementById("dictCard").getAttribute("role") === "dialog" && Array.from(document.querySelectorAll("#dictCard .chg, #simpActs .act")).every((b) => b.tagName === "BUTTON")));
    const simpleText = info.simple;
    await page.waitForTimeout(300);
    await shot(page, "simplify-desktop-day");

    /* 3. a tap on a change shows what it was and why */
    await page.click("#dictCard .chg");
    let note = await page.evaluate(() => { const c = document.querySelector("#dictCard .chg"); const n = c.nextSibling; return { expanded: c.getAttribute("aria-expanded"), note: n && n.classList && n.classList.contains("chgnote") ? n.textContent : null }; });
    R.check("tapping a change opens its note", note.expanded === "true" && /^was “extraordinary” — rarer word$/.test(note.note || ""), JSON.stringify(note));
    await shot(page, "simplify-desktop-day-note");
    await page.click("#dictCard .chg");
    note = await page.evaluate(() => { const c = document.querySelector("#dictCard .chg"); const n = c.nextSibling; return { expanded: c.getAttribute("aria-expanded"), note: n && n.classList && n.classList.contains("chgnote") }; });
    R.check("tapping again closes it", note.expanded === "false" && !note.note, JSON.stringify(note));

    /* 4. Copy and Read aloud */
    await page.click('#simpActs [data-s="copy"]');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
    const toast = await page.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
    R.check("Copy puts the simplified text on the clipboard and toasts Copied", clip === simpleText && toast === "Copied", JSON.stringify({ clip: clip.slice(0, 60), toast }));
    await page.evaluate(() => { localStorage.setItem("ll_tts_voice", "Daniel"); localStorage.setItem("ll_tts_rate", "1.3"); });
    await page.click('#simpActs [data-s="read"]');
    await page.waitForTimeout(200);
    const spoken = await page.evaluate(() => window.__spoken.slice());
    R.check("Read aloud speaks the simplified text once, in the narrator's voice at the saved rate", spoken.length === 1 && spoken[0].text === simpleText && spoken[0].voice === "Daniel" && Math.abs(spoken[0].rate - 1.3) < 0.01, JSON.stringify(spoken));
    R.check("the button went back to Read aloud when the utterance ended", await page.$eval("#simpRead", (b) => b.textContent === "Read aloud"));

    /* 5. Escape closes */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    R.check("Escape closes the card", await page.evaluate(() => !document.getElementById("dictCard").classList.contains("open")));

    /* 6. the explain card offers Simplify first and hands over */
    const pt = await phraseRect(page, "Nobody could have");
    await page.mouse.click(pt.x1, pt.y1, { button: "right" });
    await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open") && document.getElementById("dictMarkActs"), null, { timeout: 20000 });
    const acts = await page.$$eval("#dictMarkActs button", (bs) => bs.map((b) => b.dataset.m));
    R.check("explain card actions start with Simplify", acts[0] === "simplify" && acts.indexOf("hl") > 0, acts.join(","));
    await page.click('#dictMarkActs [data-m="simplify"]');
    await cardOpen(page);
    info = await cardInfo(page);
    R.check("…and it switches to the Simpler card for that sentence", info.title === "Simpler" && info.quote === SENTENCE && info.simple === simpleText, JSON.stringify({ title: info.title, quote: info.quote }));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    /* 7. Highlight from the card */
    await selectPhrase(page, SENTENCE);
    await page.click("#dictPill [data-act=simplify]");
    await cardOpen(page);
    await page.click('#simpActs [data-s="hl"]');
    await page.waitForTimeout(300);
    R.check("Highlight marks the selection and closes the card", (await page.evaluate(() => document.querySelectorAll("#doc mark.ll-mark").length)) >= 1 && !(await page.evaluate(() => document.getElementById("dictCard").classList.contains("open"))));
    await page.evaluate(() => window.getSelection().removeAllRanges());

    /* 8. a plain sentence, and the promise API */
    await page.evaluate(() => window.llSimplify.render("The cat sat on the mat."));
    await cardOpen(page);
    info = await cardInfo(page);
    R.check("a plain sentence says it is already plain", info.summary === "Nothing to simplify — this is already plain." && info.changes.length === 0 && info.simple === "The cat sat on the mat.", JSON.stringify(info));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    const api = await page.evaluate(() => window.llSimplify.simplify("They commenced walking towards the village, and the window was broken by the storm.").then((r) => ({ text: r.text, whys: r.changes.map((c) => c.why) })));
    R.check("llSimplify.simplify(text) resolves with the plainer text", api.text === "They began walking towards the village, and the storm broke the window." && api.whys.indexOf("rarer word") >= 0 && api.whys.indexOf("passive to active") >= 0, JSON.stringify(api));

    /* 9. one word: no Simplify in the pill */
    await selectPhrase(page, "extraordinary");
    pill = await pillState(page);
    R.check("a one-word selection offers Define, Highlight and Translate (no Simplify)", pill.on && pill.buttons.join(" · ") === "Define · Highlight · Translate", JSON.stringify(pill));
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await page.waitForTimeout(250);

    /* 10. dusk, and offline */
    await setTheme(page, "dusk");
    await selectPhrase(page, SENTENCE);
    await page.click("#dictPill [data-act=simplify]");
    await cardOpen(page);
    await page.waitForTimeout(400);
    await shot(page, "simplify-desktop-dusk");
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await ctx.setOffline(true);
    await page.evaluate(() => window.llSimplify.render("Nobody could have predicted the extraordinary consequences of that small, deliberate decision."));
    await cardOpen(page);
    info = await cardInfo(page);
    R.check("offline: still simplified, with a note and no AI button", /unusual/.test(info.simple) && info.offline && info.acts.indexOf("Simplify with AI") < 0, JSON.stringify({ acts: info.acts, offline: info.offline }));
    await ctx.setOffline(false);
    await page.keyboard.press("Escape");
    R.check("no page errors (desktop)", !(page._errors || []).length, (page._errors || []).join(" | "));
  } catch (err){ R.check("desktop (exception)", false, String(err).split("\n")[0]); }
  await ctx.close();

  /* ---- phone ---- */
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addInitScript(SPEECH_STUB);
  page = await newPage(phone, url);
  await openFixture(page, "sample.md");
  try {
    await page.evaluate((s) => window.llSimplify.render(s, null), SENTENCE);
    await cardOpen(page);
    await page.waitForTimeout(400);
    const fits = await page.evaluate(() => { const c = document.getElementById("dictCard"); return c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; });
    R.check("phone: the card has no horizontal overflow", fits);
    const info = await cardInfo(page);
    R.check("phone: without a text span there is no Highlight action", info.acts.indexOf("Highlight") < 0 && info.acts[0] === "Copy", info.acts.join("|"));
    await shot(page, "simplify-phone-day");
    await setTheme(page, "dusk");
    await page.waitForTimeout(400);
    await page.click("#dictCard .chg");
    await page.waitForTimeout(150);
    await shot(page, "simplify-phone-dusk");
    R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
  } catch (err){ R.check("phone (exception)", false, String(err).split("\n")[0]); }
  await phone.close();

  console.log("screenshots in " + SHOTS);
  await b.close(); server.close();
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
