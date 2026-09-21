/* Read aloud: who a voice is (its name, its voiceURI, an Apple bundle id, an Android
   #female_1), how good it is likely to sound, the compact picker (the pair, the cards, the full
   list behind a fold), per-language memory, previews, the speed ramp, the language of the
   document, a second voice for quoted speech, expression read off the text, lock-screen (Media
   Session) controls, the sleep timer, and the review fixes (PDF start/stop races, settings
   changes in the breath between sentences, exact offsets across whitespace runs, the panel and
   bar layouts, a linear planner). Headless Chromium has no voices, so the speech API is stubbed
   before the app loads with a realistic mixed list — Apple names, Microsoft "Online (Natural)"
   names, two Android voices whose only clue is the URI, an espeak voice and two Spanish ones —
   and every utterance is logged; the Media Session and <audio> are stubbed the same way.
   Screenshots go to $LL_SHOTS (default: the OS temp dir). */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-speak");

const STUB = `(function(){
  var voices = [
    { name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "com.apple.voice.compact.en-US.Samantha" },
    { name: "Daniel", lang: "en-GB", localService: true, default: false, voiceURI: "com.apple.voice.compact.en-GB.Daniel" },
    { name: "Google US English", lang: "en-US", localService: false, default: false, voiceURI: "Google US English" },
    { name: "espeak", lang: "en", localService: true, default: false, voiceURI: "espeak" },
    { name: "Microsoft David Desktop - English (United States)", lang: "en-US", localService: true, default: false, voiceURI: "David" },
    { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false, default: false, voiceURI: "Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)" },
    { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US", localService: false, default: false, voiceURI: "Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)" },
    { name: "English United States", lang: "en-US", localService: true, default: false, voiceURI: "en-us-x-sfg#female_1-local" },
    { name: "English United States", lang: "en-US", localService: true, default: false, voiceURI: "en-us-x-iom#male_2-local" },
    { name: "Karen (Enhanced)", lang: "en-AU", localService: true, default: false, voiceURI: "com.apple.voice.enhanced.en-AU.Karen" },
    { name: "Bad News", lang: "en-US", localService: true, default: false, voiceURI: "com.apple.speech.synthesis.voice.BadNews" },
    { name: "Mónica", lang: "es-ES", localService: true, default: false, voiceURI: "com.apple.voice.compact.es-ES.Monica" },
    { name: "Microsoft Alvaro Online (Natural) - Spanish (Spain)", lang: "es-ES", localService: false, default: false, voiceURI: "Microsoft Server Speech Text to Speech Voice (es-ES, AlvaroNeural)" }
  ];
  var log = window.__speakLog = [];
  /* each utterance ends after __speakDelay ms (5 by default; the sleep-timer checks make it 30 s) */
  var synth = {
    getVoices: function(){ return voices.slice(); },
    speak: function(u){
      log.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang, pitch: u.pitch, rate: u.rate, volume: u.volume });
      setTimeout(function(){ if (u.onstart) u.onstart({}); }, 1);
      setTimeout(function(){ if (u.onend) u.onend({}); }, window.__speakDelay || 5);
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
  /* Media Session: record the handlers and every metadata set; <audio>.play() resolves without playing */
  var media = window.__media = { handlers: {}, meta: [], play: 0, pause: 0 }, meta = null;
  var ms = { playbackState: "none", setActionHandler: function(a, h){ media.handlers[a] = h; } };
  Object.defineProperty(ms, "metadata", { get: function(){ return meta; }, set: function(v){ meta = v; media.meta.push(v); } });
  Object.defineProperty(navigator, "mediaSession", { configurable: true, value: ms });
  var realPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function(){ media.play++; return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function(){ media.pause++; return realPause.apply(this, arguments); };
})();`;

