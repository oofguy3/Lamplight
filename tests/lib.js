/* Shared harness for Lamplight's browser tests: a static server for the repo, a headless
   Chromium (Playwright), and helpers to open the sample documents. No build step needed:
     NODE_PATH=$(npm root -g) node tests/smoke.js
   Chromium comes from Playwright's own install (PLAYWRIGHT_BROWSERS_PATH honoured). */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain" };

/* serve(port, opts): opts.overrides = { "/sw.js": () => "text" } lets a test hand out a modified file
   (used to simulate a new release for the update toast); returns { server, url, overrides } */
function serve(port, opts){
  const overrides = (opts && opts.overrides) || {};
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      if (overrides[p]){
        const body = overrides[p](req);
        res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "text/plain", "Cache-Control": "no-store" });
        res.end(body); return;
      }
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port || 0, "127.0.0.1", () => resolve({ server: srv, url: "http://127.0.0.1:" + srv.address().port + "/", overrides }));
  });
}
async function browser(opts){
  return chromium.launch(Object.assign({ headless: true }, opts || {}));
}
async function newPage(ctx, url, o){
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page._errors = (page._errors || []).concat([String(e)]); });
  page.on("console", (m) => { if (m.type() === "error") page._consoleErrors = (page._consoleErrors || []).concat([m.text()]); });
  await page.goto(url, { waitUntil: "load" });
  return page;
}
/* open a sample document through the hidden file input and wait until it is rendered */
async function openFixture(page, name){
  const file = path.join(__dirname, "fixtures", name);
  await page.setInputFiles("#fileInput", file);
  const isPdf = /\.pdf$/i.test(name);
  if (isPdf) await page.waitForFunction(() => /^(block|flex)$/.test(document.getElementById("pdf").style.display) && document.querySelector("#pdf canvas"), null, { timeout: 30000 });   /* flex: a two-page spread */
  else await page.waitForFunction(() => document.getElementById("docView").style.display === "block" && document.getElementById("doc").textContent.length > 100, null, { timeout: 30000 });
  await page.waitForTimeout(150);
}
/* click an entry of the More menu once it has finished opening. It drops in over 200 ms; a click
   while it still moves makes Playwright retry with a scrollIntoView of its own, which on a desktop
   scrolls the page under the sticky bar, and the menu closes on a scroll as it should (it hangs
   from the bar) */
async function menuItem(page, label){
  await page.waitForSelector("#moreMenu.open", { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById("moreMenu").getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
  await page.click("#moreMenu button:has-text('" + label + "')");
}
function fixtures(){ return fs.readdirSync(path.join(__dirname, "fixtures")).filter((f) => /\.(txt|md|html|epub|docx|pdf)$/.test(f)); }
/* show the day or the night half of the reader's pair ("day" or "night": Day or Dusk on a fresh
   profile) with Settings › Theme's Day/Night switch, clicked inside the page without opening the
   sheet, so the panel, the word card, zen or the print layout a suite has open stays as it is
   (opening the sheet would close it). It is the switch's own click: the theme cross-fades in a
   moment later (unless motion is reduced), and with switching on it holds as a tap there would */
function dayNight(page, which){
  return page.evaluate((w) => document.querySelector('#sDN [data-dn="' + w + '"]').click(), which);
}
/* a colour as getComputedStyle reports it, for the contrast checks: { rgb: [r, g, b] on 0-255, unrounded,
   a: 0-1 }, or null when it can't be read. It reads rgb()/rgba(), #rrggbb, color(srgb r g b / α), which
   a color-mix in srgb computes to, and oklab(L a b / α), which a color-mix in oklab computes to (the dark
   tone mixes its tints that way). OKLab goes to linear sRGB with Björn Ottosson's matrices, then through
   the sRGB curve, clamped. The alpha is left to the caller, which lays the colour over what is behind it.
   The function uses nothing from outside itself, so a check that runs in the page can rebuild it from
   PARSE_COLOR, its source. */
function parseColor(css){
  const s = String(css == null ? "" : css).trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(s);
  if (hex){ const h = parseInt(hex[1], 16); return { rgb: [(h >> 16) & 255, (h >> 8) & 255, h & 255], a: 1 }; }
  const f = /^(rgba?|color|oklab)\(\s*(srgb\s+)?([^()]*?)\s*\)$/.exec(s);
  if (!f || (f[1] === "color") !== !!f[2]) return null;
  /* three numbers, then an alpha after a comma (rgba) or a slash, which may be a percentage */
  const parts = f[3].split(/\s*[,/]\s*|\s+/);
  const num = (x) => /^[-+]?(\d*\.)?\d+(e[-+]?\d+)?$/.test(x) ? Number(x) : NaN;
  const v = parts.slice(0, 3).map(num);
  const a = parts.length === 4 ? (/%$/.test(parts[3]) ? num(parts[3].slice(0, -1)) / 100 : num(parts[3])) : 1;
  if ((parts.length !== 3 && parts.length !== 4) || v.concat(a).some(isNaN)) return null;
  if (f[1] === "color") return { rgb: v.map((c) => c * 255), a };
  if (f[1] !== "oklab") return { rgb: v, a };
  const [L, A, B] = v;
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), k = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
  const enc = (x) => 255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
  return { rgb: [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * k, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * k, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * k].map(enc), a };
}
/* parseColor's source, for checks that run in the page: a helper string passed to eval there embeds
   `const parseColor = ${PARSE_COLOR};`, and a closure takes it as an argument and evals it */
const PARSE_COLOR = parseColor.toString();
/* tiny assertion + reporter */
function makeReport(){
  const results = [];
  return {
    check(name, ok, detail){ results.push({ name, ok: !!ok, detail }); console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || !detail ? "" : "  -- " + detail)); return !!ok; },
    done(){ const fails = results.filter((r) => !r.ok); console.log("\n" + (results.length - fails.length) + "/" + results.length + " checks passed"); if (fails.length){ console.log("Failures:"); fails.forEach((f) => console.log(" - " + f.name + (f.detail ? ": " + f.detail : ""))); } return fails.length ? 1 : 0; },
    results
  };
}
module.exports = { serve, browser, newPage, openFixture, menuItem, fixtures, dayNight, makeReport, parseColor, PARSE_COLOR, ROOT };
