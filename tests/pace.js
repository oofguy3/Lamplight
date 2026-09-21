/* Reading pace: the detector that tells reading from skimming, checking, pausing, listening and
   looking things up, times only the reading, and keeps a words-per-minute (pages-per-minute for
   PDFs) with a confidence, globally and per book. Playwright's clock drives the app's timers, so
   an hour of reading takes a second; every scenario runs in its own browser context.
     NODE_PATH=$(npm root -g) node tests/pace.js        (LL_SHOTS=<dir> for the screenshots) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto");
const { serve, browser, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), "lamplight-pace");
const T0 = new Date("2026-09-16T10:00:00");
/* node tests/pace.js '^A1'  runs the scenarios whose names match (also $PACE_ONLY) */
const ONLY = (process.argv[2] || process.env.PACE_ONLY) ? new RegExp(process.argv[2] || process.env.PACE_ONLY) : null;

/* headless Chromium has no voices: the speech API is stubbed as tests/speak.js does */
const STUB = `(function(){
  var voices = [{ name: "Samantha", lang: "en-US", localService: true, default: true, voiceURI: "Samantha" },
                { name: "Daniel", lang: "en-GB", localService: true, default: false, voiceURI: "Daniel" }];
  var synth = { getVoices: function(){ return voices.slice(); },
    speak: function(u){ setTimeout(function(){ if (u.onstart) u.onstart({}); }, 1); setTimeout(function(){ if (u.onend) u.onend({}); }, window.__speakDelay || 5); },
    cancel: function(){}, pause: function(){}, resume: function(){}, addEventListener: function(){}, removeEventListener: function(){},
    speaking: false, pending: false, paused: false };
  function Utterance(t){ this.text = t; this.voice = null; this.lang = ""; this.pitch = 1; this.rate = 1; this.volume = 1; this.onend = null; this.onerror = null; this.onstart = null; }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, writable: true, value: synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: Utterance });
  HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
})();`;

/* ---------- generated fixtures: every token is letters plus a trailing full stop, so the word
   count is exact and known ---------- */
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const VOCAB = ["the","lamp","quiet","page","evening","river","letter","window","she","he","they","turned","slowly","light","again","before","after","house","garden","voice","hands","door","rain","morning","paper","small","old","long","under","over","between","without","almost","remember","nothing","something","story","chapter","word","line","book","table","chair","street","town","hill","field","sky","and","of"];
function words(n, seed){ const r = rng(seed), out = []; while (out.length < n){ const len = 8 + Math.floor(r() * 7); const s = []; for (let i = 0; i < len && out.length + s.length < n; i++) s.push(VOCAB[Math.floor(r() * VOCAB.length)]); s[0] = s[0][0].toUpperCase() + s[0].slice(1); s[s.length - 1] += "."; out.push(...s); } return out; }
function paras(list, per){ const ps = []; for (let i = 0; i < list.length; i += per) ps.push(list.slice(i, i + per).join(" ")); return ps.join("\n\n"); }
const W5000 = words(5000, 7);
const TXT_PARAS = paras(W5000, 60);                                                  /* 84 paragraphs of 60 words */
const TXT_GIANT = W5000.join(" ");                                                  /* one paragraph */
const TXT_OTHER = paras(words(5000, 13), 60);                                        /* another book: a different id */
const MD_TINY = W5000.join(" ").replace(/\. /g, ".\n\n");                           /* one sentence per paragraph */
const TXT_300K = words(300000, 11).join(" ").replace(/((?:\S+\s+){60})/g, "$1\n\n");
/* five chapters with headings (contents jumps); a marker word to search for (D4) */
const MD_CHAPTERS = (() => { let out = "# The Long Book\n\n"; for (let ch = 0; ch < 5; ch++){ out += "## Chapter " + (ch + 1) + "\n\n" + paras(W5000.slice(ch * 1000, ch * 1000 + 1000), 50) + "\n\n"; } return out; })();
const MARK_AT = 620, TXT_MARK = (() => { const w = W5000.slice(); w[MARK_AT] = "Zyzzyva"; return paras(w, 60); })();
/* 5 000 words of HTML with a tall image and a 20-word caption after paragraph 40 */
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const HTML_IMG = (() => {
  const ps = []; for (let i = 0; i < 5000; i += 60) ps.push("<p>" + W5000.slice(i, i + 60).join(" ") + "</p>");
  /* the 1×1 PNG keeps its square ratio under height:auto, so width sets the height too: 620 px */
  ps.splice(40, 0, '<img src="' + PNG1 + '" width="620" height="620" alt="">', "<p>" + words(20, 5).join(" ") + "</p>");
  return "<!DOCTYPE html><html><body>" + ps.join("\n") + "</body></html>";
})();
function sha256hex(text){ return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"); }

/* ---------- harness ---------- */
async function openPage(ctx, url, prefs){
  if (prefs) await ctx.addInitScript((p) => { try { localStorage.setItem("ll_prefs", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ll_prefs") || "{}"), p))); } catch(_){} }, prefs);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
  await page.clock.install({ time: T0 });          /* real-time flow until pauseAt */
  await page.goto(url, { waitUntil: "load" });
  return page;
}
/* a document through the hidden input; the wait advances the fake clock in small steps, so it
   also works once the clock is paused (the index is built by timers) */
const indexReady = (id) => {
  const cur = window.__ll.Library.currentId(), ix = window.llPace._debug.index;
  return document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 100 &&
    !!cur && ix.ready && ix.key.indexOf(cur + ":") === 0 && (!id || cur === id);
};
async function waitReady(page, id){
  for (let i = 0; i < 400; i++){
    if (await page.evaluate(indexReady, id || null)) return;
    await page.clock.runFor(250);
    await page.waitForTimeout(25);
  }
  throw new Error("the document did not get ready");
}
async function openText(page, name, text, mime){
  await page.setInputFiles("#fileInput", { name, mimeType: mime || "text/plain", buffer: Buffer.from(text, "utf8") });
  await waitReady(page);
}
async function openPdf(page, name){
  await openFixture(page, name || "sample.pdf");
  await page.waitForFunction(() => window.__ll.Library.currentId(), null, { timeout: 30000 });
}
/* pause the clock and anchor at a known moment, so every later timestamp is deterministic */
async function start(page, atMs){
  await page.clock.pauseAt(new Date(T0.getTime() + (atMs || 60000)));
  return page.evaluate(() => window.llPace._debug.anchorNow());
}
const settle = (page, ms) => page.clock.runFor(ms || 2000);          /* SETTLE + one heartbeat */
const phase = (page) => page.evaluate(() => window.llPace.state().phase);
const st = (page) => page.evaluate(() => window.llPace.state());
const trans = (page) => page.evaluate(() => window.llPace._debug.transitions());
const starts = (page) => page.evaluate(() => window.llPace._debug.index.starts);
const runs = (page) => page.evaluate(() => window.llPace.runs());
const wpm = (page) => page.evaluate(() => window.llPace.wpm());
const docWpm = (page) => page.evaluate(() => window.llPace.docWpm());
const measure = (page) => page.evaluate(() => window.llPace._debug.measure());
const fragments = (page) => page.evaluate(() => window.llPace._debug.fragments);
const today = (page) => page.evaluate(() => { const s = window.llStats.snapshot(); return s.days[s.today] || { ms: 0, words: 0, pages: 0, skimmed: 0, listened: 0 }; });
const errorsOf = (page) => (page._errors || []).join(" | ");
/* the synthetic reader: put word k at the top of the view and tell the app */
async function goWord(page, off){ await page.evaluate((o) => { window.__ll.revealOffset(o); window.dispatchEvent(new Event("scroll")); }, off); }
/* dwell, then move on by stepWords, `steps` times; returns the index of the word now at the top */
async function readScroll(page, S, fromWord, stepWords, steps, dwellMs, firstDwellMs){
  let k = fromWord;
  for (let i = 1; i <= steps; i++){ await page.clock.runFor(i === 1 && firstDwellMs !== undefined ? firstDwellMs : dwellMs); k = fromWord + i * stepWords; await goWord(page, S[k]); }
  return k;
}
/* Pages flow: dwell exactly V / wpm per page (or dwellMs), then turn; returns what each turn saw */
async function turnPages(page, turns, wpm, dwellMs){
  const out = [];
  for (let i = 0; i < turns; i++){
    const V = (await measure(page)).V, ms = dwellMs || Math.round(V / wpm * 60000);
    await page.clock.runFor(ms);
    await page.keyboard.press("ArrowRight");
    out.push({ V, ms });
  }
  await settle(page);
  return out;
}
/* write ll_pace / ll_stats from a plain page on the same origin */
async function seed(ctx, url, key, data){
  const p = await ctx.newPage(); await p.goto(url + "tests/fixtures/sample.txt");
  await p.evaluate(([k, d]) => { if (d === null) localStorage.removeItem(k); else localStorage.setItem(k, typeof d === "string" ? d : JSON.stringify(d)); }, [key, data]); await p.close();
}
const ofKind = (tr, k) => tr.filter((t) => t.kind === k);
const kinds = (tr) => tr.map((t) => t.kind).join(" ");
const near = (x, y, pct) => Math.abs(x - y) <= pct / 100 * Math.abs(y);
const within = (x, y, abs) => Math.abs(x - y) <= abs;
const rateOf = (r) => (r.k === "p" ? r.p : r.w) / r.ms * 60000;
/* the estimator's arithmetic, for expected values: weighted interpolated median + fading prior */
function median(items){ const W = items.reduce((a, x) => a + x.u, 0); let acc = 0; const pts = items.slice().sort((a, b) => a.r - b.r).map((x) => { const c = (acc + x.u / 2) / W; acc += x.u; return { c, r: x.r }; }); if (0.5 <= pts[0].c) return pts[0].r; if (0.5 >= pts[pts.length - 1].c) return pts[pts.length - 1].r; for (let i = 1; i < pts.length; i++) if (0.5 <= pts[i].c){ const a = pts[i - 1], b = pts[i]; return a.r + (b.r - a.r) * (0.5 - a.c) / (b.c - a.c); } return pts[pts.length - 1].r; }
function globalOf(list){ const items = list.map((r) => ({ r: rateOf(r), u: Math.min(r.w, 3000) })); const W = items.reduce((a, x) => a + x.u, 0); return W ? (400 * 230 + W * median(items)) / (400 + W) : 230; }
function bookOf(list, id){ const G = globalOf(list), own = list.filter((r) => r.b === id).map((r) => ({ r: rateOf(r), u: Math.min(r.w, 3000) })); const W = own.reduce((a, x) => a + x.u, 0); return W ? (400 * G + W * median(own)) / (400 + W) : G; }

const scenarios = [];
function scenario(name, opts, fn){ scenarios.push({ name, opts: opts || {}, fn }); }
const desktop = { viewport: { width: 1200, height: 800 } }, phone = { viewport: { width: 390, height: 844 } };

/* ============================== A. the brief's thirteen ============================== */

scenario("A1+A3 steady reading at 250 wpm, then a 6-second chapter scroll-through", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  const index = await page.evaluate(() => { const i = window.llPace._debug.index; return { words: i.words, slices: i.slices, ms: i.ms }; });
  c("the word index counts 5000 words", index.words === 5000, JSON.stringify(index));
  c("anchored: phase reading", (await start(page)) && (await phase(page)) === "reading", await phase(page));
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 2, 14400);
  await page.clock.runFor(1000);                    /* the second step settles */
  let s = await st(page);
  c("no run before 40 s / 120 words / 2 steps", (await runs(page)).length === 0 && !s.run.qualifies && s.run.n === 2 && s.run.buffered === 120, JSON.stringify(s.run));
  await readScroll(page, S, 120, 60, 1, 14400, 13400);
  await page.clock.runFor(1000);
  s = await st(page);
  c("the run qualifies at the third step", s.run.qualifies && (await runs(page)).length === 1 && (await runs(page))[0].live === true && s.run.buffered === 0, JSON.stringify(s.run));
  await readScroll(page, S, 180, 60, 10, 14400, 13400);
  await settle(page);
  const tr = await trans(page), credits = ofKind(tr, "credit");
  c("13 credit transitions, no skim, pause or jump", credits.length === 13 && !tr.some((t) => /skim|pause|jump|held/.test(t.kind)), kinds(tr));
  c("each credit: 60 words in 14.4 s", credits.every((t) => within(t.adv, 60, 14) && t.dt === 14400 && t.blocked === 0), JSON.stringify(credits.slice(0, 2)));
  s = await st(page);
  const rate = s.run.words / s.run.ms * 60000;
  c("the run's rate is 250 wpm ±3 %", near(rate, 250, 3), rate.toFixed(1) + " wpm from " + s.run.words + " words in " + s.run.ms + " ms");
  const w = await wpm(page), d = await docWpm(page);
  c("global pace ≈ 250 ±12 % (G = 243)", near(w, 250, 12) && within(w, 243.2, 2), w.toFixed(1));
  c("this book's pace ≈ 250 ±12 % (B = 248)", near(d, 250, 12) && within(d, 247.7, 2), d.toFixed(1));
  const conf = await page.evaluate(() => window.llPace.confidence());
  c("confidence: a first guess over 3 min in 1 book", conf.value > 0 && conf.value < 0.2 && conf.label === "a first guess" && /^measured over 3 min of reading in 1 book · a first guess$/.test(conf.text), JSON.stringify(conf));
  c("Stats got the run's words once it qualified", (await today(page)).words === s.run.words, JSON.stringify(await today(page)));
  /* A3: twenty flicks of 250 words, 300 ms apart: one scrolled jump, nothing read */
  const wpm0 = w, runs0 = (await runs(page)).length, before = s.window;
  for (let k = 1; k <= 20; k++){ await goWord(page, S[Math.min(4999, 780 + k * 250)]); await page.clock.runFor(300); }
  await settle(page);
  const tr2 = (await trans(page)).slice(tr.length), jumps = ofKind(tr2, "jump");
  c("A3: one jump with moves ≥ 3, attributed to skimming", jumps.length === 1 && jumps[0].moves >= 3 && jumps[0].reason === "skimmed" && ofKind(tr2, "credit").length === 0, kinds(tr2) + " " + JSON.stringify(jumps[0]));
  const after = await st(page), t = await today(page);
  c("A3: skimmed = the words between the rested bottom and the landing top (≥ 3000)", jumps[0] && t.skimmed === jumps[0].skimmed && jumps[0].skimmed === after.window.top - before.bottom - 1 && jumps[0].skimmed >= 3000, t.skimmed + " vs " + (after.window.top - before.bottom - 1));
  c("A3: the pace is unchanged (Δ ≤ 0.5)", within(await wpm(page), wpm0, 0.5), (await wpm(page)).toFixed(3) + " was " + wpm0.toFixed(3));
  c("A3: the run count is unchanged (the run was already stored live)", (await runs(page)).length === runs0, String((await runs(page)).length));
  c("A3: a new empty run, phase skimming", after.run && after.run.n === 0 && after.phase === "skimming", after.phase + " n=" + (after.run && after.run.n));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A2 pages flow: a page every V/250 min", { context: desktop }, async (ctx, c, url, shared) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await openText(page, "paras.txt", TXT_PARAS);
  c("anchored in Pages flow", (await start(page)) && (await phase(page)) === "reading", await phase(page));
  const turns = await turnPages(page, 4, 250);
  const tr = await trans(page), credits = ofKind(tr, "credit");
  c("4 credits, no pause", credits.length === 4 && ofKind(tr, "pause").length === 0 && ofKind(tr, "held").length === 0, kinds(tr));
  c("each adv equals the page's V (±2) and dt the dwell", credits.every((t, i) => within(t.adv, turns[i].V, 2) && t.dt === turns[i].ms), JSON.stringify(credits.map((t, i) => [t.adv, turns[i].V, t.dt])));
  c("V is a column of 150–400 words", turns.every((t) => t.V >= 150 && t.V <= 400), JSON.stringify(turns.map((t) => t.V)));
  const s = await st(page);
  c("run.n === 4, docWpm ≈ 250 ±12 %", s.run.n === 4 && near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  shared.A2 = credits.map((t) => [t.kind, t.adv, t.dt]);
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A4 check and return: 3 000 words ahead for 20 s, then back", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = await readScroll(page, S, 0, 60, 9, 14400);
  await page.clock.runFor(14400);                   /* the ninth window is being read when the reader peeks ahead */
  await goWord(page, S[k + 3000]);
  await page.clock.runFor(20000);
  await goWord(page, S[k]);
  await settle(page);
  let tr = await trans(page);
  const jumps = ofKind(tr, "jump");
  c("two navigation jumps (one move each), nothing skimmed", jumps.length === 2 && jumps.every((j) => j.reason === "navigation" && j.moves === 1) && (await today(page)).skimmed === 0, kinds(tr));
  c("the return resumes the run", ofKind(tr, "resume").length === 1 && tr[tr.length - 1].kind === "resume", kinds(tr));
  await readScroll(page, S, k, 60, 9, 14400);
  await settle(page);
  tr = await trans(page);
  const s = await st(page), rs = await runs(page);
  c("one run at the end (live), the excursion a fragment", rs.length === 1 && rs[0].live === true && (await fragments(page)) === 1, rs.length + " runs, " + (await fragments(page)) + " fragments");
  /* the 14.4 s spent reading the ninth window before the peek are reading: the run keeps them
     and only the excursion itself is a hole */
  const expected = 10 * 14400 + 16400 + 8 * 14400;
  c("run.ms is the driven dwells only (the 20 s and the jumps are a hole)", within(s.run.ms, expected, 1000) && s.run.n === 18, s.run.ms + " vs " + expected + ", n=" + s.run.n);
  c("docWpm ≈ 250 ±12 %", near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A5 a 6-minute absence between two blocks of reading", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(360000);
  await goWord(page, S[k + 60]); k += 60;
  await settle(page);
  let tr = await trans(page);
  const last = tr[tr.length - 1];
  c("the first transition after the absence is a plain pause (10 wpm < 25, not held)", last.kind === "pause" && last.dt === 360000 && last.implied < 25 && ofKind(tr, "held").length === 0, JSON.stringify(last));
  await readScroll(page, S, k, 60, 8, 14400);
  await settle(page);
  const rs = await runs(page);
  c("two runs: one stored at the pause, one live", rs.length === 2 && !rs[0].live && rs[1].live === true, JSON.stringify(rs.map((r) => [r.w, r.ms, !!r.live])));
  c("neither run holds the six minutes", rs.every((r) => r.ms <= 8 * 14400 + 2100) && rs.every((r) => near(rateOf(r), 250, 3)), JSON.stringify(rs.map((r) => r.ms)));
  c("wpm ≈ 250 ±12 %", near(await wpm(page), 250, 12), (await wpm(page)).toFixed(1));
  c("Stats counts both blocks and the 60 pause-rejected words", (await today(page)).words === 480 + 60 + 480, JSON.stringify(await today(page)));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A6 the dictionary card open for 30 s mid-run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);                    /* a second into the fifth window the reader taps a word */
  const ms0 = (await today(page)).ms;
  await page.evaluate(() => window.llDict.defineWord("lamp"));
  await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open"), null, { timeout: 20000 });
  const blocked = await st(page);
  c("phase blocked with the card among the blockers", blocked.phase === "blocked" && blocked.blockers.indexOf("dictCard") >= 0, JSON.stringify([blocked.phase, blocked.blockers]));
  await page.clock.runFor(30000);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("dictCard").classList.contains("open"), null, { timeout: 5000 });
  c("closed: phase reading again, run kept", (await phase(page)) === "reading" && (await st(page)).run.n === 4, await phase(page));
  await page.clock.runFor(60000);
  await goWord(page, S[k + 60]);
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1];
  c("the next credit excludes the 30 s: blocked ≈ 30 000, dt = 1 s + 60 s", last.kind === "credit" && within(last.blocked, 30000, 50) && within(last.dt, 61000, 50), JSON.stringify(last));
  c("the run was not cut (n = 5)", (await st(page)).run.n === 5 && (await runs(page)).length === 1, JSON.stringify((await st(page)).run));
  c("Stats' active time grew across the card", (await today(page)).ms - ms0 >= 75000, String((await today(page)).ms - ms0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A7a read-aloud: a hard blocker, words listened, no pace", { context: desktop, stub: true }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  const n0 = (await trans(page)).length, w0 = (await today(page)).words;
  await page.evaluate(() => window.__ll.Speak.start());
  await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
  const b = await st(page);
  c("phase blocked by speak; the run closed at once", b.phase === "blocked" && b.blockers.indexOf("speak") >= 0 && b.run === null, JSON.stringify([b.phase, b.blockers, b.run]));
  const lc = await page.evaluate(() => { const l = window.llPace._debug.lastClosed(); return l && { by: l.by, n: l.run.n }; });
  c("closed by the block and stored (4 steps, 57.6 s)", lc && lc.by === "block" && lc.n === 4 && (await runs(page)).length === 1 && !(await runs(page))[0].live, JSON.stringify(lc));
  await page.clock.runFor(130000);
  const during = (await trans(page)).slice(n0), t = await today(page);
  c("no credit while it read aloud", ofKind(during, "credit").length === 0 && ofKind(during, "skim").length === 0, kinds(during));
  c("Stats: words listened, none read", t.listened > 0 && t.words === w0, JSON.stringify(t));
  await page.evaluate(() => window.__ll.Speak.stop());
  await goWord(page, S[k]);
  await settle(page);
  const s = await st(page);
  c("after stop: a fresh anchor and a new run", s.phase === "reading" && s.run && s.run.n === 0 && ofKind((await trans(page)).slice(n0), "anchor").length === 1 && ofKind((await trans(page)).slice(n0), "resume").length === 0, JSON.stringify([s.phase, s.run]));
  await readScroll(page, S, k, 60, 8, 14400);
  await settle(page);
  const rs = await runs(page);
  c("two manual runs, both at 250 wpm ±3 %; the pace comes only from them", rs.length === 2 && rs.every((r) => near(rateOf(r), 250, 3)) && near(await wpm(page), 250, 12), JSON.stringify(rs.map((r) => rateOf(r).toFixed(0))));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A7b auto-scroll: a hard blocker, words still counted for Stats", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  const n0 = (await trans(page)).length, w0 = (await today(page)).words, y0 = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.__ll.Auto.start());
  await page.waitForFunction(() => document.getElementById("autoBar").classList.contains("on"), null, { timeout: 5000 });
  const b = await st(page);
  c("phase blocked by auto; the run closed", b.phase === "blocked" && b.blockers.indexOf("auto") >= 0 && b.run === null, JSON.stringify([b.phase, b.blockers]));
  /* the fake clock drives Auto's animation frames; should it not, the movement is emulated */
  let emulated = false;
  for (let i = 0; i < 60; i++){
    await page.clock.runFor(1000);
    if (i === 4 && (await page.evaluate(() => window.scrollY)) === y0) emulated = true;
    if (emulated) await page.evaluate(() => { window.scrollBy(0, 11); window.dispatchEvent(new Event("scroll")); });
  }
  const during = (await trans(page)).slice(n0), t = await today(page);
  c("no credit during auto-scroll", ofKind(during, "credit").length === 0, kinds(during));
  c("Stats' words grew during auto-scroll (fraction-based)" + (emulated ? " [movement emulated]" : ""), t.words > w0 && t.listened === 0, JSON.stringify(t));
  await page.evaluate(() => window.__ll.Auto.stop());
  await settle(page);
  const s = await st(page), top = (await measure(page)).top, resumed = ofKind((await trans(page)).slice(n0), "resume").length === 1;
  /* auto-scroll moved the view about 210 words in a minute: within a window of where the run
     ended, so the resume rule may reopen it (the auto-scrolled words and time are a hole) */
  c("after stop: anchored where the view is" + (resumed ? " (the run before is resumed)" : " (a fresh run)"), s.phase === "reading" && s.run && s.window.top === top && (resumed ? s.run.n === 4 && s.run.ms === 57600 : s.run.n === 0), JSON.stringify([s.phase, s.run, s.window.top, top]));
  await readScroll(page, S, top - 1, 60, 8, 14400);
  await settle(page);
  const rs = await runs(page), totalMs = rs.reduce((a, r) => a + r.ms, 0), totalW = rs.reduce((a, r) => a + r.w, 0);
  c("the runs hold the manual reading only: the auto-scrolled minute is a hole", rs.length === (resumed ? 1 : 2) && totalMs >= 57600 + 8 * 14400 && totalMs <= 57600 + 8 * 14400 + 3500 && near(totalW, 720, 10) && rs.every((r) => near(rateOf(r), 250, 12)), JSON.stringify(rs.map((r) => [r.w, r.ms, rateOf(r).toFixed(0)])));
  c("no page errors", !page._errors, errorsOf(page));
});

const HIDE = () => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); };
const SHOW = () => { delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); };

scenario("A8 a tab hidden for 3 minutes mid-page", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await page.clock.runFor(40000);
  await page.evaluate(HIDE);
  const b = await st(page);
  c("hidden: phase blocked", b.phase === "blocked" && b.blockers.indexOf("hidden") >= 0, JSON.stringify([b.phase, b.blockers]));
  await page.clock.runFor(180000);
  await page.evaluate(SHOW);
  c("visible again: reading, the run kept", (await phase(page)) === "reading" && (await st(page)).run !== null, await phase(page));
  await page.clock.runFor(30000);
  await page.keyboard.press("ArrowRight");
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1];
  c("one credit: dt ≈ 70 s, blocked ≈ 180 s", last.kind === "credit" && within(last.dt, 70000, 50) && within(last.blocked, 180000, 50), JSON.stringify(last));
  c("the run continues (n = 1, one anchor)", (await st(page)).run.n === 1 && ofKind(tr, "anchor").length <= 2 && ofKind(tr, "jump").length === 0, kinds(tr));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A9a one giant paragraph: measured in both flows", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "giant.txt", TXT_GIANT);
  c("index counts 5000 words in one text node", (await page.evaluate(() => window.llPace._debug.index.words)) === 5000 && (await page.evaluate(() => window.__ll.Anchor.textNodes().length)) === 1);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 13, 14400);
  await settle(page);
  let tr = await trans(page);
  c("scroll flow: 13 credits, pace ±12 %", ofKind(tr, "credit").length === 13 && near(await docWpm(page), 250, 12), kinds(tr) + " " + (await docWpm(page)).toFixed(1));
  c("the window measures (never null)", (await measure(page)) !== null);
  await page.keyboard.press("p");
  await settle(page);
  const n0 = (await trans(page)).length, tr1 = await trans(page);
  c("the flow switch lands still or back", /^(still|back)$/.test(tr1[tr1.length - 1].kind), tr1[tr1.length - 1].kind);
  /* the first page holds words already read above the old top: the reader reads on from there */
  const first = await page.evaluate(() => { const m = window.llPace._debug.measure(), l = window.llPace._debug.live(); return { V: m.V, fresh: m.top + m.V - Math.max(l.frontier, m.top) }; });
  await page.clock.runFor(Math.round(first.fresh / 250 * 60000));
  await page.keyboard.press("ArrowRight");
  const turns = [first].concat(await turnPages(page, 2, 250));
  tr = (await trans(page)).slice(n0);
  c("pages flow: 3 credits, adv = V ±2, one continuous run", ofKind(tr, "credit").length === 3 && ofKind(tr, "credit").every((t, i) => within(t.adv, turns[i].V, 2)) && ofKind(tr, "anchor").length === 0 && (await runs(page)).length === 1, kinds(tr));
  c("pace still ±12 % of 250", near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A9b one-sentence paragraphs (Markdown): measured", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "tiny.md", MD_TINY, "text/markdown");
  const ix = await page.evaluate(() => ({ words: window.llPace._debug.index.words, count: (document.getElementById("doc").textContent.match(/\S+/g) || []).length, nodes: window.__ll.Anchor.textNodes().length }));
  c("index words equal the text's tokens, hundreds of paragraphs", ix.words === ix.count && ix.words >= 4900 && ix.nodes > 300, JSON.stringify(ix));
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 13, 14400);
  await settle(page);
  const tr = await trans(page), probes = await page.evaluate(() => ({ f: window.llPace._debug.probeFallbacks, m: window.llPace._debug.measurements }));
  c("13 credits, pace ±12 %", ofKind(tr, "credit").length === 13 && near(await docWpm(page), 250, 12), kinds(tr) + " " + (await docWpm(page)).toFixed(1));
  c("the bottom probe rarely falls back (≤ 20 % of measurements)", probes.f / Math.max(1, probes.m) <= 0.2, JSON.stringify(probes));
  c("no page errors", !page._errors, errorsOf(page));
});

