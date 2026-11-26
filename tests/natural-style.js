/* How the natural voices say each clip (audiobook.js natStyle, natShape): a pause after it that follows the text (a
   comma, a sentence, a paragraph), a flatter Piper for "says evenly", Best's characters cast from its best-graded
   voices (a man gets Fenrir or Michael, not Adam), the model's own silence trimmed with the pause added after, and
   the Expression setting followed (Off: no liveliness).  NODE_PATH=$(npm root -g) node tests/natural-style.js */
const fs = require("fs"), path = require("path");
const { serve, browser, newPage, makeReport } = require("./lib");

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  const guard = async (name, fn) => { try { await fn(); } catch (err){ R.check(name + " (exception)", false, String(err).split("\n")[0]); console.log(err.stack); } };
  await guard("styles", async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem("ll_tips", "seen"); localStorage.setItem("ll_tip_doc", "1"); } catch (e){} });
    const page = await newPage(ctx, url);
    await page.setInputFiles("#fileInput", { name: "Safe Place.txt", mimeType: "text/plain", buffer: fs.readFileSync(path.join(__dirname, "fixtures", "speakers", "dialogue.txt")) });
    await page.waitForFunction(() => document.getElementById("doc").textContent.length > 500, null, { timeout: 30000 });
    await page.evaluate(() => window.__ll.need(["audiobook"]));
    await page.waitForFunction(() => !!window.llAudiobook, null, { timeout: 30000 });
    const plan = (key) => page.evaluate(async (key) => {
      const p = await window.llAudiobook.natPlan(key), rec = p.rec[key] || {};
      return { cast: Object.fromEntries(p.cast.map((c) => [c.name, rec[c.key]])), narrator: p.narrator, clips: p.clips.map((c) => ({ text: c.text, voice: c.voice, style: c.style })) };
    }, key);
    const kok = await plan("kokoro");
    R.check("Best: the two men get the best-graded men's voices (Fenrir, Michael), and no Adam", kok.cast.Pony === "am_fenrir" && kok.cast.Giraffy === "am_michael" && !Object.values(kok.cast).includes("am_adam"), JSON.stringify(kok.cast));
    const find = (p, re) => p.clips.find((c) => re.test(c.text));
    const pip = await plan("piper");
    const comma = find(pip, /^Giraffy,$/), sent = find(pip, /^Why is the spoon smoking\?/), para = find(pip, /^Something in the Safe Place kitchen/);
    R.check("a pause that follows the text: after “Giraffy,” 0.18 s, after a sentence 0.32 s, after a paragraph 0.67 s",
      comma && sent && para && comma.style.pause === 0.18 && sent.style.pause === 0.32 && para.style.pause === 0.67, JSON.stringify([comma && comma.style, sent && sent.style, para && para.style]));
    R.check("“Giraffy,” Pony says evenly: Piper says it flatter (noise 0.45) and a touch slower", comma.style.noise === 0.45 && comma.style.speed < 1 && sent.style.noise === 0.6, JSON.stringify(comma.style));
    const shout = find(pip, /^He was gone for forty minutes!/);
    R.check("a line that ends in ! is said louder than the narration", shout && shout.style.gain === 1 && para.style.gain === 0.9, JSON.stringify(shout && shout.style));
    R.check("every clip has a style in its key", pip.clips.every((c) => c.style && /^s2\|/.test(c.style.sig)));
    /* the shaping: 0.3 s of silence, 0.5 s of sound, 0.4 s of silence → the sound, 40 ms either side, then the pause */
    const sh = await page.evaluate(() => {
      const rate = 24000, x = new Float32Array(Math.round(1.2 * rate));
      for (let i = Math.round(0.3 * rate); i < Math.round(0.8 * rate); i++) x[i] = 0.5 * Math.sin(i / 10);
      const out = window.llAudiobook.natShape(x, rate, { gain: 0.9, pause: 0.32 });
      let peak = 0; for (let i = 0; i < out.speech; i++) peak = Math.max(peak, Math.abs(out.samples[i]));
      let tail = 0; for (let i = out.speech; i < out.samples.length; i++) tail = Math.max(tail, Math.abs(out.samples[i]));
      return { speech: out.speech / rate, total: out.samples.length / rate, peak, tail, first: Math.abs(out.samples[0]) };
    });
    R.check("the model's silence trimmed (0.5 s of sound kept with 40 ms either side), the pause added after, the loudness scaled",
      Math.abs(sh.speech - 0.58) < 0.01 && Math.abs(sh.total - 0.9) < 0.01 && Math.abs(sh.peak - 0.45) < 0.01 && sh.tail === 0 && sh.first === 0, JSON.stringify(sh));
    /* a clip made end to end (natClip) by a stand-in model that returns 0.3 s of silence, 0.4 s of sound and 0.3 s of
       silence: the model is asked for the style's speed and liveliness, and the clip is the sound plus its pause */
    const made = await page.evaluate(async (st) => {
      const asked = [], m = { ready: true, loaded: "", jobs: {}, seq: 0, w: { postMessage(msg){
        asked.push({ speed: msg.speed, noise: msg.noise, noiseW: msg.noiseW, text: msg.text });
        setTimeout(() => {
          const rate = 22050, x = new Float32Array(rate);
          for (let i = Math.round(0.3 * rate); i < Math.round(0.7 * rate); i++) x[i] = 0.5 * Math.sin(i / 8);
          const j = m.jobs[msg.id]; delete m.jobs[msg.id]; j.res({ samples: x, sampleRate: rate, ms: 5 });
        }, 10);
      } } };
      const text = "Giraffy,", clip = { text, voice: "137", parts: [{ unit: 0, s: 0, e: text.length }], style: st };
      const r = await window.llAudiobook.natClip(m, { clip });
      const head = new DataView(await r.blob.slice(0, 44).arrayBuffer());
      return { asked, secs: (r.blob.size - 44) / 2 / head.getUint32(24, true), times: r.times, type: r.blob.type };
    }, comma.style);
    R.check("a clip made end to end: the model asked for the style's speed and liveliness, the clip the sound (0.48 s) and its pause (0.18 s), highlighted over the sound only",
      made.asked.length === 1 && made.asked[0].speed === comma.style.speed && made.asked[0].noise === 0.45 && made.asked[0].noiseW === 0.5 &&
      Math.abs(made.secs - 0.66) < 0.01 && made.times.length === 1 && Math.abs(made.times[0].b - 0.48) < 0.01 && made.type === "audio/wav", JSON.stringify(made));
    /* Expression Off: no liveliness and no change of pace, the pauses still follow the text */
    await page.evaluate(() => localStorage.setItem("ll_tts_expr", "off"));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    const lib = await page.evaluate(() => window.__ll.Library.books()[0] && window.__ll.Library.books()[0].id);
    await page.evaluate((id) => window.__ll.Library.openId(id), lib);
    await page.waitForFunction(() => document.getElementById("doc").textContent.length > 500, null, { timeout: 30000 });
    await page.evaluate(() => window.__ll.need(["audiobook"]));
    await page.waitForFunction(() => !!window.llAudiobook, null, { timeout: 30000 });
    const off = await plan("piper"), oc = find(off, /^Giraffy,$/), os = find(off, /^Something in the Safe Place kitchen/);
    R.check("Expression Off: the voice's pace and a plain liveliness, the pauses still follow the text", oc && oc.style.speed === 1 && oc.style.noise === 0.5 && oc.style.noiseW === 0.333 && oc.style.pause === 0.18 && os.style.pause === 0.67, JSON.stringify(oc && oc.style));
    R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
    await ctx.close();
  });
  await b.close(); server.close();
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