const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.002);
const noQuotes = (s) => !/[“”"‘«»]/.test(s);
const collapse = (s) => s.replace(/\s+/g, " ");
/* Play eases in: the first three sentences run at 85 %, 92 % and 100 % of the chosen speed, so
   a check on an absolute rate divides the ramp back out of the log first */
const RAMP = [0.85, 0.92, 1];
const unramp = (log) => log.map((e, i) => Object.assign({}, e, { rate: e.rate / (RAMP[i] || 1) }));
/* the stubbed voices, by the name the engine reports */
const V = {
  samantha: "Samantha", daniel: "Daniel", google: "Google US English", espeak: "espeak",
  david: "Microsoft David Desktop - English (United States)",
  aria: "Microsoft Aria Online (Natural) - English (United States)",
  guy: "Microsoft Guy Online (Natural) - English (United States)",
  android: "English United States", karen: "Karen (Enhanced)", news: "Bad News",
  monica: "Mónica", alvaro: "Microsoft Alvaro Online (Natural) - Spanish (Spain)"
};

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
    await page.click("#ttsVoiceBtn");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && document.getElementById("ttsExpr"), null, { timeout: 5000 });
    await page.waitForTimeout(350);
  }
  async function startBar(page){
    await page.keyboard.press("r");
    await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
    await page.waitForTimeout(200);
  }
  /* the bar's controls in DOM order and in visual order (rows by vertical centre, then left to right) */
  /* the bar's controls in DOM order and in visual order (rows by vertical centre, then left to
     right). The mirror select is out of the flow, so only the buttons and the speed row count */
  const layout = (page) => page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("#tts button:not([hidden]), #tts label"));
    const boxes = els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.tagName, cy: r.top + r.height / 2, x: r.left, h: r.height }; });
    const rows = [];
    boxes.slice().sort((a, b) => a.cy - b.cy).forEach((b) => { const r = rows[rows.length - 1]; if (r && Math.abs(r[0].cy - b.cy) < 12) r.push(b); else rows.push([b]); });
    const visual = []; rows.forEach((r) => r.sort((a, b) => a.x - b.x).forEach((b) => visual.push(b.id)));
    const rateV = document.getElementById("ttsRateV").getBoundingClientRect(), vb = document.getElementById("ttsVoiceBtn").getBoundingClientRect();
    return { dom: boxes.map((b) => b.id), visual, rows: rows.map((r) => r.map((b) => b.id)), minH: Math.min.apply(null, boxes.map((b) => b.h)),
      overflow: document.documentElement.scrollWidth > window.innerWidth, gap: Math.round(vb.left - rateV.right), slider: Math.round(document.getElementById("ttsRate").getBoundingClientRect().width),
      barH: document.getElementById("tts").getBoundingClientRect().height };
  });
  /* what the picker is showing right now */
  const panelState = (page) => page.evaluate(() => ({
    pair: Array.from(document.querySelectorAll("#ttsPair .v-row")).map((r) => ({
      role: r.querySelector(".v-role").textContent, name: r.querySelector(".v-name").textContent,
      tags: Array.from(r.querySelectorAll(".v-tag")).map((t) => t.textContent), play: !!r.querySelector(".v-play")
    })),
    cards: Array.from(document.querySelectorAll(".v-card")).map((c) => ({
      name: c.querySelector(".v-name").textContent, sex: c.querySelector(".v-sex").textContent,
      tags: Array.from(c.querySelectorAll(".v-tag")).map((t) => t.textContent),
      on: Array.from(c.querySelectorAll(".v-assign")).filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent)
    })),
    all: document.querySelector("#ttsAll summary").textContent,
    allOpen: document.getElementById("ttsAll").open,
    listed: Array.from(document.querySelectorAll("#ttsList .v-item:not([hidden]) .v-name")).map((n) => n.textContent),
    listShown: document.getElementById("ttsList").checkVisibility(),
    groups: Array.from(document.querySelectorAll("#ttsList .v-group:not([hidden]) > .label")).map((g) => g.textContent),
    subs: Array.from(document.querySelectorAll("#ttsList .v-sub:not([hidden]) .v-sub-l")).map((g) => g.textContent),
    hiddenRow: (document.querySelector(".v-hidden .label") || {}).textContent || "",
    note: !document.getElementById("ttsNoGender").hidden,
    hint: document.getElementById("ttsDlgHint").textContent,
    bar: document.getElementById("ttsVoiceName").textContent
  }));
  const sleepChip = (page) => page.evaluate(() => {
    const c = document.getElementById("ttsSleep"), w = document.getElementById("ttsSleepW"), v = document.getElementById("ttsSleepV"), shown = getComputedStyle(w).display !== "none";
    return { hidden: c.hidden, text: (shown ? w.textContent + " " : "") + v.textContent, label: c.getAttribute("aria-label"), title: c.title, live: c.getAttribute("aria-live"),
      prefixShown: shown, pressed: Array.from(document.querySelectorAll("#ttsSleepChips .chip")).filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.sleep) };
  });

  const ctx = await context(1200, 800);
  try {
    /* ---- 1. who is speaking: the name, then the voiceURI ---- */
    let page = await newPage(ctx, url);
    const names = ["Samantha", "Daniel", "Microsoft Zira", "Google UK English Male", "espeak", "Google US English",
      "Microsoft David Desktop - English (United States)", "Karen (Enhanced)", "Bad News", "English (Great Britain)+m3", "Ting-Ting", "Google UK English Female"];
    const want = ["f", "m", "f", "m", "", "f", "m", "f", "", "m", "f", "f"];
    const got = await page.evaluate((ns) => ns.map((n) => window.llSpeak.voiceGender(n)), names);
    R.check("voiceGender classifies voice names", JSON.stringify(got) === JSON.stringify(want), names.map((n, i) => n + "=" + JSON.stringify(got[i])).join(", "));
    const objGender = await page.evaluate(() => window.llSpeak.voiceGender({ name: "Daniel", lang: "en-GB" }));
    R.check("voiceGender takes a voice object", objGender === "m", objGender);
    /* the Microsoft natural (neural) set, where the first name is buried in a long label */
    const msNames = ["Microsoft Aria Online (Natural) - English (United States)", "Microsoft Guy Online (Natural) - English (United States)",
      "Microsoft Sonia Online (Natural) - English (United Kingdom)", "Microsoft Ryan Online (Natural) - English (United Kingdom)",
      "Microsoft Michelle Online (Natural) - English (United States)", "Microsoft Davis Online (Natural) - English (United States)",
      "Microsoft Alvaro Online (Natural) - Spanish (Spain)", "Microsoft Elvira Online (Natural) - Spanish (Spain)",
      "Microsoft AriaNeural", "Microsoft AndrewNeural", "Microsoft Kimberly", "Microsoft Brandon"];
    const msWant = ["f", "m", "f", "m", "f", "m", "m", "f", "f", "m", "f", "m"];
    const msGot = await page.evaluate((ns) => ns.map((n) => window.llSpeak.voiceGender(n)), msNames);
    R.check("voiceGender knows the Microsoft natural names (Aria, Sonia, Michelle, Kimberly; Guy, Ryan, Davis, Andrew)",
      JSON.stringify(msGot) === JSON.stringify(msWant), msNames.map((n, i) => n.replace(/^Microsoft /, "") + "=" + JSON.stringify(msGot[i])).join(", "));
    /* Android names four voices the same and tells you nothing but the URI */
    const uris = [
      [{ name: "English United States", lang: "en-US", voiceURI: "en-us-x-sfg#female_1-local" }, "f"],
      [{ name: "English United States", lang: "en-US", voiceURI: "en-us-x-iom#male_2-local" }, "m"],
      [{ name: "English United Kingdom", lang: "en-GB", voiceURI: "en-gb-x-gba#female_2-local" }, "f"],
      [{ name: "Deutsch", lang: "de-DE", voiceURI: "de-de-x-nfh#male_1-local" }, "m"],
      [{ name: "Voice", lang: "en-US", voiceURI: "com.apple.voice.compact.en-US.Samantha" }, "f"],
      [{ name: "Voice", lang: "en-GB", voiceURI: "com.apple.voice.compact.en-GB.Daniel" }, "m"],
      [{ name: "", lang: "en-GB", voiceURI: "urn:moz-tts:sapi:Microsoft Hazel Desktop?en-GB" }, "f"],
      [{ name: "Chrome OS US English", lang: "en-US", voiceURI: "en-us_m_1" }, "m"],
      [{ name: "espeak-ng", lang: "en", voiceURI: "espeak-ng" }, ""]
    ];
    const uriGot = await page.evaluate((vs) => vs.map((v) => window.llSpeak.voiceGender(v)), uris.map((u) => u[0]));
    R.check("voiceGender falls back to the voiceURI: Android #female_1 / #male_2, Apple bundle ids, an _m_ token",
      JSON.stringify(uriGot) === JSON.stringify(uris.map((u) => u[1])), uris.map((u, i) => u[0].voiceURI + "=" + JSON.stringify(uriGot[i])).join(", "));
    /* the name a reader recognises */
    const shorts = [
      [{ name: V.aria, voiceURI: "…AriaNeural" }, "Aria"],
      [{ name: V.karen, voiceURI: "com.apple.voice.enhanced.en-AU.Karen" }, "Karen"],
      [{ name: V.david, voiceURI: "David" }, "David"],
      [{ name: V.android, voiceURI: "en-us-x-sfg#female_1-local" }, "Woman 1"],
      [{ name: V.android, voiceURI: "en-us-x-iom#male_2-local" }, "Man 2"],
      [{ name: V.google, voiceURI: V.google }, "US English"],
      [{ name: V.samantha, voiceURI: "com.apple.voice.compact.en-US.Samantha" }, "Samantha"]
    ];
    const shortGot = await page.evaluate((vs) => vs.map((v) => window.llSpeak.shortName(v)), shorts.map((x) => x[0]));
    R.check("shortName: Aria out of a Windows label, Woman 1 / Man 2 out of an Android URI, Karen without (Enhanced)",
      JSON.stringify(shortGot) === JSON.stringify(shorts.map((x) => x[1])), JSON.stringify(shortGot));
    /* the quality score: natural and offline win, compact and novelty lose */
    const sc = await page.evaluate(() => {
      const S = window.llSpeak, mk = (name, lang, local, uri) => ({ name: name, lang: lang, localService: local, voiceURI: uri || name });
      return {
        naturalLocal: S.voiceScore(mk("Microsoft Ava Online (Natural) - English (United States)", "en-US", true), "en"),
        naturalOnline: S.voiceScore(mk("Microsoft Aria Online (Natural) - English (United States)", "en-US", false), "en"),
        plainLocal: S.voiceScore(mk("Microsoft David Desktop - English (United States)", "en-US", true, "David"), "en"),
        compact: S.voiceScore(mk("Samantha", "en-US", true, "com.apple.voice.compact.en-US.Samantha"), "en"),
        espeak: S.voiceScore(mk("espeak", "en", true), "en"),
        novelty: S.voiceScore(mk("Bad News", "en-US", true, "com.apple.speech.synthesis.voice.BadNews"), "en"),
        otherLang: S.voiceScore(mk("Mónica", "es-ES", true), "en")
      };
    });
    R.check("voiceScore: natural + offline + the right language beats compact, espeak, novelty and another language",
      sc.naturalLocal === 10 && sc.naturalOnline === 7 && sc.plainLocal === 6 && sc.compact === 4 && sc.espeak === 3 && sc.novelty === 3 && sc.otherLang === 3 &&
      sc.naturalLocal > sc.naturalOnline && sc.naturalOnline > sc.plainLocal && sc.plainLocal > sc.compact && sc.compact > sc.novelty, JSON.stringify(sc));
    const order = await page.evaluate(() => window.llSpeak.sortedVoices().slice(0, 6).map((v) => window.llSpeak.shortName(v)));
    R.check("sortedVoices puts the best first: an enhanced offline voice, then the two natural ones, then the plain local ones",
      JSON.stringify(order) === JSON.stringify(["Karen", "Aria", "Guy", "Woman 1", "Man 2", "David"]), JSON.stringify(order));
    const tags = await page.evaluate(() => {
      const S = window.llSpeak, vs = S.sortedVoices();
      const by = {}; vs.forEach((v) => { by[S.shortName(v)] = S.voiceTags(v); });
      return by;
    });
    R.check("voiceTags say what a voice is good at, whether it works offline, and its locale",
      JSON.stringify(tags.Karen) === JSON.stringify(["natural", "offline", "en-AU"]) && JSON.stringify(tags.Aria) === JSON.stringify(["natural", "online", "en-US"]) &&
      JSON.stringify(tags["Woman 1"]) === JSON.stringify(["offline", "en-US"]), JSON.stringify(tags));

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
    /* whitespace runs inside a sentence (pretty-printed HTML, CRLF text): offsets stay raw, the spoken text is collapsed */
    const ws = await page.evaluate(() => {
      const src = "He looked up and asked,\n      “Are you still reading that book, or are you just\n      holding it?” She\r\ndid not answer.\n\n" +
        "The road ran on past the church and the gutters and the quiet fields,\n   ".repeat(4) + "and came at last to the house.";
      return { src, units: window.llSpeak.plan(src) };
    });
    const W = ws.units, wsDlg = W.filter((u) => u.dialogue)[0], wsShe = W.filter((u) => /^She did not/.test(u.text))[0], pieces = W.filter((u) => /^(The road|and the|the quiet|fields|and came)/.test(u.text));
    R.check("plan: a unit spanning an indented line break keeps raw offsets and collapsed spoken text",
      W.every((u) => collapse(ws.src.slice(u.start, u.end)) === u.text) && wsDlg && wsDlg.text === "Are you still reading that book, or are you just holding it?" && /\n {6}holding/.test(ws.src.slice(wsDlg.start, wsDlg.end)) &&
      wsShe && ws.src.slice(wsShe.start, wsShe.end) === "She\r\ndid not answer.", W.map((u) => JSON.stringify(u.text) + " <- " + JSON.stringify(ws.src.slice(u.start, u.end))).join(" | "));
    R.check("plan: a long sentence's later pieces start on a word with exact starts", pieces.length >= 2 && pieces.every((u) => /\S/.test(ws.src.charAt(u.start)) && /\S/.test(ws.src.charAt(u.end - 1)) && u.text.length <= 220) && W.filter((u) => u.last).length === 2,
      pieces.map((u) => JSON.stringify(u.text.slice(0, 24))).join(" | "));
    const crlf = await page.evaluate(() => window.llSpeak.plan("Chapter 1\r\n\r\nThe lamp hums.\r\n\r\nShe read on."));
    R.check("plan: CRLF blank lines split paragraphs", crlf.length === 3 && crlf.every((u) => u.last && !/\r/.test(u.text)) && crlf[1].text === "The lamp hums.", JSON.stringify(crlf.map((u) => u.text)));
    /* one block of 12000 sentences with quotes and parentheses: linear, not quadratic, in the spans */
    const perf = await page.evaluate(() => {
      const S = window.llSpeak, sent = ["The lamp hums quietly as she turns the page.", "“Are you still reading that book?” she asked.", "He said nothing (as usual) and went on."];
      const parts = []; for (let i = 0; i < 12000; i++) parts.push(sent[i % 3]);
      const one = parts.join("\n"), many = parts.join("\n\n");
      function time(txt){ let best = Infinity; for (let k = 0; k < 3; k++){ const t0 = performance.now(); S.plan(txt); best = Math.min(best, performance.now() - t0); } return best; }
      const manyMs = time(many), oneMs = time(one);
      return { manyMs: Math.round(manyMs), oneMs: Math.round(oneMs), units: S.plan(one).length, dlg: S.plan(one).filter((u) => u.dialogue).length };
    });
    R.check("plan: a single-block text plans in linear time (one block within 4× of blank-line paragraphs, under 800 ms)",
      perf.oneMs <= Math.max(4 * perf.manyMs, 150) && perf.oneMs < 800 && perf.units >= 16000 && perf.dlg === 4000, JSON.stringify(perf));

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
    const wav = await page.evaluate(() => { const d = window.llSpeak.silentWav(), bin = atob(d.split(",")[1]); return { head: d.slice(0, 22), riff: bin.slice(0, 4) + bin.slice(8, 16), len: bin.length, rate: bin.charCodeAt(24) | (bin.charCodeAt(25) << 8), bits: bin.charCodeAt(34), quiet: !/[^\u0000]/.test(bin.slice(44)) }; });
    R.check("silent loop: a well-formed 8 kHz 16-bit mono WAV of zeros, half a second long", wav.head === "data:audio/wav;base64," && wav.riff === "RIFFWAVEfmt " && wav.len === 8044 && wav.rate === 8000 && wav.bits === 16 && wav.quiet, JSON.stringify(wav));
    R.check("pure pieces: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();

    /* ---- 2. the bar: one button naming the narrator, and the mirror select behind it ---- */
    page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await startBar(page);
    const btn = await page.evaluate(() => {
      const b = document.getElementById("ttsVoiceBtn"), sel = document.getElementById("ttsVoice");
      return { name: document.getElementById("ttsVoiceName").textContent, label: b.getAttribute("aria-label"), title: b.title,
        pop: b.getAttribute("aria-haspopup"), chevron: !!b.querySelector("svg"),
        selValue: sel.value, selTab: sel.tabIndex, selHidden: sel.getAttribute("aria-hidden"),
        selBox: Math.round(sel.getBoundingClientRect().width), gone: !document.getElementById("ttsWoman") && !document.getElementById("ttsMan") && !document.getElementById("ttsVoices") };
    });
    R.check("the bar names the narrator, with a chevron into the picker; the ♀ ♂ and Voices… buttons are gone",
      btn.name === "Karen" && btn.label === "Voice: Karen — choose another" && btn.title === "Karen — choose another voice" && btn.pop === "dialog" && btn.chevron && btn.gone, JSON.stringify(btn));
    R.check("#ttsVoice stays as a hidden mirror of the choice: out of the tab order, out of the flow",
      btn.selValue === "com.apple.voice.enhanced.en-AU.Karen" && btn.selTab === -1 && btn.selHidden === "true" && btn.selBox <= 1, JSON.stringify(btn));
    const groups = await page.$$eval("#ttsVoice optgroup", (gs) => gs.map((g) => g.label + ":" + Array.from(g.querySelectorAll("option")).map((o) => o.textContent).join("|")));
    R.check("the mirror lists every voice, grouped Women / Men / Other, best first",
      groups.length === 3 && groups[0].indexOf("Women:Karen (Enhanced)|" + V.aria) === 0 && groups[1].indexOf("Men:" + V.guy) === 0 &&
      groups[2] === "Other:Bad News|espeak", JSON.stringify(groups));
    const auto1 = await page.evaluate(() => ({ narr: window.llSpeak.currentVoice().name, dlg: window.llSpeak.dialogueVoice().voice.name }));
    R.check("with nothing chosen the pair is the best woman and the best man for this language",
      auto1.narr === V.karen && auto1.dlg === V.guy, JSON.stringify(auto1));
    /* the button opens the picker */
    await page.click("#ttsVoiceBtn");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && document.getElementById("ttsPair"), null, { timeout: 5000 });
    R.check("the voice button opens the Voices panel", await page.$eval("#sideTitle", (t) => t.textContent) === "Read-aloud voices");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const desk = await layout(page);
    R.check("bar stays one row on desktop, controls ≥ 36 px, DOM order is the visual order", desk.barH < 70 && desk.minH >= 36 && desk.rows.length === 1 && JSON.stringify(desk.dom) === JSON.stringify(desk.visual) && desk.gap > 0, JSON.stringify(desk));
    R.check("the bar reads ‹ ▶ › · Speed · [voice] · ×",
      JSON.stringify(desk.visual) === JSON.stringify(["ttsPrev", "ttsPlay", "ttsNext", "LABEL", "ttsVoiceBtn", "ttsStop"]), JSON.stringify(desk.visual));
    await shot(page, "bar-1200-day");

    /* a change in the breath after a sentence is picked up by the next one, not by replaying the last */
    await page.evaluate(() => { window.__speakLog.length = 0; window.__ll.Speak.start(0); });
    await page.waitForFunction(() => window.__speakLog.length >= 1, null, { timeout: 5000 });
    await page.waitForTimeout(60);
    await page.$eval("#ttsRate", (el) => { el.value = "1.2"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(900);
    const breath = await page.evaluate(() => window.__speakLog.slice());
    R.check("a speed change during the breath is honoured by the next sentence and doesn't replay the finished one",
      breath.length === 2 && breath[0].text === "The Lamp" && breath[1].text === "A short sample book for Lamplight." && near(unramp(breath)[1].rate, 1.2), JSON.stringify(breath.map((e) => e.text + " @" + e.rate)));
    await page.$eval("#ttsRate", (el) => { el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); });

    /* ---- 3. reading: narrator vs dialogue voice, expression from the text ---- */
    await page.evaluate(() => { window.__speakLog.length = 0; window.__media.meta.length = 0; window.__ll.Speak.start(0); });
    await page.waitForFunction(() => window.__speakLog.length >= 9, null, { timeout: 20000 }).catch(() => null);
    const log = await page.evaluate(() => window.__speakLog.slice());
    const texts = log.map((e) => e.text);
    R.check("reads the heading, then the first paragraph sentence by sentence",
      texts[0] === "The Lamp" && texts[2] === "Chapter 1" && texts[3] === "The lamp hums quietly as she turns the page." && texts[4] === "One more chapter," && texts[5] === "she tells herself," && texts[6] === "just one more.", JSON.stringify(texts.slice(0, 8)));
    R.check("narration is spoken by the narrator, quoted speech by the dialogue voice, without quote marks",
      log[3] && log[3].voice === V.karen && log[4] && log[4].voice === V.guy && log[5].voice === V.karen && log[6].voice === V.guy && texts.every(noQuotes), JSON.stringify(log.slice(3, 7).map((e) => e.voice)));
    R.check("each utterance carries its voice's own language", log[3].lang === "en-AU" && log[4].lang === "en-US", JSON.stringify([log[3].lang, log[4].lang]));
    const flat = unramp(log);
    R.check("heading is slower and lower; plain sentence neutral", flat[0] && near(flat[0].rate, 0.9) && near(flat[0].pitch, 0.95) && flat[3] && flat[3].pitch === 1 && flat[3].rate === 1, JSON.stringify([flat[0], flat[3]]));
    R.check("Play eases in: the first three sentences run at 85 %, 92 % and 100 % of the speed",
      near(log[0].rate / 0.9, 0.85) && near(log[1].rate, 0.92) && near(log[2].rate / 0.9, 1) && near(log[3].rate, 1),
      JSON.stringify(log.slice(0, 4).map((e) => e.text + " @" + e.rate)));

    /* ---- lock-screen controls: metadata, the silent loop, the handlers ---- */
    const ms1 = await page.evaluate(() => {
      const m = navigator.mediaSession.metadata, a = document.getElementById("ttsSilence");
      return { title: m && m.title, artist: m && m.artist, album: m && m.album, art: m && m.artwork.map((x) => x.sizes + " " + x.src.replace(/^.*\//, "")), handlers: Object.keys(window.__media.handlers).sort(),
        audio: !!a, loop: a && a.loop, volume: a && a.volume, src: a && a.src.slice(0, 22), plays: window.__media.play, state: navigator.mediaSession.playbackState, albums: window.__media.meta.map((x) => x && x.album) };
    });
    R.check("reading sets Media Session metadata: file name, Lamplight, the current chapter, both icons",
      ms1.title === "sample.md" && ms1.artist === "Lamplight" && ms1.album === "Chapter 1" && JSON.stringify(ms1.art) === JSON.stringify(["192x192 icon-192.png", "512x512 icon-512.png"]) && JSON.stringify(ms1.albums) === JSON.stringify(["The Lamp", "Chapter 1"]), JSON.stringify(ms1));
    R.check("play, pause, stop, previous/next track and seek handlers are registered; playbackState is playing",
      ["play", "pause", "stop", "previoustrack", "nexttrack", "seekbackward", "seekforward"].every((h) => ms1.handlers.indexOf(h) >= 0) && ms1.state === "playing", JSON.stringify(ms1.handlers) + " " + ms1.state);
    R.check("a hidden silent <audio loop> at a whisper of volume was started with the reading", ms1.audio && ms1.loop === true && near(ms1.volume, 0.01) && ms1.src === "data:audio/wav;base64," && ms1.plays >= 1, JSON.stringify(ms1));
    await page.evaluate(() => window.__ll.Speak.pause());
    const ms2 = await page.evaluate(() => ({ state: navigator.mediaSession.playbackState, pauses: window.__media.pause, playing: window.__ll.Speak.isPlaying() }));
    R.check("pausing sets playbackState paused and pauses the loop", ms2.state === "paused" && ms2.pauses >= 1 && !ms2.playing, JSON.stringify(ms2));
    const before = await page.evaluate(() => { window.__speakLog.length = 0; window.__media.handlers.play(); return { i: window.__ll.Speak.index(), playing: window.__ll.Speak.isPlaying(), state: navigator.mediaSession.playbackState }; });
    await page.waitForFunction(() => window.__speakLog.length >= 1, null, { timeout: 5000 }).catch(() => null);
    const after = await page.evaluate(() => { window.__media.handlers.nexttrack(); return { i: window.__ll.Speak.index(), text: window.__ll.Speak.units()[window.__ll.Speak.index()].text }; });
    await page.waitForFunction(() => window.__speakLog.length >= 2, null, { timeout: 5000 }).catch(() => null);
    const stepped = await page.evaluate(() => window.__speakLog.slice());
    R.check("the play handler resumes and nexttrack moves to the next sentence", before.playing && before.state === "playing" && after.i === before.i + 1 && stepped.length >= 2 && stepped[1].text === after.text, JSON.stringify({ before, after, stepped: stepped.map((e) => e.text) }));
    const back = await page.evaluate(() => { window.__media.handlers.seekbackward(); return window.__ll.Speak.index(); });
    R.check("seekbackward steps three sentences back", back === Math.max(0, after.i - 3), back + " from " + after.i);
    await page.evaluate(() => window.__ll.Speak.stop());
    const ms3 = await page.evaluate(() => ({ state: navigator.mediaSession.playbackState, meta: navigator.mediaSession.metadata, on: document.getElementById("tts").classList.contains("on") }));
    R.check("stop clears playbackState to none and the metadata", ms3.state === "none" && ms3.meta === null && !ms3.on, JSON.stringify(ms3));

    const q = await readFrom(page, "He asked, “Are you coming?”", 2);
    R.check("the unit ending in ? has a higher pitch than the plain one", q[0] && q[0].text === "He asked," && q[0].pitch === 1 && q[1] && q[1].text === "Are you coming?" && q[1].pitch > 1.05 && q[1].voice === V.guy, JSON.stringify(q.slice(0, 2)));
    const off = await offsetOf(page, "“Wait!” he shouted");
    await page.evaluate((o) => { window.__speakLog.length = 0; window.__ll.Speak.start(o + 1); }, off);
    const painted = await page.evaluate(() => CSS.highlights && CSS.highlights.has("ll-speak-dialogue"));
    R.check("a dialogue unit is painted with the ll-speak-dialogue highlight", painted === true, String(painted));
    await page.waitForFunction(() => window.__speakLog.length >= 2, null, { timeout: 20000 }).catch(() => null);
    const w = unramp(await page.evaluate(() => window.__speakLog.slice()));
    R.check("“Wait!” + shouted: higher rate, full volume, pitch above the question", w[0] && w[0].text === "Wait!" && w[0].voice === V.guy && w[0].rate > 1.1 && w[0].volume === 1 && w[0].pitch > q[1].pitch && w[1] && w[1].text === "he shouted." && w[1].voice === V.karen, JSON.stringify(w.slice(0, 2)));
    await shot(page, "reading-1200-day");

    /* ---- the Voices panel: a pair, six cards, the rest behind a fold ---- */
    await openVoices(page);
    const P = await panelState(page);
    R.check("the panel opens on the pair that is reading: a role, a name, its tags and a preview each",
      P.pair.length === 2 && P.pair[0].role === "Narrator" && P.pair[0].name === "Karen" && P.pair[1].role === "Dialogue" && P.pair[1].name === "Guy" &&
      JSON.stringify(P.pair[0].tags) === JSON.stringify(["natural", "offline", "en-AU"]) && P.pair.every((r) => r.play), JSON.stringify(P.pair));
    R.check("the pair says in one line who reads the quoted speech", /Guy reads the quoted speech/.test(P.hint), P.hint);
    R.check("six cards, the best women and men for this text alternating, the two in use pressed",
      JSON.stringify(P.cards.map((c) => c.name)) === JSON.stringify(["Karen", "Guy", "Aria", "Man 2", "Woman 1", "David"]) &&
      JSON.stringify(P.cards.map((c) => c.sex)) === JSON.stringify(["♀", "♂", "♀", "♂", "♀", "♂"]) &&
      JSON.stringify(P.cards[0].on) === JSON.stringify(["Narrator"]) && JSON.stringify(P.cards[1].on) === JSON.stringify(["Dialogue"]) &&
      JSON.stringify(P.cards[2].on) === JSON.stringify([]), JSON.stringify(P.cards));
    R.check("the full list is folded away, counted, and the device's gender note stays hidden",
      P.all === "All voices (13)" && !P.allOpen && !P.listShown && P.listed.length === 13 && !P.note, JSON.stringify([P.all, P.allOpen, P.listShown, P.note]));
    const panel = await page.evaluate(() => ({
      checked: document.querySelector("#ttsExpr [aria-checked=true]").dataset.expr,
      pitch: document.getElementById("ttsPitch").value, sample: !!document.getElementById("ttsSample"), title: document.getElementById("sideTitle").textContent,
      sections: Array.from(document.querySelectorAll(".tts-panel > .group > .label span")).map((l) => l.textContent),
      icons: Array.from(document.querySelectorAll(".tts-panel > .group > .label svg")).length,
      sleep: Array.from(document.querySelectorAll("#ttsSleepChips .chip")).map((c) => c.textContent + (c.getAttribute("aria-pressed") === "true" ? "*" : "")),
      sleepLabel: document.querySelector('#ttsSleepChips .chip[data-sleep="15"]').getAttribute("aria-label")
    }));
    R.check("the panel's sections: the pair, the cards, expression and pitch, the sleep timer — each with its icon",
      panel.title === "Read-aloud voices" && JSON.stringify(panel.sections) === JSON.stringify(["Reading to you", "Good for this text", "Expression", "Sleep timer"]) &&
      panel.icons === 4 && panel.checked === "natural" && panel.pitch === "1" && panel.sample, JSON.stringify(panel));
    R.check("Voices panel: a Stop after row of chips, Off pressed", JSON.stringify(panel.sleep) === JSON.stringify(["Off*", "15", "30", "45", "60 min", "End of chapter"]) && panel.sleepLabel === "15 minutes", JSON.stringify(panel.sleep));
    const fit = await page.evaluate(() => {
      const body = document.querySelector("#side .side-body"), side = document.getElementById("side").getBoundingClientRect();
      const wide = Array.from(document.querySelectorAll(".tts-panel .v-name, .tts-panel .chip")).map((e) => Math.round(e.getBoundingClientRect().right));
      return { sw: body.scrollWidth, cw: body.clientWidth, past: wide.filter((r) => r > side.right).length, pitchV: document.getElementById("ttsPitchV").textContent };
    });
    R.check("nothing in the panel is pushed past the drawer, however long the Windows names are",
      fit.sw === fit.cw && fit.past === 0 && fit.pitchV === "1.00", JSON.stringify(fit));
    await shot(page, "panel-1200-day");
    /* ▶ on a card: one line, one voice, in that voice's language */
    await page.evaluate(() => { window.__speakLog.length = 0; });
    await page.click('.v-card:nth-child(3) .v-play');
    await page.waitForFunction(() => window.__speakLog.length >= 2, null, { timeout: 10000 }).catch(() => null);
    const prev = await page.evaluate(() => window.__speakLog.slice());
    R.check("a card's ▶ previews that voice alone, with the sample line and its own language",
      prev.length >= 2 && prev.every((e) => e.voice === V.aria && e.lang === "en-US") && prev[0].text === "The lamp hums quietly." && prev[1].text === "Are you still reading?", JSON.stringify(prev));
    /* a second preview stops the first */
    const stopped = await page.evaluate(async () => {
      window.__speakDelay = 400; window.__speakLog.length = 0;
      document.querySelector('.v-card:nth-child(1) .v-play').click();
      await new Promise((r) => setTimeout(r, 50));
      document.querySelector('.v-card:nth-child(2) .v-play').click();
      await new Promise((r) => setTimeout(r, 1400));
      window.__speakDelay = 5;
      return window.__speakLog.map((e) => e.voice);
    });
    R.check("starting another preview stops the one before it", stopped.filter((v) => v === V.karen).length === 1 && stopped.filter((v) => v === V.guy).length >= 2, JSON.stringify(stopped));
    /* assigning from a card */
    await page.click('.v-card:nth-child(3) .v-assign[data-role="narr"]'); await page.waitForTimeout(80);
    const picked = await panelState(page);
    const storedPick = await page.evaluate(() => [localStorage.getItem("ll_tts_voice_en"), localStorage.getItem("ll_tts_voice")]);
    R.check("Narrator on a card moves the pair, the bar and the stored choice for this language",
      picked.pair[0].name === "Aria" && picked.pair[1].name === "Guy" && picked.bar === "Aria" &&
      JSON.stringify(picked.cards[2].on) === JSON.stringify(["Narrator"]) && storedPick[0] === storedPick[1] && /AriaNeural/.test(storedPick[0]), JSON.stringify([picked.pair.map((r) => r.name), picked.bar, storedPick]));
    /* Swap exchanges the two */
    await page.click("#ttsSwap"); await page.waitForTimeout(80);
    const swapped = await panelState(page);
    R.check("Swap the two exchanges narrator and dialogue", swapped.pair[0].name === "Guy" && swapped.pair[1].name === "Aria" && swapped.bar === "Guy", JSON.stringify(swapped.pair.map((r) => r.name)));
    /* the gender chip corrects the device and is remembered */
    await page.click('.v-card:nth-child(3) .v-sex'); await page.waitForTimeout(80);
    const fixed = await panelState(page);
    const storedSex = await page.evaluate(() => JSON.parse(localStorage.getItem("ll_voice_gender") || "{}"));
    R.check("the ♀ ♂ — chip cycles, is stored per voice, and the classifier obeys it",
      fixed.cards[2].sex === "♂" && Object.keys(storedSex).length === 1 && storedSex[Object.keys(storedSex)[0]] === "m" &&
      (await page.evaluate(() => window.llSpeak.voiceGender(window.llSpeak.sortedVoices()[1]))) === "m", JSON.stringify([fixed.cards[2], storedSex]));
    await page.click('.v-card:nth-child(3) .v-sex'); await page.waitForTimeout(60);
    const unmarked = await panelState(page);
    R.check("a third tap marks a voice as neither, and the cards follow", unmarked.cards[2].sex === "—", JSON.stringify(unmarked.cards.map((c) => c.name + c.sex)));
    await page.click('.v-card:nth-child(3) .v-sex'); await page.waitForTimeout(60);
    /* restore the pair Lamplight would have chosen */
    await page.evaluate(() => { window.llSpeak.setVoice(""); window.llSpeak.setDialogue(""); });
    await page.waitForTimeout(80);
    const reset = await panelState(page);
    R.check("Choose for me hands the pair back to Lamplight", reset.pair[0].name === "Karen" && reset.pair[1].name === "Guy" && reset.bar === "Karen", JSON.stringify(reset.pair.map((r) => r.name)));
    /* the full list: open it, filter it, hide a voice */
    await page.click("#ttsAll summary"); await page.waitForTimeout(150);
    const all = await panelState(page);
    R.check("All voices opens a list grouped by language, then women, men and the rest",
      all.allOpen && all.listed.length === 13 && JSON.stringify(all.groups) === JSON.stringify(["English", "Spanish"]) &&
      JSON.stringify(all.subs) === JSON.stringify(["Women", "Men", "Other", "Women", "Men"]), JSON.stringify([all.groups, all.subs, all.listed]));
    await page.fill("#ttsFilter", "spanish"); await page.waitForTimeout(120);
    const filtered = await panelState(page);
    R.check("the filter narrows the list by name or language", JSON.stringify(filtered.listed) === JSON.stringify(["Mónica", "Alvaro"]) && JSON.stringify(filtered.groups) === JSON.stringify(["Spanish"]), JSON.stringify(filtered.listed));
    await page.fill("#ttsFilter", "zzz"); await page.waitForTimeout(120);
    R.check("a filter that matches nothing says so", await page.$eval("#ttsFilterNone", (e) => !e.hidden));
    await page.fill("#ttsFilter", ""); await page.waitForTimeout(120);
    await shot(page, "all-1200-day");
    await page.locator("#ttsList .v-item .v-hide").first().click(); await page.waitForTimeout(200);
    const hid = await panelState(page);
    const storedHide = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("ll_voice_hidden") || "{}")));
    R.check("hiding a voice takes it out of the cards, the list and the count, and offers it back",
      hid.cards.map((c) => c.name).indexOf("Karen") < 0 && hid.listed.indexOf("Karen") < 0 && hid.all === "All voices (12)" &&
      hid.hiddenRow === "Hidden (1)" && storedHide.length === 1, JSON.stringify([hid.all, hid.cards.map((c) => c.name), hid.hiddenRow, storedHide]));
    R.check("with the best woman hidden the pair falls to the next one", hid.pair[0].name === "Aria" && hid.bar === "Aria", JSON.stringify(hid.pair.map((r) => r.name)));
    await page.click('.v-hidden .chip'); await page.waitForTimeout(200);
    const shown = await panelState(page);
    R.check("show again puts it back", shown.all === "All voices (13)" && shown.pair[0].name === "Karen" && shown.hiddenRow === "", JSON.stringify([shown.all, shown.pair[0].name]));
    await page.click("#ttsAll summary"); await page.waitForTimeout(120);
    /* hear the pair: both voices, no quote marks */
    await page.evaluate(() => { window.__speakLog.length = 0; });
    await page.click("#ttsSample");
    await page.waitForFunction(() => window.__speakLog.length >= 4, null, { timeout: 10000 }).catch(() => null);
    const smp = await page.evaluate(() => window.__speakLog.slice());
    R.check("hear the pair speaks the line in both voices", smp.length === 4 && smp[0].voice === V.karen && smp[1].text === "Are you still reading?" && smp[1].voice === V.guy && smp[3].text === "Just one more chapter!" && smp[3].voice === V.guy, JSON.stringify(smp.map((e) => e.text)));
    /* dialogue: the narrator's own voice, and a voice chosen by hand */
    await page.evaluate(() => window.llSpeak.setDialogue("same")); await page.waitForTimeout(60);
    const same = await page.evaluate(() => ({ dlg: window.llSpeak.dialogueVoice().voice.name, stored: localStorage.getItem("ll_tts_dialogue_en") }));
    R.check("dialogue “Same as narrator” is honoured and persisted", same.dlg === V.karen && same.stored === "same", JSON.stringify(same));
    await page.click('.v-card:nth-child(6) .v-assign[data-role="dlg"]'); await page.waitForTimeout(80);
    R.check("a chosen dialogue voice is honoured", await page.evaluate(() => window.llSpeak.dialogueVoice().voice.name) === V.david);
    await page.evaluate(() => window.llSpeak.setDialogue("")); await page.waitForTimeout(60);

    /* ---- 4. expression Off: pitch 1, rate = speed, voices still switch ---- */
    await page.click('#ttsExpr .chip[data-expr="off"]'); await page.waitForTimeout(50);
    const offState = await page.evaluate(() => ({ checked: document.querySelector("#ttsExpr [aria-checked=true]").dataset.expr, stored: localStorage.getItem("ll_tts_expr") }));
    R.check("expression Off is selected and persisted", offState.checked === "off" && offState.stored === "off", JSON.stringify(offState));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.$eval("#ttsRate", (el) => { el.value = "1.5"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    const o = unramp(await readFrom(page, "“Wait!” he shouted", 3));
    R.check("Off: every unit has pitch 1 and rate = speed, but the voices still switch",
      o.length >= 3 && o.every((e) => e.pitch === 1 && near(e.rate, 1.5) && e.volume === 1) && o[0].voice === V.guy && o[1].voice === V.karen, JSON.stringify(o.slice(0, 3)));
    await page.$eval("#ttsRate", (el) => { el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    /* dramatic, then back to natural, through the panel */
    await openVoices(page);
    await page.click('#ttsExpr .chip[data-expr="dramatic"]'); await page.waitForTimeout(50);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const d = unramp(await readFrom(page, "“Wait!” he shouted", 1));
    R.check("Dramatic pushes the offsets harder", d[0] && near(d[0].pitch, 1.3) && near(d[0].rate, 1.338), JSON.stringify(d[0]));
    await openVoices(page);
    await page.click('#ttsExpr .chip[data-expr="natural"]'); await page.waitForTimeout(50);
    /* the pitch slider moves the narrator */
    await page.$eval("#ttsPitch", (el) => { el.value = "1.2"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const p = await readFrom(page, "He asked, “Are you coming?”", 1);
    const storedPitch = await page.evaluate(() => localStorage.getItem("ll_tts_pitch"));
    R.check("the pitch slider shifts the narrator's pitch and is persisted", p[0] && near(p[0].pitch, 1.2) && storedPitch === "1.2", JSON.stringify(p[0]) + " stored=" + storedPitch);
    /* a timer chosen while paused counts from the next play; Off hides the chip */
    await page.evaluate(() => window.__ll.Speak.pause());
    const t0 = await page.evaluate(() => { window.llSpeak.setSleep(30); return Object.assign(window.llSpeak.sleep(), { chip: document.getElementById("ttsSleep").hidden, text: document.getElementById("ttsSleepV").textContent }); });
    const t1 = await page.evaluate(() => { window.__ll.Speak.play(); return window.llSpeak.sleep(); });
    const t2 = await page.evaluate(() => { window.__ll.Speak.pause(); window.llSpeak.setSleep(0); return { chip: document.getElementById("ttsSleep").hidden, mode: window.llSpeak.sleep().mode, stored: Object.keys(localStorage).filter((k) => /sleep/i.test(k)).length }; });
    R.check("a timer chosen while paused shows its full length and starts counting on play; Off clears it, nothing persisted",
      t0.mode === 30 && t0.at === 0 && t0.chip === false && t0.text === "30 min" && t1.at > 0 && t2.chip === true && t2.mode === 0 && t2.stored === 0, JSON.stringify([t0, t1, t2]));
    await page.evaluate(() => window.__ll.Speak.stop());
    R.check("bar and panel: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));

    /* ---- 5. one pair per language: an English book and a Spanish one keep their own ---- */
    await startBar(page);
    await openVoices(page);
    await page.evaluate(() => window.llSpeak.setVoice(window.llSpeak.voiceId(window.llSpeak.sortedVoices()[1])));     /* Aria */
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__ll.Speak.setDocLang("es"));
    await page.waitForTimeout(150);
    const es = await panelState(page);
    R.check("a Spanish document is offered Spanish voices, and the English choice is left alone",
      es.pair[0].name === "Mónica" && es.pair[1].name === "Alvaro" && es.bar === "Mónica" &&
      JSON.stringify(es.cards.map((c) => c.name)) === JSON.stringify(["Mónica", "Alvaro"]), JSON.stringify([es.pair.map((r) => r.name), es.cards.map((c) => c.name), es.bar]));
    await page.click('.v-card:nth-child(2) .v-assign[data-role="narr"]'); await page.waitForTimeout(80);
    const esKeys = await page.evaluate(() => ({ en: localStorage.getItem("ll_tts_voice_en"), es: localStorage.getItem("ll_tts_voice_es") }));
    R.check("each language stores its own narrator", /AriaNeural/.test(esKeys.en) && /AlvaroNeural/.test(esKeys.es), JSON.stringify(esKeys));
    await page.evaluate(() => window.__ll.Speak.setDocLang("en"));
    await page.waitForTimeout(150);
    const backEn = await panelState(page);
    R.check("coming back to English brings the English choice back", backEn.pair[0].name === "Aria" && backEn.bar === "Aria", JSON.stringify([backEn.pair[0].name, backEn.bar]));
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    await page.evaluate(() => window.__ll.Speak.stop());

    /* ---- persistence across a reload ---- */
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const kept = await page.evaluate(() => ({ s: window.llSpeak.settings(), narr: window.llSpeak.currentVoice().name, bar: document.getElementById("ttsVoiceName").textContent,
      fixes: Object.keys(JSON.parse(localStorage.getItem("ll_voice_gender") || "{}")).length }));
    R.check("the voice chosen for this language, the expression, the pitch and the gender corrections survive a reload",
      /AriaNeural/.test(kept.s.voice) && kept.narr === V.aria && kept.bar === "Aria" && kept.s.dialogue === "" && kept.s.expr === "natural" && kept.s.pitch === 1.2 && kept.fixes === 1, JSON.stringify(kept));
    await page.evaluate(() => { localStorage.removeItem("ll_tts_voice_en"); localStorage.removeItem("ll_tts_voice"); localStorage.removeItem("ll_voice_gender"); });

    /* ---- 6. dark theme screenshots ---- */
    await openFixture(page, "sample.md");
    await setTheme(page, "dusk");
    await startBar(page);
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

  /* ---- the sleep timer, on a clock we drive: 15 minutes, then the end of the chapter ---- */
  const clockCtx = await context(1200, 800);
  try {
    const page = await clockCtx.newPage();
    page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
    await page.clock.install({ time: new Date("2026-09-20T21:00:00") });
    await page.goto(url, { waitUntil: "load" });
    await openFixture(page, "sample.md");
    await page.evaluate(() => { window.__speakDelay = 30000; });     /* half-minute sentences, so a chapter outlasts the timer */
    await startBar(page);
    const total = await page.evaluate(() => window.__ll.Speak.units().length);
    await openVoices(page);
    await page.click('#ttsSleepChips .chip[data-sleep="15"]'); await page.waitForTimeout(50);
    const c15 = await sleepChip(page);
    await shot(page, "sleep-panel-1200-day");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await shot(page, "sleep-bar-1200-day");
    R.check("choosing 15 min presses the chip and shows “Stops in 15 min” in the bar",
      JSON.stringify(c15.pressed) === JSON.stringify(["15"]) && !c15.hidden && c15.text === "Stops in 15 min" && c15.label === "Stops in 15 min — sleep timer" && c15.title === "Sleep timer — tap to change" && c15.live === "off" && c15.prefixShown, JSON.stringify(c15));
    await page.clock.runFor(3 * 60000);
    const c12 = await sleepChip(page);
    const mid = await page.evaluate(() => ({ active: window.__ll.Speak.isActive(), playing: window.__ll.Speak.isPlaying(), spoken: window.__speakLog.length }));
    R.check("three minutes later the chip counts down to 12 min and reading goes on", c12.text === "Stops in 12 min" && mid.active && mid.playing && mid.spoken >= 5 && mid.spoken < total, JSON.stringify([c12.text, mid]));
    await page.clock.runFor(13 * 60000);
    const done = await page.evaluate(() => ({ active: window.__ll.Speak.isActive(), playing: window.__ll.Speak.isPlaying(), on: document.getElementById("tts").classList.contains("on"), chip: document.getElementById("ttsSleep").hidden, spoken: window.__speakLog.length, mode: window.llSpeak.sleep().mode }));
    R.check("after 15 minutes reading has stopped at a sentence end, the bar and the chip are gone, the timer is cleared",
      !done.active && !done.playing && !done.on && done.chip && done.spoken >= 28 && done.spoken <= 32 && done.spoken < total && done.mode === 0, JSON.stringify(done) + " total=" + total);
    /* the chip opens the panel */
    await startBar(page);
    await page.evaluate(() => window.llSpeak.setSleep(45));
    await page.click("#ttsSleep");
    await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && document.getElementById("ttsSleepChips"), null, { timeout: 5000 });
    R.check("the bar's chip opens the Voices panel with the timer pressed", JSON.stringify((await sleepChip(page)).pressed) === JSON.stringify(["45"]));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.evaluate(() => window.__ll.Speak.stop());
    /* end of chapter: from the top, the reading stops before "Chapter 1" */
    await page.evaluate(() => { window.__speakLog.length = 0; window.__ll.Speak.start(0); });
    await openVoices(page);
    await page.click('#ttsSleepChips .chip[data-sleep="chapter"]'); await page.waitForTimeout(50);
    const cch = await sleepChip(page);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.clock.runFor(5 * 60000);
    const chap = await page.evaluate(() => ({ log: window.__speakLog.map((e) => e.text), active: window.__ll.Speak.isActive(), chip: document.getElementById("ttsSleep").hidden }));
    R.check("End of chapter stops right before the next heading", cch.text === "Stops at end of chapter" && JSON.stringify(chap.log) === JSON.stringify(["The Lamp", "A short sample book for Lamplight."]) && !chap.active && chap.chip, JSON.stringify([cch.text, chap]));
    /* dark theme shots with a timer set */
    await setTheme(page, "dusk");
    await startBar(page);
    await openVoices(page);
    await page.click('#ttsSleepChips .chip[data-sleep="30"]'); await page.waitForTimeout(50);
    await shot(page, "sleep-panel-1200-dusk");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await shot(page, "sleep-bar-1200-dusk");
    R.check("sleep timer: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("sleep timer (exception)", false, String(err).split("\n")[0]); }
  await clockCtx.close();

  /* ---- phone width: two rows in DOM order, panel as a bottom sheet, the compact chip ---- */
  const phone = await context(390, 844);
  try {
    const page = await newPage(phone, url);
    await openFixture(page, "sample.md");
    await startBar(page);
    const rows = await layout(page);
    R.check("phone: two rows, the buttons then speed, voice and ×, controls ≥ 36 px, no horizontal scroll",
      rows.rows.length === 2 && rows.rows[0].indexOf("ttsPlay") >= 0 && rows.rows[1].indexOf("ttsVoiceBtn") >= 0 && rows.rows[1].indexOf("ttsStop") >= 0 && rows.minH >= 36 && !rows.overflow, JSON.stringify(rows));
    R.check("phone: the focus order is the visual order", JSON.stringify(rows.dom) === JSON.stringify(rows.visual), JSON.stringify(rows.dom) + " vs " + JSON.stringify(rows.visual));
    await readFrom(page, "He asked, “Are you coming?”", 2);
    await page.evaluate(() => window.__ll.Speak.pause());
    await shot(page, "bar-390-day");
    await openVoices(page);
    const ph = await panelState(page);
    const oneCol = await page.evaluate(() => { const cs = document.querySelectorAll(".v-card"); return cs.length > 1 && Math.abs(cs[0].getBoundingClientRect().left - cs[1].getBoundingClientRect().left) < 1; });
    R.check("phone: the picker is a sheet with the same pair and cards, one card to a row",
      ph.pair[0].name === "Karen" && ph.cards.length === 6 && ph.all === "All voices (13)" && oneCol, JSON.stringify([ph.pair.map((r) => r.name), ph.cards.length, oneCol]));
    R.check("phone: nothing in the picker overflows the sheet",
      await page.evaluate(() => { const b = document.querySelector("#side .side-body"); return b.scrollWidth === b.clientWidth && document.documentElement.scrollWidth <= window.innerWidth; }));
    await shot(page, "panel-390-day");
    await page.evaluate(() => { document.getElementById("ttsAll").open = true; document.getElementById("sideBody").scrollTop = 620; });
    await page.waitForTimeout(200);
    await shot(page, "all-390-day");
    await page.evaluate(() => { document.getElementById("ttsAll").open = false; document.getElementById("sideBody").scrollTop = 0; });
    await page.waitForTimeout(150);
    /* the timer chip fits on the first row in its short form */
    await page.click('#ttsSleepChips .chip[data-sleep="15"]'); await page.waitForTimeout(50);
    await shot(page, "sleep-panel-390-day");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const pc = await sleepChip(page), prow = await layout(page);
    R.check("phone: the chip reads “15 min” with the full sentence as its name, on the first row, still two rows",
      !pc.hidden && !pc.prefixShown && pc.label === "Stops in 15 min — sleep timer" && prow.rows.length === 2 && prow.rows[0].indexOf("ttsSleep") >= 0 && JSON.stringify(prow.dom) === JSON.stringify(prow.visual) && !prow.overflow, JSON.stringify([pc, prow.rows]));
    await shot(page, "sleep-bar-390-day");
    await setTheme(page, "dusk");
    await shot(page, "sleep-bar-390-dusk");
    await openVoices(page);
    await shot(page, "sleep-panel-390-dusk");
    await page.click('#ttsSleepChips .chip[data-sleep="0"]'); await page.waitForTimeout(50);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await shot(page, "bar-390-dusk");
    await openVoices(page);
    await shot(page, "panel-390-dusk");
    await page.keyboard.press("Escape");
    R.check("phone: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("phone (exception)", false, String(err).split("\n")[0]); }
  await phone.close();

  /* ---- the widths between phone and desktop: no overlap of the speed value and the voice select ---- */
  for (const wpx of [600, 640, 740, 800]){
    const mid = await context(wpx, 800);
    try {
      const page = await newPage(mid, url);
      await openFixture(page, "sample.md");
      await startBar(page);
      const a = await layout(page);
      const wantRows = wpx <= 720 ? 2 : 1;
      R.check(wpx + " px: " + wantRows + " row(s), speed value clear of the voice button, focus order is the visual order",
        a.rows.length === wantRows && a.gap >= 4 && a.slider >= 60 && JSON.stringify(a.dom) === JSON.stringify(a.visual) && !a.overflow, JSON.stringify(a));
      if (wpx === 640) await shot(page, "bar-640-day");
      /* the compact bar has room for the timer chip too: it never overlaps and never grows a row
         it does not need (with the long voice select on the bar, 740 and 800 px both wrapped) */
      await page.evaluate(() => window.llSpeak.setSleep(15));
      const t = await layout(page);
      R.check(wpx + " px with the timer chip: still " + wantRows + " row(s), no overlap, DOM order kept",
        t.gap >= 4 && t.slider >= 60 && JSON.stringify(t.dom) === JSON.stringify(t.visual) && !t.overflow && t.rows.length === wantRows, JSON.stringify(t));
      if (wpx === 740) await shot(page, "sleep-bar-740-day");
      await page.close();
    } catch (err){ R.check(wpx + " px (exception)", false, String(err).split("\n")[0]); }
    await mid.close();
  }

  /* ---- a device that says nothing about who is speaking: the note, and a correction that sticks ---- */
  const blindCtx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await blindCtx.addInitScript(STUB);
  await blindCtx.addInitScript(`(function(){
    var vs = [{ name: "English United States", lang: "en-US", localService: true, voiceURI: "en-us-x-tpc-local" },
              { name: "English United States", lang: "en-US", localService: true, voiceURI: "en-us-x-tpd-local" },
              { name: "English United Kingdom", lang: "en-GB", localService: true, voiceURI: "en-gb-x-rjs-local" }];
    speechSynthesis.getVoices = function(){ return vs.slice(); };
  })();`);
  try {
    const page = await newPage(blindCtx, url);
    await openFixture(page, "sample.md");
    await startBar(page);
    await page.evaluate(() => window.__ll.Speak.pause());
    await openVoices(page);
    const blind = await panelState(page);
    R.check("with no gender anywhere the panel says so and marks every voice as unknown",
      blind.note && blind.cards.length === 3 && blind.cards.every((c) => c.sex === "—") && blind.all === "All voices (3)", JSON.stringify([blind.note, blind.cards.map((c) => c.name + c.sex)]));
    R.check("the pair still names two different voices, one pitched away from the other",
      blind.pair[0].name !== blind.pair[1].name && /quoted speech/.test(blind.hint), JSON.stringify([blind.pair.map((r) => r.name), blind.hint]));
    await page.click('.v-card:nth-child(2) .v-sex'); await page.waitForTimeout(100);
    const marked = await panelState(page);
    R.check("marking one of them a woman is enough for the note to go and the pair to follow",
      marked.cards[1].sex === "♀" && !marked.note && marked.pair[0].name === marked.cards[1].name, JSON.stringify([marked.cards.map((c) => c.name + c.sex), marked.pair.map((r) => r.name), marked.note]));
    const room = await page.evaluate(() => { const b = document.querySelector("#side .side-body"), side = document.getElementById("side").getBoundingClientRect();
      return { sw: b.scrollWidth, cw: b.clientWidth, past: Array.from(document.querySelectorAll(".tts-panel .v-name, .tts-panel .chip")).filter((e) => e.getBoundingClientRect().right > side.right).length }; });
    R.check("long identical names are cut short rather than pushed past the drawer", room.sw === room.cw && room.past === 0, JSON.stringify(room));
    await shot(page, "no-gender-1200-day");
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    R.check("no gender information: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("no gender information (exception)", false, String(err).split("\n")[0]); }
  await blindCtx.close();

  /* ---- the language of the document: what the browser's detector makes of the text, what an
     EPUB declares, and what #doc then carries for hyphenation ---- */
  const langCtx = await context(1200, 800);
  await langCtx.addInitScript(`(function(){
    window.__detected = [];
    Object.defineProperty(window, "LanguageDetector", { configurable: true, value: {
      create: function(){
        return Promise.resolve({ detect: function(text){
          window.__detected.push(text.length);
          return Promise.resolve([{ detectedLanguage: "es", confidence: 0.95 }, { detectedLanguage: "en", confidence: 0.02 }]);
        } });
      }
    } });
  })();`);
  try {
    const page = await newPage(langCtx, url);
    await openFixture(page, "sample.md");
    await page.waitForFunction(() => document.getElementById("doc").lang === "es", null, { timeout: 5000 }).catch(() => null);
    const det = await page.evaluate(() => ({ lang: document.getElementById("doc").lang, seen: window.__detected.slice(), reported: window.llSpeak.lang(),
      narr: window.llSpeak.currentVoice().name, dlg: window.llSpeak.dialogueVoice().voice.name, bar: document.getElementById("ttsVoiceName").textContent }));
    R.check("the detector reads the opening of the document and #doc carries the answer",
      det.lang === "es" && det.reported === "es" && det.seen.length >= 1 && det.seen[0] > 0 && det.seen[0] <= 2000, JSON.stringify(det));
    R.check("a document detected as Spanish is read by Spanish voices",
      det.narr === V.monica && det.dlg === V.alvaro && det.bar === "Mónica", JSON.stringify([det.narr, det.dlg, det.bar]));
    const spoken = await page.evaluate(() => { window.__speakLog.length = 0; window.__ll.Speak.start(0); return null; });
    await page.waitForFunction(() => window.__speakLog.length >= 1, null, { timeout: 5000 }).catch(() => null);
    const sl = await page.evaluate(() => window.__speakLog.slice(0, 1));
    R.check("and the engine is told that language", sl[0] && sl[0].lang === "es-ES" && sl[0].voice === V.monica, JSON.stringify(sl));
    await page.evaluate(() => window.__ll.Speak.stop());
    /* an EPUB says what language it is in; the detector's answer for that book replaces it */
    await openFixture(page, "sample.epub");
    await page.waitForTimeout(400);
    const ep = await page.evaluate(() => ({ lang: document.getElementById("doc").lang, reported: window.llSpeak.lang(), runs: window.__detected.length }));
    R.check("another book is detected afresh, and its answer replaces the one it declared",
      ep.runs >= 2 && ep.lang === "es" && ep.reported === "es", JSON.stringify(ep));
    R.check("language detection: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("language detection (exception)", false, String(err).split("\n")[0]); }
  await langCtx.close();
  /* with no detector at all the reader is left where the page says it is */
  const plainCtx = await context(1200, 800);
  try {
    const page = await newPage(plainCtx, url);
    await openFixture(page, "sample.epub");
    await page.waitForTimeout(400);
    const ep = await page.evaluate(() => ({ lang: document.getElementById("doc").lang, reported: window.llSpeak.lang(), narr: window.llSpeak.currentVoice().name }));
    R.check("without a detector an EPUB's own dc:language sets #doc[lang] and the voices",
      ep.lang === "en" && ep.reported === "en" && ep.narr === V.karen, JSON.stringify(ep));
    R.check("no detector: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("no detector (exception)", false, String(err).split("\n")[0]); }
  await plainCtx.close();

  /* ---- PDFs: units come from the page text, quoted speech gets the other voice, and a
     stop or restart while a page's text loads leaves no ghost reading and no duplicate pages ---- */
  const pdfCtx = await context(1200, 800);
  try {
    let page = await newPage(pdfCtx, url);
    await openFixture(page, "sample.pdf");
    await page.keyboard.press("r");
    await page.waitForFunction(() => window.__speakLog.length >= 6, null, { timeout: 30000 }).catch(() => null);
    const log = await page.evaluate(() => window.__speakLog.slice());
    const spoken = log.filter((e) => e.voice === V.karen).length, quoted = log.filter((e) => e.voice === V.guy);
    R.check("PDF: read aloud runs from the page text, narration and quoted speech in their own voices",
      spoken >= 3 && quoted.length >= 1 && quoted.every((e) => noQuotes(e.text)) && log.some((e) => /lamp hums quietly/.test(e.text)), JSON.stringify(log.slice(0, 6)));
    await page.waitForTimeout(1500);
    const clean = await page.evaluate(() => { const us = window.__ll.Speak.units(); const by = {}; us.forEach((u) => { by[u.page] = (by[u.page] || 0) + 1; }); return { total: us.length, by }; });
    R.check("PDF: every page's text is loaded once, in order", clean.total > 50 && Object.keys(clean.by).length === 5, JSON.stringify(clean));
    /* end of chapter in a PDF: the end of the page */
    await page.evaluate(() => { window.__ll.Speak.stop(); window.__speakLog.length = 0; });
    await page.keyboard.press("r");
    await page.waitForFunction(() => window.__ll.Speak.units().length > 0, null, { timeout: 10000 });
    await openVoices(page);
    await page.click('#ttsSleepChips .chip[data-sleep="chapter"]'); await page.waitForTimeout(50);
    const pchip = await sleepChip(page);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await page.waitForFunction(() => !window.__ll.Speak.isActive(), null, { timeout: 40000 }).catch(() => null);
    const pend = await page.evaluate(() => ({ spoken: window.__speakLog.length, active: window.__ll.Speak.isActive(), page: window.__ll.Library.currentPdfPage() }));
    R.check("PDF: End of chapter stops at the end of the page", pchip.text === "Stops at end of page" && pend.spoken === clean.by[1] && !pend.active && pend.page === 1, JSON.stringify([pchip.text, pend, clean.by[1]]));
    await page.close();

    /* the first page's text takes 1.5 s: stopping meanwhile must leave nothing behind */
    const slow = () => page.evaluate(() => { const d = window.__ll.state.pdfDoc, g = d.getPage.bind(d); d.getPage = (i) => new Promise((res) => setTimeout(() => res(g(i)), 1500)); window.__speakLog.length = 0; });
    page = await newPage(pdfCtx, url);
    await openFixture(page, "sample.pdf"); await slow();
    await page.keyboard.press("r"); await page.waitForTimeout(200); await page.keyboard.press("r"); await page.waitForTimeout(2500);
    const ghost = await page.evaluate(() => ({ spoken: window.__speakLog.length, playing: window.__ll.Speak.isPlaying(), active: window.__ll.Speak.isActive(), units: window.__ll.Speak.units().length, on: document.getElementById("tts").classList.contains("on") }));
    R.check("PDF: stopping while the first page loads leaves no ghost reading", ghost.spoken === 0 && !ghost.playing && !ghost.active && ghost.units === 0 && !ghost.on, JSON.stringify(ghost));
    await page.close();
    page = await newPage(pdfCtx, url);
    await openFixture(page, "sample.pdf"); await slow();
    await page.keyboard.press("r"); await page.waitForTimeout(200);
    await openFixture(page, "sample.md"); await page.waitForTimeout(2200);
    const swapped = await page.evaluate(() => ({ spoken: window.__speakLog.length, playing: window.__ll.Speak.isPlaying(), active: window.__ll.Speak.isActive(), on: document.getElementById("tts").classList.contains("on"), painted: !!(CSS.highlights && (CSS.highlights.has("ll-speak") || CSS.highlights.has("ll-speak-dialogue"))), mode: window.__ll.state.mode }));
    R.check("PDF: opening another document while the first page loads leaves no ghost reading", swapped.spoken === 0 && !swapped.playing && !swapped.active && !swapped.on && !swapped.painted && swapped.mode === "doc", JSON.stringify(swapped));
    await page.close();
    /* stop and start again while the later pages stream in: each page once */
    page = await newPage(pdfCtx, url);
    await openFixture(page, "sample.pdf");
    await page.keyboard.press("r");
    await page.waitForFunction(() => window.__ll.Speak.units().length > 0, null, { timeout: 10000 });
    await page.keyboard.press("r"); await page.waitForTimeout(20); await page.keyboard.press("r");
    await page.waitForTimeout(1500);
    const again = await page.evaluate(() => {
      const us = window.__ll.Speak.units(); const by = {}; let ordered = true;
      us.forEach((u, i) => { by[u.page] = (by[u.page] || 0) + 1; if (i && u.page < us[i - 1].page) ordered = false; });
      return { total: us.length, by, ordered, unique: new Set(us.map((u) => u.page + ":" + u.start + ":" + u.text)).size === us.length, active: window.__ll.Speak.isActive(), playing: window.__ll.Speak.isPlaying() };
    });
    R.check("PDF: a restart while pages load doesn't append them twice", again.total === clean.total && JSON.stringify(again.by) === JSON.stringify(clean.by) && again.ordered && again.unique && again.active && again.playing, JSON.stringify(again) + " clean=" + JSON.stringify(clean));
    await page.evaluate(() => window.__ll.Speak.stop());
    R.check("PDF: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await page.close();
  } catch (err){ R.check("pdf (exception)", false, String(err).split("\n")[0]); }
  await pdfCtx.close();

  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})();