const goPdfPage = (page, n) => page.evaluate((n) => { window.__ll.Toc.goPdfPage(n); window.dispatchEvent(new Event("scroll")); }, n);

scenario("A10 PDF: page turns at 40 s, then a flip-through", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openPdf(page);
  c("anchored on page 1, V = 1", (await start(page)) && (await phase(page)) === "reading" && (await st(page)).window.top === 1, JSON.stringify(await st(page)));
  for (let n = 2; n <= 5; n++){ await page.clock.runFor(40000); await goPdfPage(page, n); }
  await settle(page);
  const tr = await trans(page), credits = ofKind(tr, "credit"), s = await st(page);
  c("4 credits of one page in 40 s", credits.length === 4 && credits.every((t) => t.adv === 1 && t.dt === 40000), kinds(tr));
  c("run: 4 pages in 160 s, qualifying", s.run.pages === 4 && s.run.ms === 160000 && s.run.qualifies, JSON.stringify(s.run));
  const ppm = await page.evaluate(() => window.llPace.docPpm()), g = await page.evaluate(() => window.llPace.ppm());
  c("docPpm = 1.389 (within 15 % of 1.5), global 1.167", within(ppm, 1.389, 0.02) && near(ppm, 1.5, 15) && within(g, 1.167, 0.02), ppm.toFixed(3) + " / " + g.toFixed(3));
  await waitReady(page, null).catch(() => null);
  for (let i = 0; i < 20 && Object.keys(await page.evaluate(() => window.llPace._debug.pageWords())).length < 5; i++){ await page.clock.runFor(200); await page.waitForTimeout(50); }
  const pw = await page.evaluate(() => window.llPace._debug.pageWords());
  c("every page's words are known", Object.keys(pw).length === 5, JSON.stringify(pw));
  const n0 = (await trans(page)).length, sk0 = (await today(page)).skimmed;
  await goPdfPage(page, 1);
  await settle(page);
  const back = (await trans(page)).slice(n0);
  c("back to page 1: a navigation jump, the run stored", back.some((t) => t.kind === "jump" && t.reason === "navigation") && (await runs(page)).length === 1, kinds(back));
  const n1 = (await trans(page)).length;
  for (let n = 2; n <= 5; n++){ await goPdfPage(page, n); await page.clock.runFor(600); }
  await settle(page);
  const flip = (await trans(page)).slice(n1), j = ofKind(flip, "jump")[0];
  /* the flip-through crosses pages this reader has already read: nothing is credited, and nothing
     is skimmed either — they are not skipping text, they are going back to where they were */
  c("the flip-through is one jump of 4 moves, nothing credited", !!j && j.moves === 4 && ofKind(flip, "credit").length === 0, kinds(flip) + " " + JSON.stringify(j));
  c("pages already read are not skimmed again", j && j.reason === "navigation" && j.skimmed === 0 && (await today(page)).skimmed === sk0, JSON.stringify([j && j.reason, j && j.skimmed]));
  c("docPpm unchanged (Δ ≤ 0.01)", within(await page.evaluate(() => window.llPace.docPpm()), ppm, 0.01), String(await page.evaluate(() => window.llPace.docPpm())));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A11 re-reading a few lines, then a chapter back", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(1000);
  const T1 = (await measure(page)).top;
  await goWord(page, S[k - 30]);
  await page.clock.runFor(20000);
  const T2 = (await measure(page)).top;
  await goWord(page, S[k + 60]);
  await settle(page);
  const T3 = (await measure(page)).top, tr = await trans(page), back = tr[tr.length - 2], cr = tr[tr.length - 1];
  c("30 words back: a back-small with its time, no words", back.kind === "back" && back.adv === T2 - T1 && within(back.adv, -30, 3) && back.dt === 1000 && back.credit === undefined, JSON.stringify(back));
  c("90 forward: adv 90, credit 60 (only beyond the frontier), dt 20 s", cr.kind === "credit" && cr.adv === T3 - T2 && cr.credit === T3 - T1 && cr.adv === 90 && cr.credit === 60 && cr.dt === 20000, JSON.stringify(cr));
  const s = await st(page);
  c("run words = net advance (540), time = every dwell", s.run.words === 540 && s.run.ms === 8 * 14400 + 1000 + 20000, JSON.stringify(s.run));
  await goWord(page, S[k + 60 - 2000]);
  await settle(page);
  const last = (await trans(page)).slice(-2), rs = await runs(page), lc = await page.evaluate(() => window.llPace._debug.lastClosed());
  c("2 000 words back: a jump; the run stored; a new run anchored", last.some((t) => t.kind === "jump") && rs.length === 1 && !rs[0].live && lc && lc.by === "jump" && (await st(page)).run.n === 0, kinds(last) + " " + JSON.stringify(rs.map((r) => r.w)));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A12 two books, a reload, and a reset", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  const idA = await page.evaluate(() => window.__ll.Library.currentId());
  c("the id is the file's sha-256", idA === sha256hex(TXT_PARAS), idA);
  await start(page);
  const SA = await starts(page);
  await readScroll(page, SA, 0, 72, 41, 14400);
  await settle(page);
  let rs = await runs(page);
  c("book A: one live run of ≈ 2952 words at 300 wpm", rs.length === 1 && within(rs[0].w, 2952, 30) && near(rateOf(rs[0]), 300, 2), JSON.stringify(rs.map((r) => [r.w, r.ms])));
  const wA0 = await wpm(page);
  c("global ≈ 292 = (92 000 + 2952·300) / 3352", within(wA0, globalOf(rs), 1) && within(wA0, 291.6, 5), wA0.toFixed(1));
  await openText(page, "other.txt", TXT_OTHER);
  const idB = await page.evaluate(() => window.__ll.Library.currentId());
  await page.evaluate(() => window.llPace._debug.anchorNow());
  c("book B before reading: its pace is the global one", idB !== idA && within(await docWpm(page), await wpm(page), 0.001) && within(await wpm(page), wA0, 1), (await docWpm(page)).toFixed(1));
  const SB = await starts(page);
  await readScroll(page, SB, 0, 43, 20, 14400);
  await settle(page);
  rs = await runs(page);
  const expG = globalOf(rs), expB = bookOf(rs, idB), expA = bookOf(rs, idA);
  c("two runs: A stored, B live (860 words at 179 wpm)", rs.length === 2 && rs[0].b === idA && rs[1].b === idB && rs[1].live && within(rs[1].w, 860, 20) && near(rateOf(rs[1]), 179.2, 2), JSON.stringify(rs.map((r) => [r.b.slice(0, 6), r.w, r.ms])));
  c("global ≈ 269 (interpolated weighted median 273, blended with the prior)", within(await wpm(page), expG, 1) && within(await wpm(page), 268.6, 5), (await wpm(page)).toFixed(1) + " vs " + expG.toFixed(1));
  c("book B ≈ 208", within(await docWpm(page), expB, 1) && within(await docWpm(page), 207.4, 5), (await docWpm(page)).toFixed(1) + " vs " + expB.toFixed(1));
  await page.keyboard.press("Control+Tab");
  await waitReady(page, idA);
  await page.evaluate(() => window.llPace._debug.anchorNow());
  c("back in book A via the tabs: A ≈ 296", within(await docWpm(page), expA, 1) && within(await docWpm(page), 296.3, 5), (await docWpm(page)).toFixed(1) + " vs " + expA.toFixed(1));
  const conf = await page.evaluate(() => window.llPace.confidence());
  c("confidence over 14 min in 2 books: an early estimate", conf.runs === 2 && conf.minutes === 14 && conf.books === 2 && /^measured over 14 min of reading in 2 books · an early estimate$/.test(conf.text), JSON.stringify(conf));
  await page.reload({ waitUntil: "load" });
  rs = await runs(page);
  c("after a reload: two stored runs, the same global", rs.length === 2 && rs.every((r) => !r.live) && within(await wpm(page), expG, 1), JSON.stringify(rs.map((r) => [r.w, r.ms])) + " " + (await wpm(page)).toFixed(1));
  await page.evaluate((id) => window.__ll.Library.openId(id), idA);
  await waitReady(page, idA);
  c("book A reopened from the library: ≈ 296 again", within(await docWpm(page), expA, 1), (await docWpm(page)).toFixed(1));
  await page.keyboard.press("g");
  await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && /Average speed/.test(document.getElementById("sideBody").innerText), null, { timeout: 5000 });
  let text = await page.$eval("#sideBody", (b) => b.innerText);
  c("the panel: Average speed " + Math.round(expG) + ", This document " + Math.round(expA) + " over 9 min, the confidence line", text.indexOf("Average speed\n" + Math.round(expG) + " words per minute") >= 0 && text.indexOf("This document\n" + Math.round(expA) + " words per minute over 9 min") >= 0 && /measured over 14 min of reading in 2 books · an early estimate/.test(text), text.replace(/\n/g, " | ").slice(-400));
  page.once("dialog", (d) => d.accept());
  await page.click('#sideFoot [data-st="reset"]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ runs: window.llPace.runs().length, wpm: window.llPace.wpm(), ppm: window.llPace.ppm(), conf: window.llPace.confidence(), keys: ["ll_pace", "ll_wpm", "ll_ppm"].map((k) => localStorage.getItem(k)) }));
  text = await page.$eval("#sideBody", (b) => b.innerText);
  c("after the reset: no runs, the prior (230 / 0.5), confidence 0 'not measured yet'", after.runs === 0 && after.wpm === 230 && after.ppm === 0.5 && after.conf.value === 0 && after.conf.label === "not measured yet", JSON.stringify(after));
  c("the panel says so, and nothing is left in storage", /Average speed\n230 words per minute/.test(text) && /not measured yet, using a typical 230 words per minute/.test(text) && !/This document/.test(text) && after.keys.every((k) => k === null), JSON.stringify(after.keys) + " " + text.replace(/\n/g, " | ").slice(-200));
  await page.keyboard.press("Escape");
  await settle(page);
  c("the detector re-anchored on the open book", (await phase(page)) === "reading" && (await st(page)).run.n === 0, await phase(page));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("A13 time left, About, auto-scroll and the panel follow the book's pace", { context: desktop }, async (ctx, c, url) => {
  const idA = sha256hex(TXT_PARAS), idB = sha256hex(TXT_OTHER), t = T0.getTime();
  const A = { b: idA, t: t - 3600000, w: 2952, ms: 590400, p: 0, n: 41, k: "w" }, B = { b: idB, t: t - 1800000, w: 860, ms: 288000, p: 0, n: 20, k: "w" };
  await seed(ctx, url, "ll_pace", { v: 1, runs: [A, B], books: {}, live: null });
  const page = await openPage(ctx, url);
  await page.setInputFiles("#fileInput", [{ name: "paras.txt", mimeType: "text/plain", buffer: Buffer.from(TXT_PARAS, "utf8") }, { name: "other.txt", mimeType: "text/plain", buffer: Buffer.from(TXT_OTHER, "utf8") }]);
  await waitReady(page, idA);
  await start(page);
  const expA = bookOf([A, B], idA), expB = bookOf([A, B], idB);
  const pxA = await page.evaluate(() => window.__ll.Auto.pxPerSec()), dA = await docWpm(page);
  c("book A open: docWpm ≈ 296", within(dA, expA, 1), dA.toFixed(1));
  await page.click('#tabs .tab[data-id="' + idB + '"]');
  await waitReady(page, idB);
  await page.evaluate(() => window.llPace._debug.anchorNow());
  const pxB = await page.evaluate(() => window.__ll.Auto.pxPerSec()), dB = await docWpm(page);
  c("book B open: docWpm ≈ 208", within(dB, expB, 1), dB.toFixed(1));
  c("Auto.pxPerSec scales with the book's pace (ratio ±10 %)", near(pxB / pxA, dB / dA, 10), (pxB / pxA).toFixed(3) + " vs " + (dB / dA).toFixed(3));
  const S = await starts(page);
  await goWord(page, S[300]);
  const pill = await page.evaluate(() => ({ text: document.getElementById("progressInfo").textContent, on: document.getElementById("progressInfo").classList.contains("on"), frac: (() => { const h = document.documentElement; return h.scrollTop / (h.scrollHeight - h.clientHeight); })(), words: window.__ll.Progress.docWords() }));
  const m = /^(\d+)% · (\d+) min left$/.exec(pill.text), expectMin = (1 - pill.frac) * pill.words / dB;
  c("#progressInfo: 'NN% · M min left' from this book's pace (±1 min)", pill.on && !!m && within(+m[2], expectMin, 1) && pill.words === 5000, pill.text + " expected " + expectMin.toFixed(1));
  await page.keyboard.press("i");
  await page.waitForFunction(() => document.querySelector("#sideBody .about-tile"), null, { timeout: 30000 });
  const tile = await page.evaluate(() => { let v = ""; document.querySelectorAll("#sideBody .about-tile").forEach((t) => { if (t.querySelector("span").textContent === "Reading time at your speed") v = t.querySelector("b").textContent; }); return v; });
  const tm = /^about (\d+) min$/.exec(tile);
  c("About: 'Reading time at your speed' ≈ words / docWpm (±1 min)", !!tm && within(+tm[1], 5000 / dB, 1), tile + " expected " + (5000 / dB).toFixed(1));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.keyboard.press("g");
  await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && /Average speed/.test(document.getElementById("sideBody").innerText), null, { timeout: 5000 });
  const text = await page.$eval("#sideBody", (b) => b.innerText);
  c("Stats panel: Average speed, This document, measured over … in 2 books", /Average speed\n\d+ words per minute/.test(text) && /This document\n208 words per minute over 4 min/.test(text) && /measured over 14 min of reading in 2 books/.test(text), text.replace(/\n/g, " | ").slice(-300));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== B. movement mechanics ============================== */

scenario("B1 a wheel gesture of three scroll events is one step", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 3, 14400);
  await page.clock.runFor(20000);
  for (let i = 1; i <= 3; i++){ await goWord(page, S[k + i * 20]); if (i < 3) await page.clock.runFor(150); }
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1];
  c("exactly one credit: adv 60, dt 20.3 s (the time of the last scroll event), 3 moves", last.kind === "credit" && last.adv === 60 && within(last.dt, 20300, 50) && last.moves === 3 && ofKind(tr, "credit").length === 4, JSON.stringify(last));
  c("no skim, streak 0", (await st(page)).skimStreak === 0 && ofKind(tr, "skim").length === 0, kinds(tr));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("B2 fast small nudges are deferred into the next step", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 3, 14400);        /* 40 s of reading, then a step */
  await page.clock.runFor(1000);
  /* the top probe reads the first word of the line a target falls in, so a nudge's measured size
     is up to a line short of the words asked for: 40 words in a second is fast either way */
  const top0 = (await measure(page)).top;
  await goWord(page, S[k + 40]);
  const top1 = (await measure(page)).top;
  await page.clock.runFor(1000);
  await goWord(page, S[k + 80]);
  const top2 = (await measure(page)).top;
  await page.clock.runFor(60000);
  await goWord(page, S[k + 140]);
  await settle(page);
  const top3 = (await measure(page)).top, tr = await trans(page), defers = ofKind(tr, "defer"), last = tr[tr.length - 1];
  c("the two nudges are deferred (above 1200 wpm, under half a window)", defers.length === 2 && defers[0].adv === top1 - top0 && defers[1].adv === top2 - top0 && defers.every((d) => d.implied > 1200 && d.adv < 0.5 * d.V), JSON.stringify(defers));
  c("the following credit carries them: adv from the origin, dt 62 s", last.kind === "credit" && last.adv === top3 - top0 && last.credit === top3 - top0 && last.dt === 62000, JSON.stringify(last));
  c("run words = the net advance, nothing skimmed", (await st(page)).run.words === top3 - 1 && (await today(page)).skimmed === 0, JSON.stringify((await st(page)).run));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("B3 a peek inside one burst nets to still", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(60000);
  const n0 = (await trans(page)).length, run0 = (await st(page)).run;
  await goWord(page, S[k + 1500]);
  await page.clock.runFor(600);                                 /* inside the settle window */
  await goWord(page, S[k]);
  await settle(page);
  const tr = (await trans(page)).slice(n0);
  c("one still, no jump", tr.length === 1 && tr[0].kind === "still" && tr[0].moves === 2, kinds(tr));
  c("nothing skimmed, the run unchanged", (await today(page)).skimmed === 0 && JSON.stringify((await st(page)).run) === JSON.stringify(run0), JSON.stringify((await st(page)).run));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("B4 keyboard auto-repeat through ten pages is one skimmed jump", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await turnPages(page, 2, 250);
  const V = (await measure(page)).V, w0 = (await st(page)).run.words;
  await page.clock.runFor(30000);
  for (let i = 0; i < 10; i++){ await page.keyboard.press("ArrowRight"); await page.clock.runFor(150); }
  await settle(page);
  const tr = await trans(page), j = tr[tr.length - 1], t = await today(page);
  c("one jump with 10 moves, attributed to skimming", j.kind === "jump" && j.moves === 10 && j.reason === "skimmed", JSON.stringify(j));
  c("skimmed ≥ 8 pages of words, nothing credited, the dwell before it uncredited", j.skimmed >= 8 * V && t.skimmed === j.skimmed && ofKind(tr, "credit").length === 2 && (await runs(page)).reduce((a, r) => a + r.w, 0) === w0, JSON.stringify([j.skimmed, V, t.skimmed]));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("B5 phone line-scroller: 25 words every 6 s, a fling and a return", { context: phone }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const V = (await measure(page)).V;
  c("V ≈ 100–150 words on a phone", V >= 70 && V <= 160, String(V));
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 25, 60, 6000);
  await settle(page);
  let tr = await trans(page), s = await st(page);
  c("60 credited steps, no jump or skim (the transition list keeps the last 50)", s.run.n === 60 && ofKind(tr, "credit").length === 50 && !tr.some((t) => /jump|skim|pause/.test(t.kind)), JSON.stringify(s.run) + " " + kinds(tr).slice(-60));
  c("pace ±12 % of 250", near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  const n0 = tr.length, top0 = (await measure(page)).top;
  await page.clock.runFor(6000);
  await goWord(page, S[k + 250]);
  await page.clock.runFor(60000);
  await goWord(page, S[k]);
  await settle(page);
  tr = (await trans(page)).slice(n0 - 50);
  const jumps = ofKind(tr, "jump");
  c("the fling is a navigation jump (one move), the return resumes", jumps.length === 2 && jumps.every((j) => j.moves === 1 && j.reason === "navigation") && tr[tr.length - 1].kind === "resume" && within((await measure(page)).top, top0, V), kinds(tr.slice(-4)) + " " + JSON.stringify(jumps));
  await readScroll(page, S, k, 25, 3, 6000);
  await settle(page);
  c("one run at the end", (await runs(page)).length === 1 && (await runs(page))[0].live === true && (await runs(page))[0].n === 63, JSON.stringify((await runs(page)).map((r) => [r.w, r.ms, r.n])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("B6 a screen pager: five wheel notches per window", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = 0;
  for (let n = 0; n < 5; n++){
    const V = (await measure(page)).V, notch = Math.floor(V / 5);
    await page.clock.runFor(Math.round(V / 250 * 60000));
    for (let i = 1; i <= 5; i++){ await goWord(page, S[k + i * notch]); if (i < 5) await page.clock.runFor(80); }
    k += 5 * notch;
  }
  await settle(page);
  const tr = await trans(page), credits = ofKind(tr, "credit");
  c("one credit per burst, five moves each, adv ≈ V", credits.length === 5 && credits.every((t) => t.moves === 5 && within(t.adv, t.V, 20)), JSON.stringify(credits.map((t) => [t.adv, t.V, t.moves])));
  c("no transition above 1200 wpm, pace ±12 %", tr.every((t) => t.implied === undefined || t.implied <= 1200) && near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== C. plausibility ============================== */

scenario("C1 one glanced window inside a run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = await readScroll(page, S, 0, 60, 8, 14400);
  const V = (await measure(page)).V;
  await page.clock.runFor(60000);
  await goWord(page, S[k + V]); k += V;
  await page.clock.runFor(2500);
  await goWord(page, S[k + V]); k += V;
  await settle(page);
  let tr = await trans(page);
  c("the first flick after a real dwell is credited, the second is a skim", tr[tr.length - 2].kind === "credit" && tr[tr.length - 2].dt === 60000 && tr[tr.length - 1].kind === "skim" && tr[tr.length - 1].dt === 2500, kinds(tr.slice(-3)));
  c("skimStreak 1, the run kept open, skimmed ≈ V (±12)", (await st(page)).skimStreak === 1 && (await st(page)).run.n === 9 && within((await today(page)).skimmed, V, 12), JSON.stringify([(await st(page)).skimStreak, (await today(page)).skimmed, V]));
  await readScroll(page, S, k, 60, 8, 14400);
  await settle(page);
  const rs = await runs(page);
  c("one run, its rate ≈ 250 ±12 %, streak back to 0", rs.length === 1 && near(rateOf(rs[0]), 250, 12) && (await st(page)).skimStreak === 0, JSON.stringify(rs.map((r) => [r.w, r.ms, rateOf(r).toFixed(0)])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C2 a sustained skim, then reading", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = 0, phases = [], Vs = [];
  await page.clock.runFor(60000);
  for (let i = 0; i < 5; i++){ const V = (await measure(page)).V; Vs.push(V); await goWord(page, S[k + V]); k += V; await page.clock.runFor(2000); phases.push(await phase(page)); }
  await settle(page);
  let tr = await trans(page), skims = ofKind(tr, "skim"), sumV = Vs.slice(1).reduce((a, v) => a + v, 0);
  c("the first flick credited, four skims", ofKind(tr, "credit").length === 1 && skims.length === 4, kinds(tr));
  c("phase skimming from the second flick on", phases[1] === "skimming" && phases[4] === "skimming", JSON.stringify(phases));
  c("skimmed ≈ the four windows (each ±12)", skims.every((s, i) => within(s.skimmed, Vs[i + 1], 12)) && within((await today(page)).skimmed, sumV, 48), JSON.stringify([(await today(page)).skimmed, sumV, Vs]));
  c("the run before was cut at the second skim (a fragment: one step)", (await runs(page)).length === 0 && (await fragments(page)) >= 1 && (await st(page)).run.n === 0, JSON.stringify((await st(page)).run));
  await readScroll(page, S, k, 60, 12, 14400);
  await settle(page);
  const rs = await runs(page);
  c("exactly one qualifying run afterwards, no flick in it", rs.length === 1 && rs[0].live && rs[0].n === 12 && near(rateOf(rs[0]), 250, 3) && (await phase(page)) === "reading", JSON.stringify(rs.map((r) => [r.w, r.ms, r.n])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C3 a fast real reader at 700 wpm in Pages flow", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await turnPages(page, 8, 700);
  const tr = await trans(page);
  c("8 credits, no skim (700 < 1200)", ofKind(tr, "credit").length === 8 && ofKind(tr, "skim").length === 0 && ofKind(tr, "jump").length === 0, kinds(tr));
  const rs = await runs(page);
  c("the run's rate ≈ 700 ±3 %, the book's pace ±12 %", rs.length === 1 && near(rateOf(rs[0]), 700, 3) && near(await docWpm(page), 700, 12), rateOf(rs[0]).toFixed(0) + " / " + (await docWpm(page)).toFixed(0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C4 a slow reader at 90 wpm: no sample dropped", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const turns = await turnPages(page, 4, 90);
  const tr = await trans(page);
  c("4 credits of 140–170 s each, no pause", ofKind(tr, "credit").length === 4 && ofKind(tr, "pause").length === 0 && ofKind(tr, "held").length === 0 && turns.every((t) => t.ms > 120000 && t.ms < 200000), kinds(tr) + " " + JSON.stringify(turns.map((t) => t.ms)));
  const conf = await page.evaluate(() => window.llPace.confidence()), rs = await runs(page);
  c("the run's rate is 90 wpm ±3 %; the confidence text names the minutes", rs.length === 1 && near(rateOf(rs[0]), 90, 3) && /^measured over (9|10) min of reading in 1 book/.test(conf.text), rateOf(rs[0]).toFixed(1) + " | " + conf.text);
  /* the prior still weighs on a slow reader after four pages: the estimate is the blend the
     spec defines (about 104 for 880 words at 90), on its way down to 90 */
  c("the book's estimate is the prior-blended value, below 110", within(await docWpm(page), bookOf(rs, rs[0].b), 1) && (await docWpm(page)) < 110, (await docWpm(page)).toFixed(1) + " vs " + bookOf(rs, rs[0].b).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C5 very slow reading: held three times, then admitted", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const w0 = (await today(page)).words;
  const kindsSeen = [];
  let sumV = 0;
  for (let i = 0; i < 5; i++){
    sumV += (await measure(page)).V;
    await page.clock.runFor(330000);
    if (i === 2) c("phase paused from the heartbeat during an over-cap dwell", (await phase(page)) === "paused", await phase(page));
    await page.keyboard.press("ArrowRight");
    await settle(page);
    kindsSeen.push((await trans(page)).slice(-2).map((t) => t.kind).join("+"));
  }
  const tr = await trans(page), s = await st(page), t = await today(page);
  c("turns 1–3 held, the third admits, turns 4–5 credited directly (the cap is 600 s once slow)", ofKind(tr, "held").length === 3 && ofKind(tr, "admit").length === 1 && kindsSeen[2] === "held+admit" && kindsSeen[3] === "admit+credit" && kindsSeen[4] === "credit+credit", JSON.stringify(kindsSeen));
  c("run.slow, five pages of words, rate ≈ 40 ±15 %", s.run.slow === true && s.run.n === 5 && within(s.run.words, sumV, 10) && near(s.run.words / s.run.ms * 60000, 40, 15), JSON.stringify(s.run) + " ΣV=" + sumV);
  c("Stats' words arrived at admission", t.words - w0 === s.run.words, JSON.stringify([t.words - w0, s.run.words]));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C6 a think shorter than the cap stays inside the run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(45000);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300 })));
  await page.clock.runFor(45000);
  await goWord(page, S[k + 60]);
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1];
  c("the 90 s are inside the run: a credit with dt 90 s, no pause", last.kind === "credit" && last.dt === 90000 && ofKind(tr, "pause").length === 0, JSON.stringify(last));
  const rs = await runs(page);
  c("the rate is lowered accordingly (540 words in 205.2 s = 158 wpm)", rs.length === 1 && rs[0].ms === 8 * 14400 + 90000 && near(rateOf(rs[0]), 540 / 205.2 * 60, 2), JSON.stringify(rs.map((r) => [r.w, r.ms])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C7 present but not reading: the input cap, then a plain pause", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 8, 14400);
  const phases = {};
  const V = (await st(page)).window.V;
  for (let i = 1; i <= 16; i++){
    await page.clock.runFor(30000);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 400 })));
    if (i === 8 || i === 10 || i === 15) phases[i * 30] = await phase(page);
  }
  /* the words on screen (about 250) bound the dwell at V / 60 wpm ≈ 250 s; the 420 s input cap
     only bounds that */
  c("reading at 4 min, paused from the heartbeat once the window's dwell limit (" + V + " s) is passed", phases[240] === "reading" && phases[300] === "paused" && phases[450] === "paused" && V > 240, JSON.stringify(phases));
  const w0 = (await today(page)).words;
  await goWord(page, S[k + 60]);
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1], s = await st(page), rs = await runs(page);
  c("the step is a plain pause (7.5 wpm < 25), not held", last.kind === "pause" && last.dt === 480000 && last.implied < 25 && ofKind(tr, "held").length === 0, JSON.stringify(last));
  c("the run was closed and stored, a new one anchored at the step's end", rs.length === 1 && !rs[0].live && rs[0].n === 8 && s.run.n === 0 && s.window.top === k + 61, JSON.stringify([rs.map((r) => r.n), s.run, s.window.top]));
  c("Stats: the 60 pause-rejected words are read words", (await today(page)).words - w0 === 60, String((await today(page)).words - w0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C8 an image-heavy window: the dwell cap floors at 30 s", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "figure.html", HTML_IMG, "text/html");
  await start(page);
  const S = await starts(page), img = await page.evaluate(() => { const i = document.querySelector("#doc img"); return i ? Math.round(i.getBoundingClientRect().height) : 0; });
  c("the image is a tall block in the text", img >= 500, String(img));
  const k = await readScroll(page, S, 2160, 60, 3, 14400);          /* paragraphs 37–40 */
  await page.clock.runFor(14400);
  /* the reader scrolls until the caption under the image is at the foot of the screen: a line or
     two of paragraph 40 at the top, the image, the caption */
  await page.evaluate(() => { const cap = document.querySelector("#doc img").nextElementSibling.getBoundingClientRect(); window.scrollTo(0, cap.top + window.scrollY - (window.innerHeight - 40)); window.dispatchEvent(new Event("scroll")); });
  await settle(page);
  const win = (await st(page)).window, cap = Math.max(30, Math.min(270, win.V)) * 1000;
  c("the window is a line or two and the caption (V < 80)", win.V < 80 && win.V >= 10, JSON.stringify(win));
  await page.clock.runFor(60000);
  await goWord(page, S[2420]);                                    /* on past the caption: the first word after it */
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1], w0 = (await today(page)).words;
  /* forty-odd words in a minute is over the window's cap yet above 25 wpm: held, a pause unless
     two more dwells like it follow */
  c("a 62 s dwell there (2 s settle + 60 s) is cut once the cap (" + cap / 1000 + " s) is passed: held" + (60000 > cap ? "" : " [V too large for the cut: credited]"), 60000 > cap ? /^(held|pause)$/.test(last.kind) && last.dt === 62000 : last.kind === "credit", JSON.stringify(last));
  await readScroll(page, S, 2420, 60, 8, 14400);
  await settle(page);
  const rs = await runs(page);
  /* the run before ends with the short step onto the caption line, so its rate sits a little
     under the driven 250; the run after is the reading pace */
  c("the runs before and after are kept, the pace from text; the held words went to Stats", rs.length === (60000 > cap ? 2 : 1) && rateOf(rs[0]) >= 150 && near(rateOf(rs[rs.length - 1]), 250, 12) && (await today(page)).words - w0 === 480 + (60000 > cap ? last.adv : 0), JSON.stringify(rs.map((r) => [r.w, r.ms, rateOf(r).toFixed(0)])) + " Δwords " + ((await today(page)).words - w0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("C9 a dense passage read slowly inside a normal run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = await readScroll(page, S, 0, 60, 12, 14400), totalMs = 12 * 14400, totalW = 720;
  for (let i = 0; i < 4; i++){ const V = (await measure(page)).V, ms = Math.round(V / 70 * 60000); await page.clock.runFor(ms); await goWord(page, S[k + V]); k += V; totalMs += ms; totalW += V; }
  await readScroll(page, S, k, 60, 12, 14400); totalMs += 12 * 14400; totalW += 720;
  await settle(page);
  const tr = await trans(page), rs = await runs(page);
  c("28 credits, all below the cap, one run", ofKind(tr, "credit").length === 28 && ofKind(tr, "pause").length === 0 && ofKind(tr, "held").length === 0 && rs.length === 1, kinds(tr).replace(/credit /g, "c ").slice(-80));
  c("the rate is total words / total time ±3 %", rs[0].ms === totalMs && near(rateOf(rs[0]), totalW / totalMs * 60000, 3), rateOf(rs[0]).toFixed(1) + " vs " + (totalW / totalMs * 60000).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== D. re-reading, excursions, navigation ============================== */

scenario("D1 re-reading a page: words credited once, time always", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  let driven = 0, Vs = [];
  for (let i = 0; i < 3; i++){
    const V = (await measure(page)).V, ms = Math.round(V / 250 * 60000);
    await page.clock.runFor(ms); await page.keyboard.press("ArrowRight");      /* a new page: credit V */
    await page.clock.runFor(1000); await page.keyboard.press("ArrowLeft");      /* back a page: time only */
    await page.clock.runFor(20000); await page.keyboard.press("ArrowRight");    /* forward again: nothing new */
    driven += ms + 1000 + 20000; Vs.push(V);
  }
  await settle(page);
  const tr = await trans(page), credits = ofKind(tr, "credit"), backs = ofKind(tr, "back"), s = await st(page);
  c("three credited turns with credit = V, three re-turns with credit 0, three peek backs", credits.length === 6 && credits.filter((t) => t.credit > 0).length === 3 && credits.filter((t) => t.credit === 0).every((t) => t.adv > 0) && backs.length === 3 && backs.every((t) => t.reason === "peek" && t.dt === 0), JSON.stringify(credits.map((t) => [t.adv, t.credit])));
  /* the glance at the next page and straight back is a peek: its one second is a hole, every
     other second of the three pages is in the run */
  c("each page's words once, all the dwell time", within(s.run.words, Vs.reduce((a, v) => a + v, 0), 6) && s.run.ms === driven - 3000, JSON.stringify([s.run.words, Vs, s.run.ms, driven]));
  const fronts = await page.evaluate(() => window.llPace._debug.live().frontier);
  c("the frontier never decreased: it is the last new page's end", fronts === s.window.top, String(fronts) + " vs " + s.window.top);
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("D2 a footnote hop of 12 s", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(5000);
  const n0 = (await trans(page)).length;
  await goWord(page, S[k + 2500]);
  await page.clock.runFor(12000);
  await goWord(page, S[k]);
  await settle(page);
  const hop = (await trans(page)).slice(n0);
  c("jump (navigation), jump back, resume", kinds(hop) === "jump jump resume" && hop.every((t) => t.kind !== "jump" || t.reason === "navigation"), kinds(hop));
  await readScroll(page, S, k, 60, 1, 14400);
  await settle(page);
  const last = (await trans(page)).slice(-1)[0], rs = await runs(page);
  /* the hop itself is a hole; the 5 s spent reading before it and the 2 s + 14.4 s after are not */
  c("the next credit's time is the reading around the hop: 5 s + 2 s + 14.4 s", last.kind === "credit" && last.dt === 21400 && last.blocked === 12000 && last.adv === 60, JSON.stringify(last));
  c("one run, 9 steps, no fragment stored", rs.length === 1 && rs[0].live && rs[0].n === 9 && rs[0].ms === 8 * 14400 + 21400, JSON.stringify(rs.map((r) => [r.n, r.ms])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("D3 three search hits with the panel open, then reading at the last one", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(5000);
  const n0 = (await trans(page)).length, frag0 = await fragments(page);
  await page.keyboard.press("/");
  await page.waitForFunction(() => !!document.getElementById("findInput"), null, { timeout: 5000 });
  await page.type("#findInput", "garden");
  await settle(page, 400);
  await page.waitForFunction(() => /\d+ matches/.test(document.getElementById("findStatus").textContent), null, { timeout: 10000 });
  const moves0 = (await st(page)).moves;
  for (let i = 0; i < 3; i++){ await page.clock.runFor(10000); await page.keyboard.press("Enter"); }
  const during = await st(page);
  c("while the panel is open: blocked, the hits counted as moves", during.phase === "blocked" && during.blockers.indexOf("side") >= 0 && during.moves > moves0, JSON.stringify([during.phase, during.blockers, during.moves]));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("side").classList.contains("open"), null, { timeout: 5000 });
  await settle(page);
  const after = (await trans(page)).slice(n0);
  c("on close: one navigation jump, nothing skimmed", ofKind(after, "jump").length === 1 && ofKind(after, "jump")[0].reason === "navigation" && (await today(page)).skimmed === 0 && ofKind(after, "credit").length === 0, kinds(after));
  c("the run before is stored; no fragment", (await runs(page)).length === 1 && (await fragments(page)) === frag0, String(await fragments(page)));
  const top = (await measure(page)).top;
  await readScroll(page, S, top - 1, 60, 12, 14400);
  await settle(page);
  c("one run forms at the last hit", (await runs(page)).length === 2 && (await runs(page))[1].live && (await runs(page))[1].n === 12, JSON.stringify((await runs(page)).map((r) => [r.w, r.n])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("D4 a search hit inside the window is a plausible step", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "mark.txt", TXT_MARK);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 3, 14400);              /* 40 s of reading; the top is word 181; the marker is 440 words on */
  await page.clock.runFor(14400);
  const before = (await st(page)).window;
  await readScroll(page, S, 180, 60, 4, 14400);            /* now the top is word 421; the marker at 621 is 200 words on, inside the window */
  await page.clock.runFor(20000);
  const n0 = (await trans(page)).length;
  await page.keyboard.press("/");
  await page.waitForFunction(() => !!document.getElementById("findInput"), null, { timeout: 5000 });
  await page.type("#findInput", "Zyzzyva");
  await settle(page, 400);
  await page.waitForFunction(() => /1 match/.test(document.getElementById("findStatus").textContent), null, { timeout: 10000 });
  await page.clock.runFor(3000);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("side").classList.contains("open"), null, { timeout: 5000 });
  await settle(page);
  const after = (await trans(page)).slice(n0), last = after[after.length - 1], w0 = (await st(page)).run.words;
  /* the panel put the reader there: the hit is not a jump (it landed inside the rested window),
     but neither its words nor the dwell before it are reading — the reader searched, they did
     not read their way down the page */
  c("the hit inside the window is a move made by the panel, not a credit", last.kind === "nav" && after.filter((t) => t.kind === "jump").length === 0 && last.adv > 60 && last.adv <= before.V, JSON.stringify(last));
  c("its time is the 20 s dwell; the block up to the hit excluded", within(last.dt, 20000, 100) && last.blocked > 0 && last.blocked <= 1000, JSON.stringify([last.dt, last.blocked]));
  await page.clock.runFor(14400);
  await goWord(page, S[700]);
  await settle(page);
  const next = (await trans(page)).slice(-1)[0];
  c("reading on from the hit credits only what was read there", next.kind === "credit" && within(next.dt, 16400, 100) && within(next.blocked, 3000, 700) && next.credit === next.adv, JSON.stringify(next));
  c("the words the search skipped were never credited", (await st(page)).run.words === w0 + next.credit, JSON.stringify([w0, (await st(page)).run.words]));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("D5 a contents jump back to chapter 1", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "chapters.md", MD_CHAPTERS, "text/markdown");
  await start(page);
  const S = await starts(page);
  const h3 = await page.evaluate(() => { const h = Array.from(document.querySelectorAll("#doc h2")).filter((e) => /Chapter 3/.test(e.textContent))[0]; const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT).nextNode(); return window.__ll.Anchor.offsetOf(w, 0); });
  const k0 = S.findIndex((s) => s >= h3);
  await goWord(page, S[k0]);
  await settle(page);
  const k = await readScroll(page, S, k0, 60, 12, 14400);
  await page.clock.runFor(5000);
  const n0 = (await trans(page)).length, rs0 = (await runs(page)).length;
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.querySelector("#sideBody .toc-item"), null, { timeout: 5000 });
  await page.click("#sideBody .toc-item:has-text('Chapter 1')");
  await settle(page);
  const after = (await trans(page)).slice(n0), j = ofKind(after, "jump")[0];
  c("a navigation jump back beyond the window; the run stored; a new run; no resume", !!j && j.reason === "navigation" && j.adv < -500 && (await runs(page)).length === 1 && !(await runs(page))[0].live && ofKind(after, "resume").length === 0 && (await st(page)).run.n === 0, kinds(after) + " " + JSON.stringify(j));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("D6 the card, then a contents jump two chapters on", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "chapters.md", MD_CHAPTERS, "text/markdown");
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 2, 60, 6, 14400);
  await page.clock.runFor(1000);
  await page.evaluate(() => window.llDict.defineWord("river"));
  await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open"), null, { timeout: 20000 });
  await page.clock.runFor(30000);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("dictCard").classList.contains("open"), null, { timeout: 5000 });
  await page.clock.runFor(20000);
  await goWord(page, S[k + 60]);
  await settle(page);
  let last = (await trans(page)).slice(-1)[0];
  c("resumed under the card: the next credit has blocked ≈ 30 s", last.kind === "credit" && within(last.blocked, 30000, 50) && within(last.dt, 21000, 50), JSON.stringify(last));
  const n0 = (await trans(page)).length, sk0 = (await today(page)).skimmed;
  await page.clock.runFor(5000);
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.querySelector("#sideBody .toc-item"), null, { timeout: 5000 });
  await page.click("#sideBody .toc-item:has-text('Chapter 3')");
  await settle(page);
  const after = (await trans(page)).slice(n0), j = ofKind(after, "jump")[0];
  c("a jump inside the navigation window: the run stored, nothing skimmed", !!j && j.reason === "navigation" && j.adv > 1000 && (await runs(page)).length === 1 && (await today(page)).skimmed === sk0, kinds(after) + " " + JSON.stringify(j));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== E. blockers ============================== */

scenario("E1 the settings sheet for 20 s", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  const n0 = (await trans(page)).length;
  await page.keyboard.press("s");
  await page.waitForFunction(() => document.getElementById("sheet").classList.contains("open"), null, { timeout: 5000 });
  c("blocked by the sheet", (await st(page)).blockers.indexOf("sheet") >= 0, JSON.stringify((await st(page)).blockers));
  await page.clock.runFor(20000);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("sheet").classList.contains("open"), null, { timeout: 5000 });
  await settle(page);
  const mid = (await trans(page)).slice(n0);
  c("the compensating scrolls land still", ofKind(mid, "still").length >= 1 && ofKind(mid, "credit").length === 0 && ofKind(mid, "jump").length === 0, kinds(mid));
  await page.clock.runFor(13400);
  await goWord(page, S[k + 60]);
  await settle(page);
  const last = (await trans(page)).slice(-1)[0];
  c("the 20 s subtracted: blocked ≈ 20 000, the run kept", last.kind === "credit" && within(last.blocked, 20000, 50) && within(last.dt, 16400, 50) && (await st(page)).run.n === 5, JSON.stringify(last));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E2 the sheet with five text-size bumps (a relayout under the block)", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 16, 14400);         /* 20 % into the text */
  await page.clock.runFor(1000);
  const n0 = (await trans(page)).length, sk0 = (await today(page)).skimmed;
  await page.keyboard.press("s");
  await page.waitForFunction(() => document.getElementById("sheet").classList.contains("open"), null, { timeout: 5000 });
  for (let i = 0; i < 5; i++){ await page.clock.runFor(5000); await page.keyboard.press("+"); }
  await page.clock.runFor(20000);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("sheet").classList.contains("open"), null, { timeout: 5000 });
  await settle(page);
  const after = (await trans(page)).slice(n0), land = after.filter((t) => /^(still|back|jump)$/.test(t.kind)).pop();
  c("size 24 px now; the relayout landed as " + (land ? land.kind : "nothing"), (await page.evaluate(() => window.__ll.state.size)) === 24 && !!land, kinds(after));
  c("no credit from the relayout, nothing skimmed, the 45 s excluded", ofKind(after, "credit").length === 0 && (await today(page)).skimmed === sk0 && (land.kind === "jump" ? true : within(land.blocked, 45000, 50)), JSON.stringify(land));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E3 focus lost for two minutes", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(29000);
  c("no block inside the 30 s grace", (await phase(page)) === "reading", await phase(page));
  await page.clock.runFor(2000);
  const tent = await st(page);
  c("a tentative block after the grace", tent.phase === "blocked" && tent.blockers.indexOf("unfocused") >= 0 && within(tent.blockedMs, 1000, 1000), JSON.stringify([tent.phase, tent.blockers, tent.blockedMs]));
  await page.clock.runFor(89000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  c("focus confirms it: reading again", (await phase(page)) === "reading", await phase(page));
  await page.clock.runFor(14400);
  await goWord(page, S[k + 60]);
  await settle(page);
  const last = (await trans(page)).slice(-1)[0];
  c("the next credit: blocked ≈ 90 000 (blur + 30 s to focus), the run kept", last.kind === "credit" && within(last.blocked, 90000, 50) && within(last.dt, 1000 + 30000 + 14400, 50) && (await st(page)).run.n === 5, JSON.stringify(last));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E4 unfocused but reading: wheel input keeps the clock running", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  let k = 0;
  for (let i = 1; i <= 9; i++){ await page.clock.runFor(20000); await page.evaluate(() => window.dispatchEvent(new Event("wheel"))); k = i * 25; await goWord(page, S[k]); }
  await settle(page);
  const tr = await trans(page), credits = ofKind(tr, "credit");
  c("never blocked, all nine steps credited with blocked 0", credits.length === 9 && credits.every((t) => t.blocked === 0 && t.dt === 20000) && ofKind(tr, "block").length === 0, kinds(tr));
  c("the pace is the driven 75 wpm ±12 %", near(rateOf((await runs(page))[0]), 75, 12), rateOf((await runs(page))[0]).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E5 unfocused, then an input after the grace cancels the block", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(60000);
  c("tentatively blocked after 30 s", (await st(page)).blockers.indexOf("unfocused") >= 0, JSON.stringify((await st(page)).blockers));
  await page.evaluate(() => window.dispatchEvent(new Event("wheel")));
  await goWord(page, S[k + 60]);
  await settle(page);
  const tr = await trans(page), last = tr[tr.length - 1], unblock = ofKind(tr, "unblock").pop();
  c("cancelled by the input: the credit has blocked 0, dt 61 s", last.kind === "credit" && last.blocked === 0 && last.dt === 61000, JSON.stringify(last));
  c("the transition list shows unblock with reason input", !!unblock && unblock.reason === "input", JSON.stringify(unblock));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E6 a bus ride: hidden and visible every 90 s for 20 minutes", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  let visible = 0, hidden = false, turns = 0;
  for (let t = 0; t < 1200; t += 30){
    if (!hidden){ await page.clock.runFor(30000); visible += 30; if (visible % 150 === 0){ await page.keyboard.press("ArrowRight"); turns++; } }
    else await page.clock.runFor(30000);
    if ((t + 30) % 90 === 0){ hidden = !hidden; await page.evaluate(hidden ? HIDE : SHOW); }
  }
  if (hidden) await page.evaluate(SHOW);
  await settle(page);
  const tr = await trans(page), credits = ofKind(tr, "credit");
  c(turns + " turns, each credited with 150 s of visible time", credits.length === turns && credits.every((t) => within(t.dt, 150000, 50)), JSON.stringify(credits.map((t) => [t.dt, t.blocked])));
  c("the hidden periods are subtracted, the run never closed", credits.some((t) => t.blocked >= 90000) && (await runs(page)).length === 1 && (await runs(page))[0].live && ofKind(tr, "anchor").length <= 2, kinds(tr));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E7 overnight: a 9-hour hidden tab ends the run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  await page.evaluate(HIDE);
  await page.clock.runFor(9 * 3600000);
  const dark = await st(page), lc = await page.evaluate(() => { const l = window.llPace._debug.lastClosed(); return l && l.by; });
  c("closed by the long block while hidden", dark.run === null && lc === "block" && (await runs(page)).length === 1, JSON.stringify([dark.phase, lc]));
  await page.evaluate(SHOW);
  await settle(page);
  const s = await st(page), tr = await trans(page);
  c("on return: a fresh anchor at the same place, no resume", s.phase === "reading" && s.run.n === 0 && tr[tr.length - 1].kind === "anchor" && ofKind(tr, "resume").length === 0, kinds(tr.slice(-4)));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E8 auto-scroll paused by a wheel: measured; resumed: blocked", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  await page.evaluate(() => window.__ll.Auto.start());
  await page.clock.runFor(30000);
  c("auto-scroll running: blocked", (await st(page)).blockers.indexOf("auto") >= 0, JSON.stringify((await st(page)).blockers));
  await page.evaluate(() => window.dispatchEvent(new Event("wheel")));
  await settle(page);
  const paused = await st(page);
  c("paused by the wheel: measured again (a run open)", (await page.evaluate(() => window.__ll.Auto.isPaused())) && paused.phase === "reading" && paused.run !== null, JSON.stringify([paused.phase, paused.run && paused.run.n]));
  const top = (await measure(page)).top;
  await readScroll(page, S, top - 1, 60, 8, 14400);
  await settle(page);
  const live = (await st(page)).run;
  c("eight manual steps credited while paused", live && live.n >= 8 && near(live.words / live.ms * 60000, 250, 12), JSON.stringify(live));
  await page.evaluate(() => window.__ll.Auto.resume());
  await settle(page);
  c("resumed: blocked again, the run closed and stored", (await st(page)).blockers.indexOf("auto") >= 0 && (await st(page)).run === null && (await runs(page)).length >= 1 && (await runs(page)).every((r) => !r.live), JSON.stringify((await runs(page)).map((r) => [r.w, r.ms])));
  await page.evaluate(() => window.__ll.Auto.stop());
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("E9 a translated document is not read in its own words", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await page.evaluate(() => window.__ll.need(["translate"]).then(() => { try { window.llTranslate.togglePage(); } catch(_){} }));
  await page.clock.runFor(1500);
  const on = await page.evaluate(() => !!(window.llTranslate && window.llTranslate.isOn()));
  if (!on){ c("translation could not be turned on headless: skipped (noted)", true, "llTranslate.isOn() stayed false"); return; }
  c("translated: blocked with 'translated'", (await st(page)).blockers.indexOf("translated") >= 0, JSON.stringify((await st(page)).blockers));
  await page.evaluate(() => window.llTranslate.showOriginal());
  await settle(page);
  c("original again: reading", (await phase(page)) === "reading", await phase(page));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== F. layout ============================== */

scenario("F1 flow switches and zen inside one run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  const n0 = (await trans(page)).length, seen = [];
  const act = async (fn, label) => { await fn(); await settle(page); seen.push(label + ":" + (await phase(page))); };
  await act(() => page.keyboard.press("p"), "pages");
  await turnPages(page, 2, 250);
  await act(() => page.keyboard.press("z"), "zen");
  await act(() => page.keyboard.press("z"), "unzen");
  await act(() => page.keyboard.press("p"), "scroll");
  const top = (await measure(page)).top;
  await readScroll(page, S, top - 1, 60, 2, 14400);
  await settle(page);
  const tr = (await trans(page)).slice(n0), layout = tr.filter((t) => /^(still|back|jump|anchor|resume)$/.test(t.kind));
  c("every layout change lands still or back", layout.length >= 3 && layout.every((t) => t.kind === "still" || t.kind === "back"), kinds(tr));
  c("one continuous run: 4 + 2 + 2 credits, no jump, no new anchor", ofKind(tr, "credit").length === 4 && (await runs(page)).length === 1 && (await st(page)).run.n >= 8, JSON.stringify((await st(page)).run));
  c("the phase never left reading (the sheet is closed by zen)", seen.every((s) => /:reading$/.test(s)), JSON.stringify(seen));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("F2 a resize in Pages flow", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await turnPages(page, 2, 250);
  const n0 = (await trans(page)).length;
  await page.setViewportSize({ width: 800, height: 600 });
  await page.clock.runFor(1000);
  await settle(page);
  const tr = (await trans(page)).slice(n0), backs = ofKind(tr, "back").length;
  c("at most one back (its time counted, no words), no credit, no run boundary", ofKind(tr, "credit").length === 0 && backs <= 1 && ofKind(tr, "jump").length === 0 && ofKind(tr, "anchor").length === 0 && (await st(page)).run.n === 2 + backs && (await st(page)).run.words === ofKind(await trans(page), "credit").reduce((a, t) => a + t.credit, 0), kinds(tr) + " " + JSON.stringify((await st(page)).run));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("F3 reduced motion: the same transitions as A2", { context: desktop }, async (ctx, c, url, shared) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await turnPages(page, 4, 250);
  const mine = ofKind(await trans(page), "credit").map((t) => [t.kind, t.adv, t.dt]);
  c("identical to A2's credits", JSON.stringify(mine) === JSON.stringify(shared.A2), JSON.stringify(mine) + " vs " + JSON.stringify(shared.A2));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("F4 a two-column spread", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: true });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  c("two columns per page", (await page.evaluate(() => window.__ll.state.perPage)) === 2);
  const turns = await turnPages(page, 4, 250);
  const credits = ofKind(await trans(page), "credit");
  c("V is a spread of two columns (300–550 words), each turn credits V", turns.every((t) => t.V >= 300 && t.V <= 550) && credits.length === 4 && credits.every((t, i) => within(t.adv, turns[i].V, 2)), JSON.stringify(credits.map((t, i) => [t.adv, turns[i].V])));
  c("pace ±12 %", near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("F5 a phone in Scroll flow: 25 words every 6 s for 3 minutes", { context: phone }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const V = (await measure(page)).V, S = await starts(page);
  await readScroll(page, S, 0, 25, 30, 6000);
  await settle(page);
  const tr = await trans(page), s = await st(page);
  c("V 80–160, thirty credits, no jump or pause", V >= 80 && V <= 160 && s.run.n === 30 && !tr.some((t) => /jump|pause|skim/.test(t.kind)), V + " " + JSON.stringify(s.run));
  c("pace ±12 %", near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== G. documents ============================== */

scenario("G1 the word index is exact for every fixture", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  for (const [name, text, mime] of [["paras.txt", TXT_PARAS, "text/plain"], ["giant.txt", TXT_GIANT, "text/plain"], ["tiny.md", MD_TINY, "text/markdown"], ["chapters.md", MD_CHAPTERS, "text/markdown"], ["figure.html", HTML_IMG, "text/html"]]){
    await openText(page, name, text, mime);
    const r = await page.evaluate(() => { const ix = window.llPace._debug.index, t = document.getElementById("doc").textContent; return { words: ix.words, count: (t.match(/\S+/g) || []).length, first: ix.starts[0], lastOk: t.slice(ix.starts[ix.words - 1]).match(/^\S+/) !== null, gaps: ix.starts.every((s, i) => !i || s > ix.starts[i - 1]) }; });
    c(name + ": words = tokens (" + r.words + "), starts strictly increasing", r.words === r.count && r.gaps && r.lastOk, JSON.stringify(r));
  }
  await openFixture(page, "sample.md");
  await waitReady(page);
  const md = await page.evaluate(() => ({ ix: window.llPace._debug.index.words, pd: window.__ll.Progress.docWords() }));
  c("sample.md: index words = Progress.docWords()", md.ix === md.pd && md.ix > 200, JSON.stringify(md));
  await start(page);
  const S = await starts(page), tops = [];
  for (const k of [0, 60, 120]){ await goWord(page, S[k]); tops.push((await measure(page)).top); }
  c("a paragraph's first word at the top measures as word k + 1", tops.join() === "1,61,121" || tops.every((t, i) => within(t, [1, 61, 121][i], 14)), tops.join());
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("G2 a 300 000-word text: the index in slices, no work at rest", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "big.txt", TXT_300K);
  const ix = await page.evaluate(() => { const i = window.llPace._debug.index; return { words: i.words, slices: i.slices, ms: i.ms }; });
  c("300 000 words in ≥ 9 slices within 300 ms", ix.words === 300000 && ix.slices >= 9 && ix.ms <= 300, JSON.stringify(ix));
  await start(page);
  const m0 = await page.evaluate(() => window.llPace._debug.measurements);
  await page.clock.runFor(60000);
  c("60 idle heartbeats measure nothing", (await page.evaluate(() => window.llPace._debug.measurements)) === m0, String((await page.evaluate(() => window.llPace._debug.measurements)) - m0));
  const S = await starts(page);
  await goWord(page, S[600]);
  await settle(page);
  c("a settle measures once, quickly", (await page.evaluate(() => window.llPace._debug.measurements)) === m0 + 1 && (await page.evaluate(() => window.llPace._debug.lastMeasureMs)) <= 10, String(await page.evaluate(() => window.llPace._debug.lastMeasureMs)));
  /* a spy on #doc.textContent, once the scroll's own position save (Library reads it) has run;
     the ticks are spaced past Progress's 250 ms throttle by the clock */
  await page.clock.runFor(2000);
  await page.evaluate(() => { const doc = document.getElementById("doc"), get = Object.getOwnPropertyDescriptor(Node.prototype, "textContent").get; window.__reads = 0; Object.defineProperty(doc, "textContent", { configurable: true, get(){ window.__reads++; return get.call(this); } }); });
  for (let i = 0; i < 5; i++){ await page.clock.runFor(300); await page.evaluate(() => window.__ll.Progress.tick()); }
  const reads = await page.evaluate(() => { const n = window.__reads; delete document.getElementById("doc").textContent; return n; });
  c("Progress.tick() no longer reads #doc.textContent", reads === 0, String(reads));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("G3 the end of the document and home", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 12, 14400);
  await page.clock.runFor(14400);
  const frag0 = await fragments(page);
  await goWord(page, S[4990]);
  await settle(page);
  c("the leap to the end is a navigation jump; the run stored", (await trans(page)).slice(-2).some((t) => t.kind === "jump" && t.reason === "navigation") && (await runs(page)).length === 1, kinds((await trans(page)).slice(-3)));
  await page.clock.runFor(30000);
  await page.keyboard.press("h");
  await settle(page);
  const s = await st(page), id = sha256hex(TXT_PARAS);
  c("home: phase off, no run, the last window uncredited, no fragment from it", s.phase === "off" && s.run === null && (await runs(page)).length === 1 && (await fragments(page)) === frag0, JSON.stringify([s.phase, await fragments(page), frag0]));
  const snap = await page.evaluate(() => window.llStats.snapshot());
  c("Stats still marks the book finished from the reading fraction", snap.books[id] && snap.books[id].finished === true, JSON.stringify(snap.books[id]));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("G4 reopening with a saved position", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  const id = await page.evaluate(() => window.__ll.Library.currentId());
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 12, 14400);
  await settle(page);
  const d0 = await docWpm(page), rs0 = (await runs(page)).length;
  await page.keyboard.press("h");
  await settle(page);
  await page.evaluate((id) => window.__ll.Library.openId(id), id);
  const early = await page.evaluate(() => ({ phase: window.llPace.state().phase, pending: window.__ll.Library._debug().pending }));
  c("while opening: anchoring (not reading)", early.phase !== "reading", JSON.stringify(early));
  await waitReady(page, id);
  await settle(page);
  const s = await st(page), tr = await trans(page);
  c("anchored at the restored position (word 721), the restore no transition", s.phase === "reading" && within(s.window.top, 721, 14) && tr[tr.length - 1].kind === "anchor" && (await page.evaluate(() => window.__ll.Library._debug().pending)) === null, JSON.stringify([s.window, kinds(tr.slice(-3))]));
  c("runs unchanged, the book's pace as before", (await runs(page)).length === rs0 && within(await docWpm(page), d0, 0.5), (await docWpm(page)).toFixed(2) + " vs " + d0.toFixed(2));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("G5 two tabs: three runs, each in its book, no resume across", { context: desktop }, async (ctx, c, url) => {
  const idA = sha256hex(TXT_PARAS), idB = sha256hex(TXT_OTHER);
  const page = await openPage(ctx, url);
  await page.setInputFiles("#fileInput", [{ name: "paras.txt", mimeType: "text/plain", buffer: Buffer.from(TXT_PARAS, "utf8") }, { name: "other.txt", mimeType: "text/plain", buffer: Buffer.from(TXT_OTHER, "utf8") }]);
  await waitReady(page, idA);
  await start(page);
  const SA = await starts(page);
  await readScroll(page, SA, 0, 60, 8, 14400);
  await page.clock.runFor(2000);
  await page.click('#tabs .tab[data-id="' + idB + '"]');
  await waitReady(page, idB);
  await page.evaluate(() => window.llPace._debug.anchorNow());
  const SB = await starts(page);
  await readScroll(page, SB, 0, 60, 8, 14400);
  await page.clock.runFor(2000);
  await page.keyboard.press("Control+Tab");
  await waitReady(page, idA);
  await page.evaluate(() => window.llPace._debug.anchorNow());
  const top = (await measure(page)).top;
  await readScroll(page, SA, top - 1, 60, 8, 14400);
  await settle(page);
  const rs = await runs(page), tr = await trans(page);
  c("three runs: A, B, A (live)", rs.length === 3 && rs[0].b === idA && rs[1].b === idB && rs[2].b === idA && rs[2].live === true && rs.every((r) => r.n === 8), JSON.stringify(rs.map((r) => [r.b.slice(0, 6), r.n])));
  c("no run spans a switch, no resume across tabs", ofKind(tr, "resume").length === 0 && rs.every((r) => r.ms <= 8 * 14400 + 100), kinds(tr).slice(-80));
  const expA = bookOf(rs, idA);
  c("docWpm(A) from A's two runs", within(await docWpm(page), expA, 1), (await docWpm(page)).toFixed(1) + " vs " + expA.toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== H. PDF ============================== */

scenario("H2 a PDF spread in Pages flow", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: true });
  await openPdf(page);
  await start(page);
  c("two pages per turn", (await page.evaluate(() => window.__ll.state.perPage)) === 2 && (await st(page)).window.V === 2, JSON.stringify(await st(page)));
  for (let i = 0; i < 2; i++){ await page.clock.runFor(80000); await page.keyboard.press("ArrowRight"); }
  await settle(page);
  const credits = ofKind(await trans(page), "credit"), ppm = await page.evaluate(() => window.llPace.docPpm());
  /* the PDF page turn pokes once its render lands, a frame later */
  c("each turn credits 2 pages in 80 s", credits.length === 2 && credits.every((t) => t.adv === 2 && t.credit === 2 && within(t.dt, 80000, 50)), JSON.stringify(credits));
  c("docPpm blends toward 1.5 (1.389, within 15 %)", within(ppm, 1.389, 0.02) && near(ppm, 1.5, 15), ppm.toFixed(3));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("H3 a sparse page flipped past is not a skim", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openPdf(page);
  await start(page);
  await page.evaluate(() => window.llPace._debug.setParams({ SPARSE_WORDS: 400 }));
  await page.clock.runFor(40000); await goPdfPage(page, 2);
  await page.clock.runFor(1000); await page.waitForTimeout(150);          /* the heartbeat asks for page 2's words; pdf.js answers */
  await page.clock.runFor(2000); await goPdfPage(page, 3);
  await page.clock.runFor(40000); await goPdfPage(page, 4);
  await settle(page);
  const tr = await trans(page), s = await st(page), known = await page.evaluate(() => window.llPace._debug.pageWords());
  c("three credits, the 3-second page among them (sparse: no skim)", ofKind(tr, "credit").length === 3 && ofKind(tr, "skim").length === 0 && ofKind(tr, "credit")[1].dt === 3000 && known[2] !== undefined, kinds(tr) + " " + JSON.stringify(known));
  c("the run holds all three pages", s.run.pages === 3 && s.run.n === 3, JSON.stringify(s.run));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("H4 a dense page: the dwell limit scales with its words", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openPdf(page);
  await start(page);
  for (let i = 0; i < 30 && Object.keys(await page.evaluate(() => window.llPace._debug.pageWords())).length < 1; i++){ await page.clock.runFor(200); await page.waitForTimeout(50); }
  const w1 = (await page.evaluate(() => window.llPace._debug.pageWords()))[1], cap = Math.max(30, Math.min(270, w1)) * 1000;
  c("page 1 has about 135 words: the limit is " + cap / 1000 + " s", w1 >= 100 && w1 <= 200, String(w1));
  await page.clock.runFor(300000); await goPdfPage(page, 2); await settle(page);
  let last = (await trans(page)).slice(-1)[0];
  c("5 minutes on it without input: a pause", last.kind === "pause" && within(last.dt, 300000, 1000), JSON.stringify(last));
  await page.clock.runFor(60000);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300 })));
  await page.clock.runFor(240000); await goPdfPage(page, 3); await settle(page);
  last = (await trans(page)).slice(-1)[0];
  c("with input the cap is 420 s, yet 300 s still exceeds the page's own limit: a pause", last.kind === "pause" && within(last.dt, 300000, 2500), JSON.stringify(last));
  /* at 20 wpm the page could take 405 s; the 270 s cap would still cut it without a sign of the
     reader, so a pointer move raises the cap to 420 s and the same dwell is credited */
  await page.evaluate(() => window.llPace._debug.setParams({ MIN_WPM: 20 }));
  await page.clock.runFor(60000);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300 })));
  await page.clock.runFor(240000); await goPdfPage(page, 4); await settle(page);
  last = (await trans(page)).slice(-1)[0];
  c("at MIN_WPM 20 the limit is " + Math.min(420, w1 * 3) + " s: the same dwell is credited", last.kind === "credit" && within(last.dt, 300000, 2500), JSON.stringify(last));
  await page.evaluate(() => window.llPace._debug.setParams({ MIN_WPM: 60 }));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ============================== I. estimator and persistence ============================== */

const T = T0.getTime(), bookAgg = (list) => { const b = {}; list.forEach((r) => { const a = b[r.b] || (b[r.b] = { w: 0, ms: 0, p: 0, n: 0, t: 0 }); a.w += r.w; a.ms += r.ms; a.p += r.p; a.n++; a.t = Math.max(a.t, r.t); }); return b; };
const mkRun = (b, w, wpm, agoMs, i) => ({ b, t: T - (agoMs || 0) - (i || 0) * 1000, w, ms: Math.round(w / wpm * 60000), p: 0, n: Math.max(2, Math.round(w / 60)), k: "w" });

scenario("I1 the prior fades as words arrive", { context: desktop }, async (ctx, c, url) => {
  let page = await openPage(ctx, url);
  let v = await page.evaluate(() => ({ wpm: window.llPace.wpm(), ppm: window.llPace.ppm(), conf: window.llPace.confidence() }));
  c("empty store: 230 wpm, 0.5 ppm, not measured yet", v.wpm === 230 && v.ppm === 0.5 && v.conf.value === 0 && v.conf.label === "not measured yet" && v.conf.text === "not measured yet, using a typical 230 words per minute", JSON.stringify(v));
  await page.close();
  const one = [mkRun("bookX", 1500, 300)];
  await seed(ctx, url, "ll_pace", { v: 1, runs: one, books: bookAgg(one) });
  page = await openPage(ctx, url);
  v = await page.evaluate(() => ({ wpm: window.llPace.wpm(), conf: window.llPace.confidence() }));
  c("one 1500-word run at 300: (400·230 + 1500·300) / 1900 = 285.3", within(v.wpm, 285.26, 0.5) && v.conf.label === "a first guess", JSON.stringify(v));
  await page.close();
  const five = [0, 1, 2, 3, 4].map((i) => mkRun("bookX", 3000, 300, 0, i));
  await seed(ctx, url, "ll_pace", { v: 1, runs: five, books: bookAgg(five) });
  page = await openPage(ctx, url);
  v = await page.evaluate(() => ({ wpm: window.llPace.wpm(), conf: window.llPace.confidence() }));
  c("15 000 words at 300 in five runs: 298.2, well measured over 50 min", within(v.wpm, 298.2, 0.5) && v.conf.label === "well measured" && v.conf.minutes === 50, JSON.stringify(v));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I2 a robust median: one 1100-wpm accident among eight runs at 250", { context: desktop }, async (ctx, c, url) => {
  const list = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => mkRun("b" + (i % 3), 400, 250, 0, i)).concat([mkRun("b9", 2500, 1100, 0, 9)]);
  await seed(ctx, url, "ll_pace", { v: 1, runs: list, books: bookAgg(list) });
  const page = await openPage(ctx, url);
  const w = await wpm(page);
  c("the median stays at 250: wpm ≤ 260 (249)", w <= 260 && within(w, 249, 1), w.toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I3 recency fade and retention", { context: desktop }, async (ctx, c, url) => {
  const old = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => mkRun("oldbook", 1000, 400, 120 * 86400000, i));
  await seed(ctx, url, "ll_pace", { v: 1, runs: old, books: bookAgg(old) });
  let page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 48, 20, 14400);
  await settle(page);
  const rs = await runs(page), live = rs.filter((r) => r.live)[0], oldW = 1000 * Math.pow(0.5, 120 / 45) * 10, newW = live.w;
  const expected = (400 * 230 + (oldW + newW) * 400) / (400 + oldW + newW);
  c("ten 120-day-old runs keep 15.7 % of their weight: the median stays 400, wpm ≈ " + expected.toFixed(0), rs.length === 11 && within(await wpm(page), expected, 1) && within(await wpm(page), 377, 6), (await wpm(page)).toFixed(1));
  c("confidence reports the undecayed 30 min", (await page.evaluate(() => window.llPace.confidence())).minutes === 25 + Math.floor(live.ms / 60000), JSON.stringify(await page.evaluate(() => window.llPace.confidence())));
  await page.close();
  const gone = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => mkRun("oldbook", 1000, 400, 400 * 86400000, i));
  await seed(ctx, url, "ll_pace", { v: 1, runs: gone, books: bookAgg(gone) });
  page = await openPage(ctx, url);
  c("runs older than 180 days are dropped at load", (await runs(page)).length === 0 && (await wpm(page)) === 230, String((await runs(page)).length));
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  await readScroll(page, S, 0, 48, 20, 14400);
  await settle(page);
  const w = (await runs(page))[0].w, exp2 = (400 * 230 + w * 200) / (400 + w);
  c("one run left: wpm ≈ " + exp2.toFixed(0), (await runs(page)).length === 1 && within(await wpm(page), exp2, 1) && within(await wpm(page), 209, 4), (await wpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I4 retention: 250 runs across 12 books", { context: desktop }, async (ctx, c, url) => {
  const list = [];
  for (let i = 0; i < 210; i++) list.push(mkRun("book" + (i % 11), 500, 250, (i % 100) * 86400000, i));
  for (let i = 0; i < 40; i++) list.push(mkRun("book" + (i % 11), 500, 250, 200 * 86400000, i));
  for (let i = 0; i < 8; i++) list.push(mkRun("eightbook", 500, 250, 100 * 86400000, i));
  await seed(ctx, url, "ll_pace", { v: 1, runs: list, books: bookAgg(list) });
  const page = await openPage(ctx, url);
  const rs = await runs(page), age = (r) => (T - r.t) / 86400000;
  c("≤ 200 kept, none older than 180 days, the 8-run book whole", rs.length <= 200 && rs.every((r) => age(r) <= 180) && rs.filter((r) => r.b === "eightbook").length === 8, rs.length + " runs, eightbook " + rs.filter((r) => r.b === "eightbook").length);
  const store = await page.evaluate(() => window.llPace._debug.store());
  c("book totals kept for retained books", Object.keys(store.books).length >= 12 && store.books.eightbook.n === 8, JSON.stringify(Object.keys(store.books).length));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I5 a reload mid-run keeps the run", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 8, 14400);
  await settle(page);
  const w0 = await wpm(page), live = (await runs(page))[0];
  await page.reload({ waitUntil: "load" });
  const rs = await runs(page);
  c("the live run was saved and closed at load", rs.length === 1 && !rs[0].live && rs[0].w === live.w && rs[0].ms === live.ms, JSON.stringify(rs));
  c("wpm reflects it", within(await wpm(page), w0, 0.5), (await wpm(page)).toFixed(1) + " vs " + w0.toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I6 a corrupt store", { context: desktop }, async (ctx, c, url) => {
  await seed(ctx, url, "ll_pace", "{nope");
  const page = await openPage(ctx, url);
  c("the prior, no error", (await wpm(page)) === 230 && !page._errors, errorsOf(page));
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 4, 14400);
  await settle(page, 3000);
  const raw = await page.evaluate(() => localStorage.getItem("ll_pace"));
  let parsed = null; try { parsed = JSON.parse(raw); } catch(_){}
  c("rewritten valid on the first save", parsed && parsed.v === 1 && parsed.live && parsed.live.n === 4, String(raw).slice(0, 120));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I7 storage unavailable: measured in memory", { context: desktop, init: "Storage.prototype.setItem = function(){ throw new Error('quota'); };" }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 8, 14400);
  await settle(page);
  c("a run and a pace in memory", (await runs(page)).length === 1 && near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  await page.keyboard.press("g");
  await page.waitForFunction(() => /Average speed/.test(document.getElementById("sideBody").innerText), null, { timeout: 5000 });
  c("the Stats panel renders", /words per minute/.test(await page.$eval("#sideBody", (b) => b.innerText)));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("I8 a clock jump of 20 minutes mid-dwell", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(5000);
  await page.clock.setSystemTime(new Date(T0.getTime() + 60000 + 8 * 14400 + 5000 + 20 * 60000));
  await goWord(page, S[k + 60]);
  await settle(page);
  const last = (await trans(page)).slice(-1)[0], rs = await runs(page);
  c("dt ≥ 20 min: a pause, nothing credited", last.kind === "pause" && last.dt >= 1200000 && last.implied < 25, JSON.stringify(last));
  c("the run before is intact and stored; a new one anchored", rs.length === 1 && rs[0].n === 8 && (await st(page)).run.n === 0, JSON.stringify(rs.map((r) => r.n)));
  c("no page errors", !page._errors, errorsOf(page));
});

/* the first-run tip toast shows for 1.8 real seconds: with it the bottom probe's middle column
   can land on the toast and defer to the right-hand one, a word or two of V; it is kept out */
scenario("I9 determinism: the same script twice", { context: desktop }, async (ctx, c, url) => {
  const out = [];
  for (let i = 0; i < 2; i++){
    /* a context of its own each time (a shared one would restore the first pass's reading position) */
    const C = await ctx.browser().newContext(desktop);
    await C.addInitScript(() => { try { localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_tips", "seen"); } catch(_){} });
    const page = await openPage(C, url);
    await openText(page, "paras.txt", TXT_PARAS);
    await start(page);
    const S = await starts(page);
    await readScroll(page, S, 0, 60, 13, 14400);
    await settle(page);
    /* the heartbeat may or may not have anchored during the real-time flow before the pause:
       everything from the deterministic anchor on is compared */
    const list = await trans(page), from = list.map((t) => t.kind).lastIndexOf("anchor");
    out.push(JSON.stringify(list.slice(from)));
    await C.close();
  }
  const a = JSON.parse(out[0]), b = JSON.parse(out[1]);
  let diff = -1; for (let i = 0; i < Math.max(a.length, b.length) && diff < 0; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) diff = i;
  c("identical transition lists (an anchor and 13 credits)", out[0] === out[1] && a.length === 14, a.length + " vs " + b.length + (diff >= 0 ? "; first difference at " + diff + ": " + JSON.stringify(a[diff]) + " vs " + JSON.stringify(b[diff]) : ""));
});

/* ============================== J. UI and compatibility ============================== */

scenario("J1 the time-left readout follows the book's own pace", { context: desktop }, async (ctx, c, url) => {
  const id = sha256hex(TXT_PARAS);
  const list = [0, 1, 2].map((i) => mkRun(id, 600, 120, 86400000, i)).concat([0, 1, 2].map((i) => mkRun("other" + i, 3000, 300, 86400000, i)));
  await seed(ctx, url, "ll_pace", { v: 1, runs: list, books: bookAgg(list) });
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page), exp = bookOf(list, id);
  c("docWpm blends the book's 120 with the global 300: " + exp.toFixed(0), within(await docWpm(page), exp, 1) && (await docWpm(page)) > 120 && (await docWpm(page)) < 200, (await docWpm(page)).toFixed(1));
  await goWord(page, S[600]);
  const pill = await page.evaluate(() => ({ text: document.getElementById("progressInfo").textContent, frac: (() => { const h = document.documentElement; return h.scrollTop / (h.scrollHeight - h.clientHeight); })() }));
  const m = /^(\d+)% · (\d+) min left$/.exec(pill.text), want = (1 - pill.frac) * 5000 / exp;
  c("'NN% · M min left', minutes from the book's pace (±15 %)", !!m && near(+m[2], want, 15), pill.text + " expected " + want.toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("J2+J3 snapshot and sample() compatibility", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 4, 14400);
  await settle(page);
  const snap = await page.evaluate(() => window.llStats.snapshot()), day = snap.days[snap.today], book = snap.books[Object.keys(snap.books)[0]];
  c("snapshot keeps its fields and adds pace, skimmed, listened", ["ms", "words", "pages", "docs", "skimmed", "listened"].every((k) => k in day) && ["ms", "words", "pages", "opened", "finished", "skimmed", "listened"].every((k) => k in book) && "streak" in snap && "today" in snap && "goal" in snap && "best" in snap && "notified" in snap && snap.pace && typeof snap.pace.wpm === "number", JSON.stringify(Object.keys(snap)));
  const sample = await page.evaluate(() => window.__ll.Progress.sample());
  c("Progress.sample(): finite non-negative words, ms, pages, pms plus the summary", ["words", "ms", "pages", "pms"].every((k) => typeof sample[k] === "number" && isFinite(sample[k]) && sample[k] >= 0) && sample.words === 240 && sample.ms === 4 * 14400 && "confidence" in sample && "doc" in sample, JSON.stringify(sample).slice(0, 200));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("J4 the pill hides while the heartbeat runs; idle beats measure nothing", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await goWord(page, S[120]);
  const on = await page.$eval("#progressInfo", (e) => e.classList.contains("on") && /^\d+% · .*left$/.test(e.textContent));
  await page.clock.runFor(3000);
  const off = await page.$eval("#progressInfo", (e) => !e.classList.contains("on"));
  c("shown by the scroll, gone 2.6 s later", on && off, JSON.stringify([on, off]));
  const m0 = await page.evaluate(() => window.llPace._debug.measurements);
  await page.clock.runFor(60000);
  c("60 idle heartbeats: no measurement, the pill still off", (await page.evaluate(() => window.llPace._debug.measurements)) === m0 && (await page.$eval("#progressInfo", (e) => !e.classList.contains("on"))), String((await page.evaluate(() => window.llPace._debug.measurements)) - m0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("J5 the Stats panel's speed block: pictures", { context: desktop }, async (ctx, c, url) => {
  const idA = sha256hex(TXT_PARAS), t = T0.getTime();
  const list = [mkRun(idA, 2952, 300, 3600000), mkRun("otherbook", 860, 179, 1800000), mkRun("thirdbook", 1400, 240, 86400000)];
  const day = { ms: 48 * 60000, words: 5212, pages: 0, skimmed: 1180, listened: 640, docs: [idA, "otherbook", "thirdbook"] };
  const books = { [idA]: { ms: 590400, words: 2952, pages: 0, skimmed: 1180, listened: 0, opened: 2, finished: false }, otherbook: { ms: 288000, words: 860, pages: 0, skimmed: 0, listened: 640, opened: 1, finished: false }, thirdbook: { ms: 350000, words: 1400, pages: 0, skimmed: 0, listened: 0, opened: 1, finished: true } };
  for (const [name, theme, viewport] of [["day-1200", "day", desktop.viewport], ["dusk-1200", "dusk", desktop.viewport], ["day-390", "day", phone.viewport], ["dusk-390", "dusk", phone.viewport]]){
    const C = await ctx.browser().newContext({ viewport });
    await C.addInitScript((th) => { try { localStorage.setItem("ll_prefs", JSON.stringify({ theme: th })); localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_tips", "seen"); } catch(_){} }, theme);
    await seed(C, url, "ll_pace", { v: 1, runs: list, books: bookAgg(list) });
    await seed(C, url, "ll_stats", { v: 1, goal: 15, days: { "2026-09-16": day }, books, best: { streak: 1, day: "2026-09-16" }, notified: "2026-09-16" });
    const page = await openPage(C, url);
    await openText(page, "paras.txt", TXT_PARAS);
    await start(page);
    await page.keyboard.press("g");
    await page.waitForFunction(() => /Average speed/.test(document.getElementById("sideBody").innerText), null, { timeout: 5000 });
    await page.evaluate(() => { const dt = Array.from(document.querySelectorAll("#sideBody .st-grid dt")).filter((d) => d.textContent === "Average speed")[0]; if (dt) dt.scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "stats-speed-" + name + ".png") });
    const text = await page.$eval("#sideBody", (b) => b.innerText), rows = await page.evaluate(() => Array.from(document.querySelectorAll("#sideBody .st-grid dt")).map((d) => d.textContent));
    c(name + ": Skimmed, Listened, Average speed, This document rows and the hint, as dt/dd and .st-hint", rows.indexOf("Skimmed") >= 0 && rows.indexOf("Listened") >= 0 && rows.indexOf("Average speed") >= 0 && rows.indexOf("This document") >= 0 && /measured over 20 min of reading in 3 books/.test(text) && /1,180 skimmed/.test(text) && /Skimmed\n1,180/.test(text) && /Listened\n640/.test(text) && (await page.$$eval("#sideBody .st-hint", (hs) => hs.some((h) => /measured over/.test(h.textContent)))), text.replace(/\n/g, " | ").slice(0, 200) + " … " + text.replace(/\n/g, " | ").slice(-300));
    c(name + ": no page errors", !page._errors, errorsOf(page));
    await C.close();
  }
});

/* ============================== K. what the first round of readers found ============================== */

scenario("K1 a one-page peek and back: the look is a hole, nothing skimmed", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  let driven = 0, words = 0;
  for (let i = 0; i < 2; i++){
    const V = (await measure(page)).V, ms = Math.round(V / 230 * 60000);
    await page.clock.runFor(ms); await page.keyboard.press("ArrowRight");
    driven += ms; words += V;
  }
  const V = (await measure(page)).V, ms = Math.round(V / 230 * 60000);
  await page.clock.runFor(30000);                  /* half the page read */
  await page.keyboard.press("ArrowRight");         /* a look at the next page */
  await page.clock.runFor(30000);
  await page.keyboard.press("ArrowLeft");          /* and straight back */
  await page.clock.runFor(ms - 30000);             /* the page finished */
  await page.keyboard.press("ArrowRight");
  driven += ms; words += V;
  await settle(page);
  const tr = await trans(page), back = ofKind(tr, "back"), s = await st(page), t = await today(page);
  c("the return is a peek: its half minute is in no run", back.length === 1 && back[0].reason === "peek" && back[0].dt === 0, JSON.stringify(back));
  c("three pages once, the page's own time whole", within(s.run.words, words, 8) && within(s.run.ms, driven, 1200), JSON.stringify([s.run.words, words, s.run.ms, driven]));
  c("the rate is the reader's own ±8 %, nothing skimmed", near(s.run.words / s.run.ms * 60000, 230, 8) && t.skimmed === 0, (s.run.words / s.run.ms * 60000).toFixed(1) + " wpm, skimmed " + t.skimmed);
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K2 a screen uncovered in two flicks is one step", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page), V = (await measure(page)).V, dwell = Math.round(V / 250 * 60000);
  let k = 0, driven = 0;
  for (let i = 0; i < 6; i++){
    await page.clock.runFor(dwell); driven += dwell;
    await goWord(page, S[k + Math.round(0.4 * V)]);        /* the flick */
    await page.clock.runFor(2000); driven += 2000;
    k += V; await goWord(page, S[k]);                      /* and the adjustment that finishes it */
  }
  await settle(page);
  const tr = await trans(page), s = await st(page), t = await today(page);
  c("the second motion is judged with the first, never a skim", ofKind(tr, "merge").length >= 5 && ofKind(tr, "skim").length === 0 && t.skimmed === 0, kinds(tr));
  c("every screen credited", within(s.run.words, k, V / 2), s.run.words + " vs " + k);
  c("the rate is the driven one ±12 %", near(s.run.words / s.run.ms * 60000, k / driven * 60000, 12), (s.run.words / s.run.ms * 60000).toFixed(0) + " vs " + (k / driven * 60000).toFixed(0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K3 a flick out of a half-read window is not reading", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 13, 14400);     /* thirteen windows at 250 wpm */
  const V = (await measure(page)).V, w0 = (await today(page)).words;
  await page.clock.runFor(15000);                            /* a quarter of the next window read */
  let j = k;
  for (let i = 0; i < 3; i++){ j += V; await goWord(page, S[j]); await page.clock.runFor(1200); }
  await settle(page);
  const rs = await runs(page), t = await today(page);
  c("the run is stored at the reader's own pace (±5 %)", rs.length >= 1 && near(rateOf(rs[0]), 250, 5), rs.map((r) => rateOf(r).toFixed(0)).join(","));
  c("docWpm ≈ 250 ±12 %", near(await docWpm(page), 250, 12), (await docWpm(page)).toFixed(1));
  c("Stats did not gain the flicked window as read", t.words - w0 <= 70, String(t.words - w0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K4 a double turn by mistake, one page back: what is read next is credited", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  let words = 0, driven = 0;
  const readPage = async () => {
    const V = (await measure(page)).V, ms = Math.round(V / 230 * 60000);
    await page.clock.runFor(ms); await page.keyboard.press("ArrowRight");
    words += V; driven += ms;
  };
  for (let i = 0; i < 3; i++) await readPage();
  await page.clock.runFor(1000);                                             /* a moment on the next page */
  await page.keyboard.press("ArrowRight"); await page.clock.runFor(400); await page.keyboard.press("ArrowRight");
  await page.clock.runFor(1500); await page.keyboard.press("ArrowLeft");     /* noticed, one page back */
  for (let i = 0; i < 4; i++) await readPage();
  await settle(page);
  const rs = await runs(page), totalW = rs.reduce((a, r) => a + r.w, 0), totalMs = rs.reduce((a, r) => a + r.ms, 0);
  /* the page the slip skipped is not credited (it was not read); the four read after it are */
  c("the seven pages read are credited once (±10)", within(totalW, words, 10), totalW + " vs " + words);
  c("the slip costs one run boundary, no more", rs.length === 2 && rs[1].n >= 4, JSON.stringify(rs.map((r) => [r.w, r.n])));
  c("the pace after the slip is the reader's own ±12 %", near(totalW / totalMs * 60000, 230, 12), (totalW / totalMs * 60000).toFixed(1));
  c("docWpm ≈ 230 ±12 %", near(await docWpm(page), 230, 12), (await docWpm(page)).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K5 a phone whose toolbar hides on the way down, with an overshoot corrected", { context: phone }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page), V = (await measure(page)).V, step = Math.round(V * 0.8), dwell = Math.round(step / 220 * 60000);
  let bar = true, k = 0, driven = 0;
  const go = async (w, down) => {
    if (down && bar){ bar = false; await page.setViewportSize({ width: 390, height: 900 }); }
    else if (!down && !bar){ bar = true; await page.setViewportSize({ width: 390, height: 844 }); }
    await goWord(page, S[w]);
  };
  for (let i = 1; i <= 10; i++){
    await page.clock.runFor(dwell); driven += dwell;
    k = i * step;
    await go(k + 12, true);                        /* the flick lands two lines too far */
    await page.clock.runFor(1500); driven += 1500;
    await go(k, false);                            /* nudged back up, and the toolbar returns */
  }
  await settle(page);
  const s = await st(page), rs = await runs(page), t = await today(page), fair = k / driven * 60000;
  c("the screens read are credited (±40 words)", s.run && within(s.run.words, k, 40), JSON.stringify([s.run && s.run.words, k]));
  c("a run qualifies at the driven pace ±12 %", rs.length >= 1 && near(rateOf(rs[rs.length - 1]), fair, 12), rs.map((r) => rateOf(r).toFixed(0)).join(",") + " vs " + fair.toFixed(0));
  c("Stats has the words read (±40)", within(t.words, k, 40), t.words + " vs " + k);
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K6 End and Home in Scroll flow are navigation, not skimming", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 8, 14400);
  await page.clock.runFor(5000);
  const sk0 = (await today(page)).skimmed, n0 = (await trans(page)).length;
  await page.keyboard.press("End");
  await settle(page);
  await page.clock.runFor(10000);
  await page.keyboard.press("Home");
  await settle(page);
  const after = (await trans(page)).slice(n0), jumps = ofKind(after, "jump");
  c("one key press is one move, not a dozen animation frames", jumps.length >= 1 && jumps.every((j) => j.moves <= 2), JSON.stringify(jumps.map((j) => [j.reason, j.moves])));
  c("nothing skimmed", jumps.every((j) => j.reason === "navigation") && (await today(page)).skimmed === sk0, String((await today(page)).skimmed - sk0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K7 a reader who moves one line at a time is measured", { context: phone }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { size: 28 });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = 0;
  for (let i = 0; i < 90; i++){ await page.clock.runFor(1000); k += 5; await goWord(page, S[k]); }
  await settle(page);
  const s = await st(page), tr = await trans(page), t = await today(page);
  c("one-line advances are credited, not swallowed as stillness", s.run && near(s.run.words, k, 20) && s.run.words > 0, JSON.stringify([s.run && s.run.words, k]));
  c("Stats has them too, with no pause or hold for a reader who is there", near(t.words, k, 25) && ofKind(tr, "pause").length === 0 && ofKind(tr, "held").length === 0, t.words + " vs " + k + " " + kinds(tr).slice(-60));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K8 an odd page at half the pace is slow reading, not a break", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false, size: 24 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  let words = 0, driven = 0;
  for (let i = 0; i < 12; i++){
    const V = (await measure(page)).V, ms = i % 3 === 2 ? 180000 : 90000;     /* every third page twice as slow */
    await page.clock.runFor(ms); await page.keyboard.press("ArrowRight");
    words += V; driven += ms;
  }
  await settle(page);
  const tr = await trans(page), rs = await runs(page);
  const totalW = rs.reduce((a, r) => a + r.w, 0), totalMs = rs.reduce((a, r) => a + r.ms, 0), fair = words / driven * 60000;
  c("no page is held as a break", ofKind(tr, "held").length === 0 && ofKind(tr, "pause").length === 0, kinds(tr));
  c("one run over the twelve pages", rs.length === 1 && rs[0].n === 12, JSON.stringify(rs.map((r) => [r.w, r.ms, r.n])));
  c("the pace is the driven " + fair.toFixed(0) + " wpm ±12 %", near(totalW / totalMs * 60000, fair, 12), (totalW / totalMs * 60000).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K9 three five-minute absences are three breaks, not slow reading", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url, { flow: "pages", spread: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  let words = 0, driven = 0;
  const readPage = async () => {
    const V = (await measure(page)).V;
    await page.clock.runFor(90000); await page.keyboard.press("ArrowRight");
    words += V; driven += 90000;
  };
  for (let i = 0; i < 4; i++) await readPage();
  for (let i = 0; i < 3; i++){
    const V = (await measure(page)).V;
    await page.clock.runFor(60000);
    await page.clock.runFor(300000);                 /* gone, with no input at all */
    await page.clock.runFor(30000);
    await page.keyboard.press("ArrowRight");
    words += V; driven += 90000;
  }
  for (let i = 0; i < 4; i++) await readPage();
  await settle(page);
  const tr = await trans(page), rs = await runs(page), fair = words / driven * 60000;
  c("the absences are never admitted as slow reading", ofKind(tr, "admit").length === 0 && ofKind(tr, "held").length >= 3, kinds(tr));
  c("no run holds idle minutes: every rate ≈ the driven " + fair.toFixed(0) + " wpm ±15 %", rs.length >= 1 && rs.every((r) => near(rateOf(r), fair, 15)), rs.map((r) => rateOf(r).toFixed(0)).join(","));
  c("docWpm ≈ the driven pace ±12 %", near(await docWpm(page), fair, 12), (await docWpm(page)).toFixed(1) + " vs " + fair.toFixed(0));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K10 read-aloud: the voice's words are listened, not read", { context: desktop, stub: true }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await page.evaluate(() => { window.__speakDelay = 6000; });
  await start(page);
  const S = await starts(page);
  await readScroll(page, S, 0, 60, 4, 14400);
  await page.clock.runFor(1000);
  const top = (await measure(page)).top, w0 = (await today(page)).words;
  await page.evaluate((o) => window.__ll.Speak.start(o), S[top]);
  await page.waitForFunction(() => document.getElementById("tts").classList.contains("on"), null, { timeout: 5000 });
  await page.clock.runFor(60000);
  const t1 = await today(page);
  c("the voice's words are listened, none of them read", t1.listened > 0 && t1.words === w0, JSON.stringify([t1.listened, t1.words, w0]));
  await page.evaluate(() => window.__ll.Speak.stop());
  await settle(page);
  await page.clock.runFor(20000);
  const after = (await measure(page)).top;
  await goWord(page, S[after + 140]);
  await settle(page);
  const cr = (await trans(page)).slice(-1)[0];
  c("reading on credits only what was read, not what was heard", cr.kind === "credit" && cr.credit < cr.adv && cr.credit <= 90, JSON.stringify(cr));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K11 a look back and the way forward again skims nothing", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  const k = await readScroll(page, S, 0, 60, 10, 14400);
  await page.clock.runFor(5000);
  const sk0 = (await today(page)).skimmed;
  await goWord(page, S[k - 480]);                    /* two screens back to check something */
  await settle(page);
  await page.clock.runFor(20000);
  for (let i = 1; i <= 4; i++){ await goWord(page, S[k - 480 + i * 120]); await page.clock.runFor(200); }
  await settle(page);
  const t = await today(page);
  c("nothing skimmed on the way back to the reading place", t.skimmed === sk0, String(t.skimmed - sk0));
  c("and the reader is not called a skimmer", (await phase(page)) !== "skimming", await phase(page));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K12 a PDF flipped through pages never seen: nothing credited, the pages skimmed", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openPdf(page);
  await start(page);
  await page.clock.runFor(40000);
  await goPdfPage(page, 2);
  await settle(page);
  await page.clock.runFor(40000);
  const n1 = (await trans(page)).length, sk0 = (await today(page)).skimmed;
  for (const n of [3, 4, 5]){ await goPdfPage(page, n); await page.clock.runFor(300); }
  await settle(page);
  for (let i = 0; i < 20 && (await today(page)).skimmed === sk0; i++){ await page.clock.runFor(1000); await page.waitForTimeout(50); }
  const flip = (await trans(page)).slice(n1), j = ofKind(flip, "jump")[0], pw = await page.evaluate(() => window.llPace._debug.pageWords());
  c("the flip-through is a skimmed jump, nothing credited", !!j && j.reason === "skimmed" && ofKind(flip, "credit").length === 0, kinds(flip) + " " + JSON.stringify(j));
  c("the pages flipped past are counted once their text arrives", (await today(page)).skimmed - sk0 === (pw[3] || 0) + (pw[4] || 0) && (await today(page)).skimmed > sk0, JSON.stringify([(await today(page)).skimmed - sk0, pw[3], pw[4]]));
  c("the pace is untouched", (await runs(page)).every((r) => r.k !== "p" || r.p <= 1), JSON.stringify((await runs(page)).map((r) => [r.p, r.ms])));
  c("no page errors", !page._errors, errorsOf(page));
});

scenario("K13 a check ahead every minute: the reading before each check counts", { context: desktop }, async (ctx, c, url) => {
  const page = await openPage(ctx, url);
  await openText(page, "paras.txt", TXT_PARAS);
  await start(page);
  const S = await starts(page);
  let k = 0, driven = 0;
  for (let cyc = 0; cyc < 5; cyc++){
    k = await readScroll(page, S, k, 60, 3, 14400); driven += 3 * 14400;
    await page.clock.runFor(10000); driven += 10000;       /* ten seconds into the next window */
    await goWord(page, S[k + 900]);                        /* a look ahead */
    await page.clock.runFor(10000);
    await goWord(page, S[k]);                              /* back to the same word */
    await settle(page); driven += 2000;
  }
  k = await readScroll(page, S, k, 60, 1, 14400); driven += 14400;   /* one more step, so the last check's reading is credited */
  await settle(page);
  const s = await st(page), tr = await trans(page);
  c("the run keeps every reading second, the checks none", s.run && within(s.run.ms, driven, 1500), JSON.stringify([s.run && s.run.ms, driven]));
  c("five resumes, one run", ofKind(tr, "resume").length >= 1 && (await runs(page)).length === 1, kinds(tr).slice(-70));
  /* the driven pace is not 250: ten seconds of every fourth window are spent before the check,
     and that window still advances by one step — the detector should report what was driven */
  c("the rate is the driven " + (k / driven * 60000).toFixed(0) + " wpm ±8 %", near(s.run.words / s.run.ms * 60000, k / driven * 60000, 8), (s.run.words / s.run.ms * 60000).toFixed(1));
  c("no page errors", !page._errors, errorsOf(page));
});

/* ===== more scenarios above ===== */

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const shared = {};
  for (const sc of scenarios){
    if (ONLY && !ONLY.test(sc.name)) continue;
    console.log("\n" + sc.name);
    const ctx = await b.newContext(Object.assign({}, sc.opts.context || desktop));
    if (sc.opts.stub) await ctx.addInitScript(STUB);
    if (sc.opts.init) await ctx.addInitScript(sc.opts.init);
    const c = (name, ok, detail) => R.check(sc.name.split(" ")[0] + ": " + name, ok, detail);
    try { await sc.fn(ctx, c, url, shared); }
    catch (err){ c("exception", false, String(err && err.stack || err).split("\n").slice(0, 2).join(" ")); }
    await ctx.close();
  }
  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
