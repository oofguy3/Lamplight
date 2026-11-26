/* The screen may sleep (Rest in app.js): with a book open the screen is kept on, until a stretch with no
   touch, key or wheel lets the lock go (ten minutes; shortened here); the next touch takes it back. Read
   aloud keeps it on. A reader who stopped, and whose page then moved (a brush of the hand while they slept),
   is offered the way back to where they stopped when they come back, and goes there with one tap; a move
   of their own (the dock's slider) or a page that never moved offers nothing.
     NODE_PATH=$(npm root -g) node tests/sleep.js */
const { serve, browser, newPage, makeReport } = require("./lib");

/* a wake lock that counts what is asked of it (headless Chromium's own may refuse a request) */
const LOCK = `(() => {
  window.__locks = { req: 0, rel: 0, held: 0 };
  const lock = () => { const l = new EventTarget(); l.released = false;
    l.release = () => { if (!l.released){ l.released = true; window.__locks.rel++; window.__locks.held--; l.dispatchEvent(new Event("release")); } return Promise.resolve(); };
    return l; };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: () => { window.__locks.req++; window.__locks.held++; return Promise.resolve(lock()); } } });
  try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); localStorage.setItem("ll_dictmode", "hold"); } catch(_){}
})();`;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" };
/* the times, short enough for a test and far enough apart for a busy machine: a step of reading every
   0.9 s, a run broken by 2 s still, the screen let go after 4.5 s without a touch */
const FAST = { IDLE: 4500, STILL: 2000, STEP: 300, BUSY_POLL: 400 };
const wait = (page, ms) => page.waitForTimeout(ms);
const lockState = (page) => page.evaluate(() => ({ held: window.__locks.held, active: window.__ll.Wake.active(), resting: window.__ll.Rest.isResting() }));
const top = (page) => page.evaluate(() => window.__ll.Library.topCharOffset());
/* a screen of reading: the touch that scrolls (as the page sees it), the scroll, then the time to read it */
async function readOn(page, screens, ms){
  await page.evaluate((k) => { window.__ll.Rest.active(); window.scrollBy(0, Math.round(innerHeight * k)); }, screens);
  await wait(page, ms);
}
/* a book long enough to read on for a while: sixty paragraphs, each its own */
const LONG = Array.from({ length: 60 }, (_, i) => "Paragraph " + (i + 1) + ". " +
  "The lamp hummed quietly while the rain kept on against the window, and every page turned was one more step into the story. ".repeat(3)).join("\n\n");
