/* Read aloud: voices by gender, a second voice for quoted speech, and expression read off the
   text. Headless Chromium has no voices, so the speech API is stubbed before the app loads and
   every utterance is logged. Screenshots go to $LL_SHOTS (default: the OS temp dir). */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-speak");

const STUB = `(function(){
  var voices = [
    { name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "Samantha" },
    { name: "Daniel", lang: "en-GB", localService: true, default: false, voiceURI: "Daniel" },
    { name: "Google US English", lang: "en-US", localService: false, default: false, voiceURI: "Google US English" },
    { name: "espeak", lang: "en", localService: true, default: false, voiceURI: "espeak" }
  ];
  var log = window.__speakLog = [];
  var synth = {
    getVoices: function(){ return voices.slice(); },
    speak: function(u){
      log.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate, volume: u.volume });
      setTimeout(function(){ if (u.onstart) u.onstart({}); }, 1);
      setTimeout(function(){ if (u.onend) u.onend({}); }, 5);
    },
    cancel: function(){}, pause: function(){}, resume: function(){},
    addEventListener: function(){}, removeEventListener: function(){},
    speaking: false, pending: false, paused: false
  };
  function Utterance(t){
    this.text = t; this.voice = null; this.lang = ""; this.pitch = 1; this.rate = 1; this.volume = 1; this.onend = null; this.onerror = null; this.onstart = null;
  }
  /* window.speechSynthesis is a getter with no setter in Chromium: a plain assignment is ignored */
  Object.defineProperty(window, "speechSynthesis", { configurable: true, writable: true, value: synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: Utterance });
})();`;

