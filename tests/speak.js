/* Read aloud: voices by gender, a second voice for quoted speech, expression read off the
   text, lock-screen (Media Session) controls, the sleep timer, and the review fixes (PDF
   start/stop races, settings changes in the breath between sentences, exact offsets across
   whitespace runs, the panel and bar layouts, a linear planner). Headless Chromium has no
   voices, so the speech API is stubbed before the app loads and every utterance is logged;
   the Media Session and <audio> are stubbed the same way. Screenshots go to $LL_SHOTS
   (default: the OS temp dir). */
const fs = require("fs"), os = require("os"), path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-speak");

const STUB = `(function(){
  var voices = [
    { name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "Samantha" },
    { name: "Daniel", lang: "en-GB", localService: true, default: false, voiceURI: "Daniel" },
    { name: "Google US English", lang: "en-US", localService: false, default: false, voiceURI: "Google US English" },
    { name: "espeak", lang: "en", localService: true, default: false, voiceURI: "espeak" },
    { name: "Microsoft David Desktop - English (United States)", lang: "en-US", localService: true, default: false, voiceURI: "David" }
  ];
  var log = window.__speakLog = [];
  /* each utterance ends after __speakDelay ms (5 by default; the sleep-timer checks make it 30 s) */
  var synth = {
    getVoices: function(){ return voices.slice(); },
    speak: function(u){
      log.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate, volume: u.volume });
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
  async function startBar(page){
    await page.keyboard.press("r");
    await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
    await page.waitForTimeout(200);
  }
  /* the bar's controls in DOM order and in visual order (rows by vertical centre, then left to right) */
  const layout = (page) => page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("#tts button:not([hidden]), #tts label, #tts select"));
    const boxes = els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.tagName, cy: r.top + r.height / 2, x: r.left, h: r.height }; });
    const rows = [];
    boxes.slice().sort((a, b) => a.cy - b.cy).forEach((b) => { const r = rows[rows.length - 1]; if (r && Math.abs(r[0].cy - b.cy) < 12) r.push(b); else rows.push([b]); });
    const visual = []; rows.forEach((r) => r.sort((a, b) => a.x - b.x).forEach((b) => visual.push(b.id)));
    const rateV = document.getElementById("ttsRateV").getBoundingClientRect(), sel = document.getElementById("ttsVoice").getBoundingClientRect();
    return { dom: boxes.map((b) => b.id), visual, rows: rows.map((r) => r.map((b) => b.id)), minH: Math.min.apply(null, boxes.map((b) => b.h)),
      overflow: document.documentElement.scrollWidth > window.innerWidth, gap: Math.round(sel.left - rateV.right), slider: Math.round(document.getElementById("ttsRate").getBoundingClientRect().width),
      barH: document.getElementById("tts").getBoundingClientRect().height };
  });
  const sleepChip = (page) => page.evaluate(() => {
    const c = document.getElementById("ttsSleep"), w = document.getElementById("ttsSleepW"), v = document.getElementById("ttsSleepV"), shown = getComputedStyle(w).display !== "none";
    return { hidden: c.hidden, text: (shown ? w.textContent + " " : "") + v.textContent, label: c.getAttribute("aria-label"), title: c.title, live: c.getAttribute("aria-live"),
      prefixShown: shown, pressed: Array.from(document.querySelectorAll("#ttsSleepChips .chip")).filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.sleep) };
  });

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

    /* ---- 2. the bar: grouped voices, ♀ ♂, the dialogue voice ---- */
    page = await newPage(ctx, url);
    await openFixture(page, "sample.md");
    await startBar(page);
    const groups = await page.$$eval("#ttsVoice optgroup", (gs) => gs.map((g) => g.label + ":" + Array.from(g.querySelectorAll("option")).map((o) => o.textContent).join("|")));
    R.check("voice select is grouped Women / Men / Other, local before online",
      JSON.stringify(groups) === JSON.stringify(["Women:Samantha|Google US English (online)", "Men:Daniel|Microsoft David Desktop - English (United States)", "Other:espeak"]), JSON.stringify(groups));
    const sexBtns = await page.evaluate(() => [document.getElementById("ttsWoman").hidden, document.getElementById("ttsMan").hidden, document.getElementById("ttsWoman").getAttribute("aria-pressed")]);
    R.check("♀ and ♂ are shown when such voices exist; ♀ pressed for Samantha", sexBtns[0] === false && sexBtns[1] === false && sexBtns[2] === "true", JSON.stringify(sexBtns));
    const auto1 = await page.evaluate(() => ({ narr: document.getElementById("ttsVoice").value, dlg: window.llSpeak.dialogueVoice().voice.name }));
    R.check("dialogue voice defaults to the other gender (Samantha → Daniel)", auto1.narr === "Samantha" && auto1.dlg === "Daniel", JSON.stringify(auto1));
    await page.click("#ttsMan"); await page.waitForTimeout(100);
    const auto2 = await page.evaluate(() => ({ narr: document.getElementById("ttsVoice").value, dlg: window.llSpeak.dialogueVoice().voice.name, pressed: document.getElementById("ttsMan").getAttribute("aria-pressed"), stored: localStorage.getItem("ll_tts_voice") }));
    R.check("♂ picks Daniel and the dialogue voice flips to Samantha", auto2.narr === "Daniel" && auto2.dlg === "Samantha" && auto2.pressed === "true" && auto2.stored === "Daniel", JSON.stringify(auto2));
    await page.click("#ttsWoman"); await page.waitForTimeout(100);
    R.check("♀ picks Samantha again", await page.$eval("#ttsVoice", (s) => s.value) === "Samantha");
    const desk = await layout(page);
    R.check("bar stays one row on desktop, controls ≥ 36 px, DOM order is the visual order", desk.barH < 70 && desk.minH >= 36 && desk.rows.length === 1 && JSON.stringify(desk.dom) === JSON.stringify(desk.visual) && desk.gap > 0, JSON.stringify(desk));
    await shot(page, "bar-1200-day");

    /* a change in the breath after a sentence is picked up by the next one, not by replaying the last */
    await page.evaluate(() => { window.__speakLog.length = 0; window.__ll.Speak.start(0); });
    await page.waitForFunction(() => window.__speakLog.length >= 1, null, { timeout: 5000 });
    await page.waitForTimeout(60);
    await page.$eval("#ttsRate", (el) => { el.value = "1.2"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(900);
    const breath = await page.evaluate(() => window.__speakLog.slice());
    R.check("a speed change during the breath is honoured by the next sentence and doesn't replay the finished one",
      breath.length === 2 && breath[0].text === "The Lamp" && breath[1].text === "A short sample book for Lamplight." && near(breath[1].rate, 1.2), JSON.stringify(breath.map((e) => e.text + " @" + e.rate)));
    await page.$eval("#ttsRate", (el) => { el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); });

    /* ---- 3. reading: narrator vs dialogue voice, expression from the text ---- */
    await page.evaluate(() => { window.__speakLog.length = 0; window.__media.meta.length = 0; window.__ll.Speak.start(0); });
    await page.waitForFunction(() => window.__speakLog.length >= 9, null, { timeout: 20000 }).catch(() => null);
    const log = await page.evaluate(() => window.__speakLog.slice());
    const texts = log.map((e) => e.text);
    R.check("reads the heading, then the first paragraph sentence by sentence",
      texts[0] === "The Lamp" && texts[2] === "Chapter 1" && texts[3] === "The lamp hums quietly as she turns the page." && texts[4] === "One more chapter," && texts[5] === "she tells herself," && texts[6] === "just one more.", JSON.stringify(texts.slice(0, 8)));
    R.check("narration is spoken by the narrator, quoted speech by the dialogue voice, without quote marks",
      log[3] && log[3].voice === "Samantha" && log[4] && log[4].voice === "Daniel" && log[5].voice === "Samantha" && log[6].voice === "Daniel" && texts.every(noQuotes), JSON.stringify(log.slice(3, 7)));
    R.check("heading is slower and lower; plain sentence neutral", log[0] && near(log[0].rate, 0.9) && near(log[0].pitch, 0.95) && log[3] && log[3].pitch === 1 && log[3].rate === 1, JSON.stringify([log[0], log[3]]));

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
      pitch: document.getElementById("ttsPitch").value, sample: !!document.getElementById("ttsSample"), title: document.getElementById("sideTitle").textContent,
      sleep: Array.from(document.querySelectorAll("#ttsSleepChips .chip")).map((c) => c.textContent + (c.getAttribute("aria-pressed") === "true" ? "*" : "")),
      sleepLabel: document.querySelector('#ttsSleepChips .chip[data-sleep="15"]').getAttribute("aria-label")
    }));
    R.check("Voices panel: narrator, dialogue (Auto / Same / grouped), expression, pitch, sample",
      panel.title === "Read-aloud voices" && panel.narr === "Samantha" && panel.dlg === "" && panel.dlgOpts[0].indexOf("Auto") === 0 && panel.dlgOpts[1] === "Same as narrator" &&
      JSON.stringify(panel.groups) === JSON.stringify(["Women", "Men", "Other"]) && /Daniel/.test(panel.hint) && panel.checked === "natural" && panel.pitch === "1" && panel.sample, JSON.stringify(panel));
    R.check("Voices panel: a Stop after row of chips, Off pressed", JSON.stringify(panel.sleep) === JSON.stringify(["Off*", "15", "30", "45", "60 min", "End of chapter"]) && panel.sleepLabel === "15 minutes", JSON.stringify(panel.sleep));
    const fit = await page.evaluate(() => {
      const body = document.querySelector("#side .side-body"), narr = document.getElementById("ttsNarr").getBoundingClientRect(), side = document.getElementById("side").getBoundingClientRect();
      return { sw: body.scrollWidth, cw: body.clientWidth, narrRight: Math.round(narr.right), sideRight: Math.round(side.right), pitchV: document.getElementById("ttsPitchV").textContent, longest: Array.from(document.getElementById("ttsNarr").options).map((o) => o.textContent.length).sort((a, b) => b - a)[0] };
    });
    R.check("Voices panel: a Windows-style voice name doesn't push the selects past the drawer", fit.sw === fit.cw && fit.narrRight < fit.sideRight && fit.pitchV === "1.00" && fit.longest > 40, JSON.stringify(fit));
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
    /* a timer chosen while paused counts from the next play; Off hides the chip */
    await page.evaluate(() => window.__ll.Speak.pause());
    const t0 = await page.evaluate(() => { window.llSpeak.setSleep(30); return Object.assign(window.llSpeak.sleep(), { chip: document.getElementById("ttsSleep").hidden, text: document.getElementById("ttsSleepV").textContent }); });
    const t1 = await page.evaluate(() => { window.__ll.Speak.play(); return window.llSpeak.sleep(); });
    const t2 = await page.evaluate(() => { window.__ll.Speak.pause(); window.llSpeak.setSleep(0); return { chip: document.getElementById("ttsSleep").hidden, mode: window.llSpeak.sleep().mode, stored: Object.keys(localStorage).filter((k) => /sleep/i.test(k)).length }; });
    R.check("a timer chosen while paused shows its full length and starts counting on play; Off clears it, nothing persisted",
      t0.mode === 30 && t0.at === 0 && t0.chip === false && t0.text === "30 min" && t1.at > 0 && t2.chip === true && t2.mode === 0 && t2.stored === 0, JSON.stringify([t0, t1, t2]));
    await page.evaluate(() => window.__ll.Speak.stop());
    R.check("bar and panel: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));

    /* ---- persistence across a reload ---- */
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const kept = await page.evaluate(() => window.llSpeak.settings());
    R.check("voice, dialogue, expression and pitch survive a reload", kept.voice === "Samantha" && kept.dialogue === "" && kept.expr === "natural" && kept.pitch === 1.2, JSON.stringify(kept));

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
      rows.rows.length === 2 && rows.rows[0].indexOf("ttsPlay") >= 0 && rows.rows[0].indexOf("ttsVoices") >= 0 && rows.rows[1].indexOf("ttsVoice") >= 0 && rows.rows[1].indexOf("ttsStop") >= 0 && rows.minH >= 36 && !rows.overflow, JSON.stringify(rows));
    R.check("phone: the focus order is the visual order", JSON.stringify(rows.dom) === JSON.stringify(rows.visual), JSON.stringify(rows.dom) + " vs " + JSON.stringify(rows.visual));
    await readFrom(page, "He asked, “Are you coming?”", 2);
    await page.evaluate(() => window.__ll.Speak.pause());
    await shot(page, "bar-390-day");
    await openVoices(page);
    await shot(page, "panel-390-day");
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
      R.check(wpx + " px: " + wantRows + " row(s), speed value clear of the voice select, focus order is the visual order",
        a.rows.length === wantRows && a.gap >= 4 && a.slider >= 60 && JSON.stringify(a.dom) === JSON.stringify(a.visual) && !a.overflow, JSON.stringify(a));
      if (wpx === 640) await shot(page, "bar-640-day");
      /* with the timer chip showing, one row needs more room: the bar wraps rather than overlaps */
      await page.evaluate(() => window.llSpeak.setSleep(15));
      const t = await layout(page);
      R.check(wpx + " px with the timer chip: no overlap, DOM order kept", t.gap >= 4 && t.slider >= 60 && JSON.stringify(t.dom) === JSON.stringify(t.visual) && !t.overflow && (wpx > 830 || t.rows.length === 2), JSON.stringify(t));
      if (wpx === 740) await shot(page, "sleep-bar-740-day");
      await page.close();
    } catch (err){ R.check(wpx + " px (exception)", false, String(err).split("\n")[0]); }
    await mid.close();
  }

  /* ---- PDFs: units come from the page text, quoted speech gets the other voice, and a
     stop or restart while a page's text loads leaves no ghost reading and no duplicate pages ---- */
  const pdfCtx = await context(1200, 800);
  try {
    let page = await newPage(pdfCtx, url);
    await openFixture(page, "sample.pdf");
    await page.keyboard.press("r");
    await page.waitForFunction(() => window.__speakLog.length >= 6, null, { timeout: 30000 }).catch(() => null);
    const log = await page.evaluate(() => window.__speakLog.slice());
    const spoken = log.filter((e) => e.voice === "Samantha").length, quoted = log.filter((e) => e.voice === "Daniel");
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