async function fresh(b, url){
  const ctx = await b.newContext(PHONE);
  await ctx.addInitScript(LOCK);
  const page = await newPage(ctx, url);
  await page.setInputFiles("#fileInput", { name: "Long night.txt", mimeType: "text/plain", buffer: Buffer.from(LONG) });
  await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 10000, null, { timeout: 30000 });
  await wait(page, 600);
  await page.evaluate((p) => window.__ll.Rest._debug.params(p), FAST);
  return { ctx, page };
}

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); console.log(err.stack); } };

  /* ---------- the lock goes after a while without a touch, and comes back with the next one ---------- */
  await guard("lock", async () => {
    const { ctx, page } = await fresh(b, url);
    const s0 = await lockState(page);
    R.check("a book open: the screen is kept on", s0.held === 1 && s0.active && !s0.resting, JSON.stringify(s0));
    await wait(page, 2500);
    R.check("still kept on before the time is up", (await lockState(page)).active);
    await wait(page, 3200);
    const s1 = await lockState(page);
    R.check("no touch for the whole time: the lock is let go, the phone's own timeout takes over", s1.held === 0 && !s1.active && s1.resting, JSON.stringify(s1));
    await page.touchscreen.tap(6, 420); await wait(page, 300);
    const s2 = await lockState(page);
    R.check("the next touch takes it back", s2.held === 1 && s2.active && !s2.resting, JSON.stringify(s2));
    /* the page shown again counts as coming back too */
    await wait(page, 5800);
    R.check("let go again after another while", !(await lockState(page)).active);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await wait(page, 300);
    R.check("the page shown again takes it back", (await lockState(page)).active);
    /* read aloud keeps it on, and the time starts again when it stops */
    await page.evaluate(() => { window.__realPlaying = window.__ll.Speak.isPlaying; window.__ll.Speak.isPlaying = () => true; });
    await wait(page, 6500);
    R.check("the device voice reading aloud: the screen stays on", (await lockState(page)).active);
    await page.evaluate(() => { window.__ll.Speak.isPlaying = window.__realPlaying; });
    await wait(page, 2500);
    R.check("…and for the whole time after it stops", (await lockState(page)).active);
    await wait(page, 3500);
    R.check("…then it is let go", !(await lockState(page)).active);
    /* a natural voice reads on with the screen off: it does not keep the screen on, and there is no way back to offer */
    await page.touchscreen.tap(6, 420); await wait(page, 200);
    await page.evaluate(() => { const S = window.__ll.Speak; window.__real = { p: S.isPlaying, a: S.activeEngine, i: S.isActive }; S.isPlaying = () => true; S.isActive = () => true; S.activeEngine = () => ({ name: "kokoro" }); });
    await wait(page, 5800);
    const nat = await page.evaluate(() => ({ active: window.__ll.Wake.active(), resting: window.__ll.Rest.isResting(), offer: window.__ll.Rest._debug.offer() }));
    R.check("a natural voice reading: the screen is let go after the time all the same, with no way back to offer", !nat.active && nat.resting && !nat.offer, JSON.stringify(nat));
    await page.evaluate(() => { const S = window.__ll.Speak; S.isPlaying = window.__real.p; S.activeEngine = window.__real.a; S.isActive = window.__real.i; });
    /* Keep the screen awake off: nothing is held at all */
    await page.touchscreen.tap(6, 420); await wait(page, 200);
    await page.evaluate(() => document.getElementById("cWake").click()); await wait(page, 200);
    R.check("Keep the screen awake off: no lock", !(await lockState(page)).active);
    await page.evaluate(() => document.getElementById("cWake").click()); await wait(page, 200);
    R.check("the setting says when the screen sleeps", /^Until ten minutes pass without a touch/.test(await page.$eval("#wakeHint", (h) => h.textContent)) &&
      (await page.$eval("#cWake", (c) => c.getAttribute("aria-describedby"))) === "wakeHint");
    R.check("no page errors (lock)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- the way back to where the reader stopped ---------- */
  await guard("way back", async () => {
    const { ctx, page } = await fresh(b, url);
    /* four screens of reading, then the reader falls asleep on the fifth */
    for (let i = 0; i < 4; i++) await readOn(page, 0.9, 900);
    await page.evaluate(() => window.__ll.Rest.active());
    await page.evaluate(() => window.scrollBy(0, Math.round(innerHeight * 0.9)));
    await wait(page, 900);
    const stopped = await top(page);
    await wait(page, 2300);
    /* a brush of the hand: three screens on, with no touch of the app's controls */
    await page.evaluate(() => { window.__ll.Rest.active(); window.scrollBy(0, Math.round(innerHeight * 3)); });
    await wait(page, 900);
    const brushed = await top(page);
    await wait(page, 5200);
    const o = await page.evaluate(() => ({ resting: window.__ll.Rest.isResting(), offer: window.__ll.Rest._debug.offer() }));
    R.check("asleep: the screen let go, the place where the reading stopped kept", o.resting && o.offer && Math.abs(o.offer.at - stopped) < 5 && brushed - stopped > 1000, JSON.stringify({ o, stopped, brushed }));
    /* coming back: a toast with the way back */
    await page.touchscreen.tap(6, 420); await wait(page, 400);
    const t = await page.evaluate(() => { const el = document.getElementById("toast"); return { on: !!el && el.classList.contains("on"), text: el ? el.textContent : "", btn: el && el.querySelector(".toast-act") ? el.querySelector(".toast-act").textContent : "" }; });
    R.check("coming back: “The page moved after you stopped reading.” with Go back", t.on && /^The page moved after you stopped reading\./.test(t.text) && t.btn === "Go back", JSON.stringify(t));
    await page.click("#toast .toast-act"); await wait(page, 700);
    const back = await top(page);
    R.check("Go back returns to where the reader stopped", Math.abs(back - stopped) < 200, JSON.stringify({ back, stopped }));
    R.check("the offer is used up: nothing is kept for later", (await page.evaluate(() => localStorage.getItem("ll_wayback"))) === null);
    R.check("no page errors (way back)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- the app ended overnight while the screen was off: the offer waits for the book ---------- */
  await guard("way back after a restart", async () => {
    const { ctx, page } = await fresh(b, url);
    for (let i = 0; i < 4; i++) await readOn(page, 0.9, 900);
    await page.evaluate(() => window.__ll.Rest.active());
    await page.evaluate(() => window.scrollBy(0, Math.round(innerHeight * 0.9)));
    await wait(page, 900);
    const stopped = await top(page);
    await wait(page, 2300);
    await page.evaluate(() => { window.__ll.Rest.active(); window.scrollBy(0, Math.round(innerHeight * 3)); });
    await wait(page, 6100);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("ll_wayback") || "null"));
    R.check("asleep with somewhere to go back to: the offer is kept on the device", !!kept && Math.abs(kept.at - stopped) < 5, JSON.stringify({ kept, stopped }));
    /* the phone ends the app; the reader starts it again and opens the book from the library */
    await page.reload({ waitUntil: "load" });
    await wait(page, 1500);
    await page.evaluate((id) => { if (window.__ll.state.mode !== "doc") return window.__ll.Library.openId(id); }, kept.id);
    await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 10000, null, { timeout: 30000 });
    await page.waitForFunction(() => { const el = document.getElementById("toast"); return !!el && el.classList.contains("on") && /page moved/.test(el.textContent); }, null, { timeout: 6000 }).catch(() => {});
    const t = await page.evaluate(() => { const el = document.getElementById("toast"); return { on: !!el && el.classList.contains("on"), text: el ? el.textContent : "" }; });
    R.check("after a restart, the same book reopened: the toast offers the way back", t.on && /^The page moved after you stopped reading\./.test(t.text), JSON.stringify(t));
    await page.click("#toast .toast-act"); await wait(page, 700);
    const back = await top(page);
    R.check("…and Go back goes there", Math.abs(back - stopped) < 200, JSON.stringify({ back, stopped }));
    R.check("…once: the kept offer is gone", (await page.evaluate(() => localStorage.getItem("ll_wayback"))) === null);
    R.check("no page errors (after a restart)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  /* ---------- nothing to offer: the page never moved, or the reader moved it ---------- */
  await guard("nothing to offer", async () => {
    const { ctx, page } = await fresh(b, url);
    for (let i = 0; i < 5; i++) await readOn(page, 0.9, 900);
    await wait(page, 5200);
    const o1 = await page.evaluate(() => ({ resting: window.__ll.Rest.isResting(), offer: window.__ll.Rest._debug.offer() }));
    R.check("asleep where they stopped reading: nothing to offer", o1.resting && !o1.offer, JSON.stringify(o1));
    await page.touchscreen.tap(6, 420); await wait(page, 400);
    R.check("…and no toast on coming back", !(await page.evaluate(() => { const el = document.getElementById("toast"); return !!el && el.classList.contains("on") && /page moved/.test(el.textContent); })));
    /* reading again, a still spell, then a jump with the dock's slider: the reader's own move */
    for (let i = 0; i < 4; i++) await readOn(page, 0.9, 900);
    await wait(page, 2300);
    await page.evaluate(() => window.__ll.PhoneBar.away(false)); await wait(page, 400);      /* the strip, sent away by the scrolls */
    await page.tap("#dockBtn"); await wait(page, 300);
    await page.evaluate(() => { const r = document.getElementById("dockPos"); r.value = "60"; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); });
    await wait(page, 900);
    await page.evaluate(() => window.__ll.PhoneBar.closeDock({ focus: false }));
    await wait(page, 5200);
    const o2 = await page.evaluate(() => ({ resting: window.__ll.Rest.isResting(), offer: window.__ll.Rest._debug.offer(), steps: window.__ll.Rest._debug.steps().slice(-2).map((s) => s.nav) }));
    R.check("a jump with the dock's slider is the reader's own: nothing to offer", o2.resting && !o2.offer && o2.steps[o2.steps.length - 1] === true, JSON.stringify(o2));
    R.check("no page errors (nothing to offer)", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });

  await b.close(); server.close();
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
