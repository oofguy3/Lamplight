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
function fixtures(){ return fs.readdirSync(path.join(__dirname, "fixtures")).filter((f) => /\.(txt|md|html|epub|docx|pdf)$/.test(f)); }
/* tiny assertion + reporter */
function makeReport(){
  const results = [];
  return {
    check(name, ok, detail){ results.push({ name, ok: !!ok, detail }); console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || !detail ? "" : "  -- " + detail)); return !!ok; },
    done(){ const fails = results.filter((r) => !r.ok); console.log("\n" + (results.length - fails.length) + "/" + results.length + " checks passed"); if (fails.length){ console.log("Failures:"); fails.forEach((f) => console.log(" - " + f.name + (f.detail ? ": " + f.detail : ""))); } return fails.length ? 1 : 0; },
    results
  };
}
module.exports = { serve, browser, newPage, openFixture, fixtures, makeReport, ROOT };