const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.002);
const noQuotes = (s) => !/[“”"‘«»]/.test(s);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  async function context(w, h){ const ctx = await b.newContext({ viewport: { width: w, height: h } }); await ctx.addInitScript(STUB); return ctx; }
  async function shot(page, name){ const p = path.join(SHOTS, name + ".png"); await page.screenshot({ path: p }); return p; }
  /* the offset of a phrase in the document's text nodes (what Speak.start takes) */
  const offsetOf = (page, phrase) => page.evaluate((ph) => document.getElementById("doc").textContent.indexOf(ph), phrase);
  async function readFrom(page, phrase, count){
    const off = await offsetOf(page, phrase);
    await page.evaluate((o) => { window.__speakLog.length = 0; window.__ll.Speak.start(o + 1); }, off);
    await page.waitForFunction((n) => window.__speakLog.length >= n, count, { timeout: 20000 }).catch(() => null);
    return page.evaluate(() => window.__speakLog.slice());
  }
  async function setTheme(page, key){
    await page.keyboard.press("s"); await page.waitForTimeout(150);
    await page.click('#themeChips .chip[data-theme="' + key + '"]'); await page.waitForTimeout(150);
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  }
  async function openVoices(page){
    await page.click("#ttsVoices");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && document.getElementById("ttsExpr"), null, { timeout: 5000 });
    await page.waitForTimeout(350);
  }

  const ctx = await context(1200, 800);
  try {
    /* ---- 1. voiceGender ---- */
    let page = await newPage(ctx, url);
    const names = ["Samantha", "Daniel", "Microsoft Zira", "Google UK English Male", "espeak", "Google US English",
      "Microsoft David Desktop - English (United States)", "Karen (Enhanced)", "Bad News", "English (Great Britain)+m3", "Ting-Ting", "Google UK English Female"];
    const want = ["f", "m", "f", "m", "", "f", "m", "f", "", "m", "f", "f"];
    const got = await page.evaluate((ns) => ns.map((n) => window.llSpeak.voiceGender(n)), names);
    R.check("voiceGender classifies voice names", JSON.stringify(got) === JSON.stringify(want), names.map((n, i) => n + "=" + JSON.stringify(got[i])).join(", "));
    const objGender = await page.evaluate(() => window.llSpeak.voiceGender({ name: "Daniel", lang: "en-GB" }));
    R.check("voiceGender takes a voice object", objGender === "m", objGender);

    /* ---- 5. the planner: exact offsets, quotes trimmed, apostrophes left alone ---- */
    const plan = await page.evaluate(() => {
      const src = "It’s late, and the dog’s bowl is empty. “Are you coming?” she asked. ‘I’m not,’ he said. He said “x” and left.\n\n“Wait. I’m coming!” he shouted. «Allons-y», dit-il. (He never did.)";
      return { src, units: window.llSpeak.plan(src) };
    });
    const U = plan.units;
    R.check("plan: every unit's text is source.slice(start, end)", U.length > 5 && U.every((u) => plan.src.slice(u.start, u.end) === u.text), U.map((u) => JSON.stringify(u.text) + (plan.src.slice(u.start, u.end) === u.text ? "" : "!=" + JSON.stringify(plan.src.slice(u.start, u.end)))).join(" | "));
    const dlg = U.filter((u) => u.dialogue).map((u) => u.text);
    R.check("plan: quoted speech becomes dialogue units without the quote marks",
      JSON.stringify(dlg) === JSON.stringify(["Are you coming?", "I’m not,", "Wait.", "I’m coming!", "Allons-y"]) && dlg.every(noQuotes), JSON.stringify(dlg));
    const narr = U.filter((u) => !u.dialogue).map((u) => u.text);
    R.check("plan: apostrophes and a one-letter quote stay narration",
      narr[0] === "It’s late, and the dog’s bowl is empty." && narr.indexOf("He said “x” and left.") >= 0 && narr.indexOf("he shouted.") >= 0, JSON.stringify(narr));
    R.check("plan: a quote spanning sentences stays dialogue until it closes", U.filter((u) => u.dialogue && /^(Wait\.|I’m coming!)$/.test(u.text)).length === 2);
    R.check("plan: paragraph ends and parentheticals are flagged",
      U.filter((u) => u.last).length === 2 && U[U.length - 1].last === true && U[U.length - 1].paren === true && U[0].paren === false,
      "last: " + U.filter((u) => u.last).map((u) => u.text).join(" / "));

    /* ---- express: the pure rules ---- */
    const ex = await page.evaluate(() => {
      const S = window.llSpeak, shout = S.plan("“Wait!” he shouted."), whisper = S.plan("“Come here,” she whispered."), q = S.plan("He asked, “Are you coming?”");
      return {
        natural: S.express(shout[0], { next: shout[1], expr: "natural" }),
        dramatic: S.express(shout[0], { next: shout[1], expr: "dramatic" }),
        off: S.express(shout[0], { next: shout[1], expr: "off" }),
        plain: S.express({ text: "The lamp hums quietly as she turns the page." }, { expr: "natural" }),
        question: S.express(q[1], { prev: q[0], expr: "natural" }),
        whisper: S.express(whisper[0], { next: whisper[1], expr: "natural" }),
        heading: S.express({ text: "The Lamp", heading: true, last: true }, { expr: "natural" }),
        para: S.express({ text: "Done.", last: true }, { expr: "natural" }),
        dots: S.express({ text: "Well…" }, { expr: "natural" }),
        paren: S.express({ text: "(He never did.)", paren: true }, { expr: "natural" }),
        caps: S.express({ text: "It was HUGE." }, { expr: "natural" }),
        dash: S.express({ text: "But I—" }, { expr: "natural" })
      };
    });
    R.check("express: plain sentence is neutral with a 260 ms breath", ex.plain.pitch === 1 && ex.plain.rate === 1 && ex.plain.volume === 1 && ex.plain.pauseAfter === 260, JSON.stringify(ex.plain));
    R.check("express: a question lifts the pitch", near(ex.question.pitch, 1.08) && ex.question.rate === 1, JSON.stringify(ex.question));
    R.check("express: “Wait!” + shouted (natural)", near(ex.natural.pitch, 1.22) && near(ex.natural.rate, 1.188) && ex.natural.volume === 1 && ex.natural.pauseAfter === 260, JSON.stringify(ex.natural));
    R.check("express: dramatic is 1.8× the offsets, capped", near(ex.dramatic.pitch, 1.3) && near(ex.dramatic.rate, 1.338), JSON.stringify(ex.dramatic));
    R.check("express: off keeps only the pauses", ex.off.pitch === 1 && ex.off.rate === 1 && ex.off.volume === 1 && ex.off.pauseAfter === 260, JSON.stringify(ex.off));
    R.check("express: whispered speech is quiet and slower", near(ex.whisper.volume, 0.55) && near(ex.whisper.rate, 0.9), JSON.stringify(ex.whisper));
    R.check("express: headings are slower, lower, 700 ms after", near(ex.heading.rate, 0.9) && near(ex.heading.pitch, 0.95) && ex.heading.pauseAfter === 700, JSON.stringify(ex.heading));
    R.check("express: paragraph end adds 350 ms; ellipsis 500 ms and slower", ex.para.pauseAfter === 610 && ex.dots.pauseAfter === 500 && near(ex.dots.rate, 0.92), JSON.stringify([ex.para, ex.dots]));
    R.check("express: parenthetical, capitals, a cut-off dash", near(ex.paren.pitch, 0.94) && near(ex.paren.volume, 0.9) && near(ex.paren.rate, 1.05) && near(ex.caps.rate, 0.95) && ex.dash.pauseAfter === 0, JSON.stringify([ex.paren, ex.caps, ex.dash]));
    R.check("pure pieces: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();

    /* ---- 2. the bar: grouped voices, ♀ ♂, the dialogue voice ---- */
    page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await page.keyboard.press("r");
    await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
    await page.waitForTimeout(200);
    const groups = await page.$$eval("#ttsVoice optgroup", (gs) => gs.map((g) => g.label + ":" + Array.from(g.querySelectorAll("option")).map((o) => o.textContent).join("|")));
    R.check("voice select is grouped Women / Men / Other, local before online",
      JSON.stringify(groups) === JSON.stringify(["Women:Samantha|Google US English (online)", "Men:Daniel", "Other:espeak"]), JSON.stringify(groups));
    const sexBtns = await page.evaluate(() => [document.getElementById("ttsWoman").hidden, document.getElementById("ttsMan").hidden, document.getElementById("ttsWoman").getAttribute("aria-pressed")]);
    R.check("♀ and ♂ are shown when such voices exist; ♀ pressed for Samantha", sexBtns[0] === false && sexBtns[1] === false && sexBtns[2] === "true", JSON.stringify(sexBtns));
    const auto1 = await page.evaluate(() => ({ narr: document.getElementById("ttsVoice").value, dlg: window.llSpeak.dialogueVoice().voice.name }));
    R.check("dialogue voice defaults to the other gender (Samantha → Daniel)", auto1.narr === "Samantha" && auto1.dlg === "Daniel", JSON.stringify(auto1));
    await page.click("#ttsMan"); await page.waitForTimeout(100);
    const auto2 = await page.evaluate(() => ({ narr: document.getElementById("ttsVoice").value, dlg: window.llSpeak.dialogueVoice().voice.name, pressed: document.getElementById("ttsMan").getAttribute("aria-pressed"), stored: localStorage.getItem("ll_tts_voice") }));
    R.check("♂ picks Daniel and the dialogue voice flips to Samantha", auto2.narr === "Daniel" && auto2.dlg === "Samantha" && auto2.pressed === "true" && auto2.stored === "Daniel", JSON.stringify(auto2));
    await page.click("#ttsWoman"); await page.waitForTimeout(100);
    R.check("♀ picks Samantha again", await page.$eval("#ttsVoice", (s) => s.value) === "Samantha");
    const barBox = await page.$eval("#tts", (el) => ({ h: el.getBoundingClientRect().height, minCtl: Math.min.apply(null, Array.from(el.querySelectorAll("button:not([hidden]), select")).map((c) => c.getBoundingClientRect().height)) }));
    R.check("bar stays one row on desktop, controls ≥ 36 px", barBox.h < 70 && barBox.minCtl >= 36, JSON.stringify(barBox));
    await shot(page, "bar-1200-day");

    /* ---- 3. reading: narrator vs dialogue voice, expression from the text ---- */
    await page.evaluate(() => { window.__speakLog.length = 0; window.__ll.Speak.start(0); });
    await page.waitForFunction(() => window.__speakLog.length >= 9, null, { timeout: 20000 }).catch(() => null);
    const log = await page.evaluate(() => window.__speakLog.slice());
    const texts = log.map((e) => e.text);
    R.check("reads the heading, then the first paragraph sentence by sentence",
      texts[0] === "The Lamp" && texts[2] === "Chapter 1" && texts[3] === "The lamp hums quietly as she turns the page." && texts[4] === "One more chapter," && texts[5] === "she tells herself," && texts[6] === "just one more.", JSON.stringify(texts.slice(0, 8)));
    R.check("narration is spoken by the narrator, quoted speech by the dialogue voice, without quote marks",
      log[3] && log[3].voice === "Samantha" && log[4] && log[4].voice === "Daniel" && log[5].voice === "Samantha" && log[6].voice === "Daniel" && texts.every(noQuotes), JSON.stringify(log.slice(3, 7)));
    R.check("heading is slower and lower; plain sentence neutral", log[0] && near(log[0].rate, 0.9) && near(log[0].pitch, 0.95) && log[3] && log[3].pitch === 1 && log[3].rate === 1, JSON.stringify([log[0], log[3]]));
    const q = await readFrom(page, "He asked, “Are you coming?”", 2);
    R.check("the unit ending in ? has a higher pitch than the plain one", q[0] && q[0].text === "He asked," && q[0].pitch === 1 && q[1] && q[1].text === "Are you coming?" && q[1].pitch > 1.05 && q[1].voice === "Daniel", JSON.stringify(q.slice(0, 2)));
    const off = await offsetOf(page, "“Wait!” he shouted");
    await page.evaluate((o) => { window.__speakLog.length = 0; window.__ll.Speak.start(o + 1); }, off);
    const painted = await page.evaluate(() => CSS.highlights && CSS.highlights.has("ll-speak-dialogue"));
    R.check("a dialogue unit is painted with the ll-speak-dialogue highlight", painted === true, String(painted));
    await page.waitForFunction(() => window.__speakLog.length >= 2, null, { timeout: 20000 }).catch(() => null);
    const w = await page.evaluate(() => window.__speakLog.slice());
    R.check("“Wait!” + shouted: higher rate, full volume, pitch above the question", w[0] && w[0].text === "Wait!" && w[0].voice === "Daniel" && w[0].rate > 1.1 && w[0].volume === 1 && w[0].pitch > q[1].pitch && w[1] && w[1].text === "he shouted." && w[1].voice === "Samantha", JSON.stringify(w.slice(0, 2)));
    await shot(page, "reading-1200-day");

    /* ---- the Voices panel ---- */
    await openVoices(page);
    const panel = await page.evaluate(() => ({
      narr: document.getElementById("ttsNarr").value, dlg: document.getElementById("ttsDlg").value,
      dlgOpts: Array.from(document.getElementById("ttsDlg").options).slice(0, 2).map((o) => o.textContent),
      groups: Array.from(document.querySelectorAll("#ttsDlg optgroup")).map((g) => g.label),
      hint: document.getElementById("ttsDlgHint").textContent, checked: document.querySelector("#ttsExpr [aria-checked=true]").dataset.expr,
      pitch: document.getElementById("ttsPitch").value, sample: !!document.getElementById("ttsSample"), title: document.getElementById("sideTitle").textContent
    }));
    R.check("Voices panel: narrator, dialogue (Auto / Same / grouped), expression, pitch, sample",
      panel.title === "Read-aloud voices" && panel.narr === "Samantha" && panel.dlg === "" && panel.dlgOpts[0].indexOf("Auto") === 0 && panel.dlgOpts[1] === "Same as narrator" &&
      JSON.stringify(panel.groups) === JSON.stringify(["Women", "Men", "Other"]) && /Daniel/.test(panel.hint) && panel.checked === "natural" && panel.pitch === "1" && panel.sample, JSON.stringify(panel));
    await shot(page, "panel-1200-day");
    /* hear a sample: both voices, no quote marks */
    await page.evaluate(() => { window.__speakLog.length = 0; });
    await page.click("#ttsSample");
    await page.waitForFunction(() => window.__speakLog.length >= 4, null, { timeout: 10000 }).catch(() => null);
    const smp = await page.evaluate(() => window.__speakLog.slice());
    R.check("hear a sample speaks the line in both voices", smp.length === 4 && smp[0].voice === "Samantha" && smp[1].text === "Are you still reading?" && smp[1].voice === "Daniel" && smp[3].text === "Just one more chapter!" && smp[3].voice === "Daniel", JSON.stringify(smp));
    /* dialogue: same as narrator; pitch slider */
    await page.selectOption("#ttsDlg", "same"); await page.waitForTimeout(50);
    const same = await page.evaluate(() => ({ dlg: window.llSpeak.dialogueVoice().voice.name, stored: localStorage.getItem("ll_tts_dialogue") }));
    R.check("dialogue “Same as narrator” is honoured and persisted", same.dlg === "Samantha" && same.stored === "same", JSON.stringify(same));
    await page.selectOption("#ttsDlg", "Daniel"); await page.waitForTimeout(50);
    R.check("a chosen dialogue voice is honoured", await page.evaluate(() => window.llSpeak.dialogueVoice().voice.name) === "Daniel");
    await page.selectOption("#ttsDlg", ""); await page.waitForTimeout(50);

    /* ---- 4. expression Off: pitch 1, rate = speed, voices still switch ---- */
    await page.click('#ttsExpr .chip[data-expr="off"]'); await page.waitForTimeout(50);
    const offState = await page.evaluate(() => ({ checked: document.querySelector("#ttsExpr [aria-checked=true]").dataset.expr, stored: localStorage.getItem("ll_tts_expr") }));
    R.check("expression Off is selected and persisted", offState.checked === "off" && offState.stored === "off", JSON.stringify(offState));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.$eval("#ttsRate", (el) => { el.value = "1.5"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    const o = await readFrom(page, "“Wait!” he shouted", 3);
    R.check("Off: every unit has pitch 1 and rate = speed, but the voices still switch",
      o.length >= 3 && o.every((e) => e.pitch === 1 && near(e.rate, 1.5) && e.volume === 1) && o[0].voice === "Daniel" && o[1].voice === "Samantha", JSON.stringify(o.slice(0, 3)));
    await page.$eval("#ttsRate", (el) => { el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    /* dramatic, then back to natural, through the panel */
    await openVoices(page);
    await page.click('#ttsExpr .chip[data-expr="dramatic"]'); await page.waitForTimeout(50);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const d = await readFrom(page, "“Wait!” he shouted", 1);
    R.check("Dramatic pushes the offsets harder", d[0] && near(d[0].pitch, 1.3) && near(d[0].rate, 1.338), JSON.stringify(d[0]));
    await openVoices(page);
    await page.click('#ttsExpr .chip[data-expr="natural"]'); await page.waitForTimeout(50);
    /* the pitch slider moves the narrator */
    await page.$eval("#ttsPitch", (el) => { el.value = "1.2"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const p = await readFrom(page, "He asked, “Are you coming?”", 1);
    const storedPitch = await page.evaluate(() => localStorage.getItem("ll_tts_pitch"));
    R.check("the pitch slider shifts the narrator's pitch and is persisted", p[0] && near(p[0].pitch, 1.2) && storedPitch === "1.2", JSON.stringify(p[0]) + " stored=" + storedPitch);
    await page.evaluate(() => window.__ll.Speak.stop());
    R.check("bar and panel: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));

    /* ---- persistence across a reload ---- */
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const kept = await page.evaluate(() => window.llSpeak.settings());
    R.check("voice, dialogue, expression and pitch survive a reload", kept.voice === "Samantha" && kept.dialogue === "" && kept.expr === "natural" && kept.pitch === 1.2, JSON.stringify(kept));

    /* ---- 6. dark theme screenshots ---- */
    await openFixture(page, "sample.md");
    await setTheme(page, "dusk");
    await page.keyboard.press("r");
    await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
    await readFrom(page, "He asked, “Are you coming?”", 2);
    await page.evaluate(() => window.__ll.Speak.pause());
    await shot(page, "bar-1200-dusk");
    await openVoices(page);
    await shot(page, "panel-1200-dusk");
    await page.keyboard.press("Escape");
    await setTheme(page, "day");
    await page.close();
  } catch (err){ R.check("desktop (exception)", false, String(err).split("\n")[0]); }
  await ctx.close();

  /* ---- phone width: two rows, panel as a bottom sheet ---- */
  const phone = await context(390, 844);
  try {
    const page = await newPage(phone, url);
    await openFixture(page, "sample.md");
    await page.keyboard.press("r");
    await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
    await page.waitForTimeout(200);
    const rows = await page.evaluate(() => {
      const bar = document.getElementById("tts"), r = bar.getBoundingClientRect();
      const tops = Array.from(bar.querySelectorAll("button:not([hidden]), label, select")).map((c) => Math.round(c.getBoundingClientRect().top));
      const els = Array.from(bar.querySelectorAll("button:not([hidden]), label, select"));
      const row1 = els.filter((c) => Math.round(c.getBoundingClientRect().top) === Math.min.apply(null, tops)).map((c) => c.id || c.tagName);
      const minH = Math.min.apply(null, els.map((c) => c.getBoundingClientRect().height));
      return { distinctTops: Array.from(new Set(tops)).length, row1, minH, width: r.width, overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    R.check("phone: the bar wraps to two rows, buttons first, controls ≥ 36 px, no horizontal scroll",
      rows.distinctTops === 2 && rows.row1.indexOf("ttsPlay") >= 0 && rows.row1.indexOf("ttsVoices") >= 0 && rows.row1.indexOf("ttsStop") >= 0 && rows.row1.indexOf("SELECT") < 0 && rows.minH >= 36 && !rows.overflow, JSON.stringify(rows));
    await readFrom(page, "He asked, “Are you coming?”", 2);
    await page.evaluate(() => window.__ll.Speak.pause());
    await shot(page, "bar-390-day");
    await openVoices(page);
    await shot(page, "panel-390-day");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await setTheme(page, "dusk");
    await shot(page, "bar-390-dusk");
    await openVoices(page);
    await shot(page, "panel-390-dusk");
    await page.keyboard.press("Escape");
    R.check("phone: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("phone (exception)", false, String(err).split("\n")[0]); }
  await phone.close();

  /* ---- PDFs: units come from the page text, and quoted speech still gets the other voice ---- */
  const pdfCtx = await context(1200, 800);
  try {
    const page = await newPage(pdfCtx, url);
    await openFixture(page, "sample.pdf");
    await page.keyboard.press("r");
    await page.waitForFunction(() => window.__speakLog.length >= 6, null, { timeout: 30000 }).catch(() => null);
    const log = await page.evaluate(() => window.__speakLog.slice());
    const spoken = log.filter((e) => e.voice === "Samantha").length, quoted = log.filter((e) => e.voice === "Daniel");
    R.check("PDF: read aloud runs from the page text, narration and quoted speech in their own voices",
      spoken >= 3 && quoted.length >= 1 && quoted.every((e) => noQuotes(e.text)) && log.some((e) => /lamp hums quietly/.test(e.text)), JSON.stringify(log.slice(0, 6)));
    await page.evaluate(() => window.__ll.Speak.stop());
    R.check("PDF: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("pdf (exception)", false, String(err).split("\n")[0]); }
  await pdfCtx.close();

  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})();
