/* "About this text": the panel opens on `i` with the counts, the reading level and the hardest
   words; a word opens the dictionary; PDFs work; the syllable and sentence heuristics; a
   200 000-word text is counted without freezing the page; screenshots at two widths and themes. */
const path = require("path");
const { serve, browser, newPage, openFixture, makeReport } = require("./lib");
const SHOTS = process.env.ABOUT_SHOTS || path.join(require("os").tmpdir(), "lamplight-about-shots");
const fs = require("fs");

async function openAbout(page){
  await page.keyboard.press("i");
  await page.waitForFunction(() => document.getElementById("side").classList.contains("open") && document.querySelector("#sideBody .about-tile"), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector("#aboutWords .about-word") || /No unusual|Couldn/.test(document.getElementById("aboutWords").textContent), null, { timeout: 30000 });
}
function tiles(page){
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#sideBody .about-tile").forEach((t) => { out[t.querySelector("span").textContent] = t.querySelector("b").textContent; });
    return out;
  });
}
const num = (s) => parseFloat(String(s || "").replace(/,/g, ""));

(async () => {
  const { server, url } = await serve();
  const b = await browser();
  const R = makeReport();
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (_){}

  /* 1. a Markdown document: the tiles, the level, the hardest words */
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  let page = await newPage(ctx, url);
  await openFixture(page, "sample.md");
  await openAbout(page);
  R.check("panel title", (await page.$eval("#sideTitle", (e) => e.textContent)) === "About this text");
  let t = await tiles(page);
  R.check("words > 200", num(t["Words"]) > 200, JSON.stringify(t));
  R.check("unique >= 100", num(t["Unique words"]) >= 100, t["Unique words"]);
  R.check("unique <= words", num(t["Unique words"]) <= num(t["Words"]));
  R.check("sentences > 20", num(t["Sentences"]) > 20, t["Sentences"]);
  R.check("reading time tile", /min|hour|h\b|minute/.test(t["Reading time at your speed"] || ""), t["Reading time at your speed"]);
  R.check("dialogue tile shown (the sample has dialogue)", /^\d+%$/.test(t["Dialogue"] || ""), t["Dialogue"]);
  const level = await page.evaluate(() => ({ score: document.querySelector(".about-score b").textContent, band: document.querySelector(".about-score span").textContent, notes: Array.from(document.querySelectorAll(".about-note")).map((n) => n.textContent).join(" | ") }));
  R.check("reading ease 0..100", num(level.score) >= 0 && num(level.score) <= 100, level.score);
  R.check("band label", /^(Very easy|Easy|Fairly easy|Standard|Fairly difficult|Difficult|Very difficult)$/.test(level.band), level.band);
  R.check("grade + age + second opinion", /grade \d+ · about age \d+–\d+/.test(level.notes) && /Coleman–Liau/.test(level.notes), level.notes);
  R.check("scale marker is decoration", await page.$eval(".about-scale", (e) => e.getAttribute("aria-hidden") === "true" && !!e.querySelector("i")));
  const vocab = await page.evaluate(() => Array.from(document.querySelectorAll("#sideBody .about-tile span")).map((s) => s.textContent).filter((s) => /richness|only once/.test(s)));
  R.check("vocabulary tiles", vocab.length === 2 && /\((Simple|Moderate|Rich|Very rich)\)|richness \(\d\.\d\d\)/.test(vocab.join(" ")), vocab.join(" | "));
  const hard = await page.$$eval("#aboutWords .about-word", (els) => els.map((e) => ({ w: e.querySelector(".w").textContent, n: e.querySelector(".n").textContent, r: e.querySelector(".r").textContent })));
  R.check("hardest words listed (≤ 30)", hard.length > 0 && hard.length <= 30, String(hard.length));
  R.check("hardest includes photosynthesis", hard.some((h) => h.w === "photosynthesis"), hard.map((h) => h.w).join(", "));
  R.check("hardest includes extraordinary", hard.some((h) => h.w === "extraordinary"), hard.map((h) => h.w).join(", "));
  R.check("each word has a count and a rarity label", hard.every((h) => /^×\d+$/.test(h.n) && /^(very rare|rare|uncommon)$/.test(h.r)), JSON.stringify(hard[0]));
  R.check("no names / short words among them", hard.every((h) => h.w.length >= 4 && h.w === h.w.toLowerCase()), hard.map((h) => h.w).join(", "));
  const finds = await page.$$eval("#aboutWords .about-find", (els) => els.map((e) => e.getAttribute("aria-label")));
  R.check("find buttons are labelled", finds.length === hard.length && finds.every((l) => /^Find “.+” in the text$/.test(l)), finds[0]);
  const foot = await page.evaluate(() => ({ chip: (document.querySelector("#sideFoot .chip") || {}).textContent, note: (document.querySelector("#sideFoot .about-foot-note") || {}).textContent }));
  R.check("footer copy chip + note", foot.chip === "Copy" && /Counts are from the text as shown/.test(foot.note || ""), JSON.stringify(foot));
  const menu = await page.evaluate(() => { document.getElementById("more").click(); const items = Array.from(document.querySelectorAll("#moreMenu button")).map((b) => b.textContent); document.getElementById("more").click(); return items; });
  R.check("menu entry with the I key", menu.some((m) => /^About this text\s*I$/.test(m)), menu.join(" / "));
  /* screenshots: desktop, day then dusk; the top of the panel, then the word list */
  await page.waitForTimeout(400);                       /* the drawer's slide-in */
  await page.screenshot({ path: path.join(SHOTS, "about-desktop-day.png") });
  await page.evaluate(() => { document.getElementById("sideBody").scrollTop = 1e6; });
  await page.screenshot({ path: path.join(SHOTS, "about-desktop-day-words.png") });
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="dusk"]').click());
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(SHOTS, "about-desktop-dusk-words.png") });
  await page.evaluate(() => { document.getElementById("sideBody").scrollTop = 0; });
  await page.screenshot({ path: path.join(SHOTS, "about-desktop-dusk.png") });
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="day"]').click());

  /* 2. the copy summary */
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url.replace(/\/$/, "") }).catch(() => null);
  await page.click("#sideFoot .chip");
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
  const toast = await page.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
  R.check("copy writes a summary", /^About “.+”\nWords: \d/.test(clip) && /Hardest words: /.test(clip) && /Flesch/.test(clip), JSON.stringify(clip.slice(0, 80)) + " toast=" + toast);

  /* 3. a word opens the dictionary; Find opens search with the word */
  await page.click('#aboutWords .about-word[data-w="photosynthesis"]');
  await page.waitForFunction(() => document.getElementById("dictCard").classList.contains("open") && /photosynthesis/i.test((document.querySelector("#dictCard .term") || {}).textContent || ""), null, { timeout: 25000 }).catch(() => null);
  const term = await page.$eval("#dictCard", (c) => c.classList.contains("open") ? (c.querySelector(".term") || {}).textContent : "closed");
  R.check("word opens the dictionary card", /photosynthesis/i.test(String(term)), String(term));
  await page.evaluate(() => document.querySelector("#dictCard .x") && document.querySelector("#dictCard .x").click());
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.getElementById("side").classList.contains("open")))) await openAbout(page);
  await page.click('#aboutWords .about-find[data-find="extraordinary"]');
  await page.waitForFunction(() => document.querySelector("#findInput") && /match/.test((document.getElementById("findStatus") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => null);
  const search = await page.evaluate(() => ({ title: document.getElementById("sideTitle").textContent, q: (document.getElementById("findInput") || {}).value, status: (document.getElementById("findStatus") || {}).textContent }));
  R.check("find opens search with the word", search.title === "Search" && search.q === "extraordinary" && /\d+ match/.test(search.status), JSON.stringify(search));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);                       /* the drawer's close transition; focus leaves the search box */
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  /* 4. the same document again comes from the cache: drawn at once, no "Reading the text…" */
  await page.keyboard.press("i");
  await page.waitForTimeout(60);
  R.check("cached result draws at once", await page.evaluate(() => !!document.querySelector("#sideBody .about-tile") && !document.getElementById("aboutStatus")));
  await page.keyboard.press("Escape");
  R.check("no page errors (markdown)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();

  /* 5. a PDF */
  page = await newPage(ctx, url);
  await openFixture(page, "sample.pdf");
  await openAbout(page);
  t = await tiles(page);
  R.check("pdf: words > 100", num(t["Words"]) > 100, JSON.stringify(t));
  R.check("pdf: format in the header", await page.$eval(".about-doc", (e) => /PDF/.test(e.textContent)));
  R.check("pdf: no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();

  /* 6. the heuristics, through the test hook */
  page = await newPage(ctx, url);
  const syl = await page.evaluate(() => ["table", "quietly", "the", "photosynthesis", "extraordinary", "lamp", "whale", "little", "wanted", "makes", "boxes", "going", "player", "people", "radio", "nation", "every", "science", "agreed", "friend", "eyes", "bye"].map((w) => [w, window.llAbout.syllables(w)]));
  const S = Object.fromEntries(syl);
  R.check("syllables: table=2 quietly=3 the=1 photosynthesis=5 lamp=1", S.table === 2 && S.quietly === 3 && S.the === 1 && S.photosynthesis === 5 && S.lamp === 1, JSON.stringify(S));
  R.check("syllables: extraordinary=5 or 6", S.extraordinary === 5 || S.extraordinary === 6, String(S.extraordinary));
  R.check("syllables: silent endings", S.whale === 1 && S.little === 2 && S.wanted === 2 && S.makes === 1 && S.boxes === 2 && S.agreed === 2 && S.bye === 1 && S.eyes === 1, JSON.stringify(S));
  R.check("syllables: vowel pairs", S.going === 2 && S.player === 2 && S.people === 2 && S.radio === 3 && S.nation === 2 && S.every === 2 && S.science === 2 && S.friend === 1, JSON.stringify(S));
  const small = await page.evaluate(() => window.llAbout.stats("The cat sat. The cat ran!").then((s) => ({ words: s.words, unique: s.unique, sentences: s.sentences, hapax: s.hapax, flesch: s.flesch })));
  R.check("stats: 'The cat sat. The cat ran!' = 2 sentences, 6 words", small.sentences === 2 && small.words === 6, JSON.stringify(small));
  R.check("stats: distinct forms the/cat/sat/ran = 4 (the spec's '3' miscounts)", small.unique === 4, JSON.stringify(small));
  const sents = await page.evaluate(() => [
    window.llAbout.sentences("Mr. Smith went to Washington. He met Dr. Jones, e.g. at 3.5 p.m. and left."),
    window.llAbout.sentences("“Wait!” he shouted. But the train had gone… and that was that."),
    window.llAbout.sentences("No full stop at the end"),
    window.llAbout.sentences("1. A numbered item")
  ]);
  R.check("sentences: abbreviations, decimals, quotes, ellipsis, bare lines", sents[0] === 2 && sents[1] === 2 && sents[2] === 1 && sents[3] === 1, JSON.stringify(sents));
  const dlg = await page.evaluate(() => window.llAbout.stats("She said, “one two three.” Then four five.\n\n\"Six seven\" eight.").then((s) => ({ words: s.words, dialogue: s.dialogue, paragraphs: s.paragraphs })));
  R.check("dialogue share counts the words in quotes", dlg.words === 11 && dlg.dialogue === 5 && dlg.paragraphs === 2, JSON.stringify(dlg));

  /* 7. a 200 000-word text: done within 4 s, frames keep coming */
  const big = await page.evaluate(async () => {
    const sent = ["The lamp hums quietly as she turns the page.", "Nobody could have predicted the extraordinary consequences of that small, deliberate decision.", "He asked, “Are you coming?”", "She did not answer; the misunderstanding between them was older than the house."];
    const out = []; let n = 0, i = 0;
    while (n < 200000){ const s = sent[i % 4] + " Item" + (i % 3000) + " again."; out.push(s); n += s.split(" ").length; i++; if (i % 8 === 0) out.push("\n\n"); }
    const text = out.join(" ");
    let frames = 0, on = true; const tick = () => { frames++; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const t0 = performance.now();
    const s = await window.llAbout.stats(text);
    const ms = performance.now() - t0; on = false;
    return { ms, frames, words: s.words, unique: s.unique, sentences: s.sentences, flesch: s.flesch };
  });
  console.log("       200k-word text: " + JSON.stringify(big));
  R.check("200k words counted within 4 s", big.words >= 200000 && big.ms < 4000, JSON.stringify(big));
  R.check("page stays responsive while counting", big.frames >= 3, "frames=" + big.frames + " ms=" + Math.round(big.ms));
  R.check("no page errors (hooks)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await ctx.close();

  /* 8. phone width: day and dusk */
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await newPage(phone, url);
  await openFixture(page, "sample.md");
  await page.evaluate(() => window.llAbout.openPanel());
  await page.waitForFunction(() => document.querySelector("#aboutWords .about-word"), null, { timeout: 30000 });
  await page.waitForTimeout(350);
  const fits = await page.evaluate(() => document.getElementById("side").scrollWidth <= window.innerWidth + 1 && document.getElementById("sideBody").scrollWidth <= document.getElementById("sideBody").clientWidth + 1);
  R.check("phone: no horizontal overflow in the panel", fits);
  await page.screenshot({ path: path.join(SHOTS, "about-phone-day.png") });
  await page.evaluate(() => document.querySelector('#themeChips [data-theme="dusk"]').click());
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(SHOTS, "about-phone-dusk.png") });
  await page.evaluate(() => { document.getElementById("sideBody").scrollTop = 1e6; });
  await page.screenshot({ path: path.join(SHOTS, "about-phone-dusk-words.png") });
  R.check("no page errors (phone)", !(page._errors || []).length, (page._errors || []).join(" | "));
  await page.close();
  await phone.close();

  await b.close(); server.close();
  console.log("screenshots in " + SHOTS);
  process.exit(R.done());
})().catch((err) => { console.error(err); process.exit(1); });
