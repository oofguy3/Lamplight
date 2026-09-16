/* Contrast audit of every built-in theme (no browser needed):
     node tests/themes.js
   Text, secondary text and the accent must each read on the page and on the panel — 4.5:1 or
   better (WCAG AA), 7:1 is the aim. The table is read straight out of app.js. */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const m = /var THEMES = (\{[\s\S]*?\n  \});/.exec(src);
if (!m){ console.log("FAIL  the THEMES table was not found in app.js"); process.exit(1); }
const THEMES = new Function("return " + m[1])();

function rgb(h){ h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function luminance(h){ const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b){ const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

const PAIRS = [["ink", "bg"], ["ink", "panel"], ["muted", "bg"], ["muted", "panel"], ["accent", "bg"], ["accent", "panel"]];
const ORIGINAL = ["day", "sepia", "mist", "rose", "dusk", "forest", "ocean", "plum", "ink", "hicon", "hidark"];
const HEX = /^#[0-9a-f]{6}$/i;
let failures = [], pairs = 0;

console.log("theme".padEnd(11) + PAIRS.map((p) => (p[0] + "/" + p[1]).padStart(14)).join(""));
for (const [id, t] of Object.entries(THEMES)){
  for (const k of ["bg", "ink", "muted", "panel", "line", "accent"]) if (!HEX.test(t[k] || "")) failures.push(id + ": " + k + " is not a 6-digit hex colour (" + t[k] + ")");
  if (typeof t.name !== "string" || !t.name.trim()) failures.push(id + ": no name");
  const cells = PAIRS.map(([a, b]) => {
    const r = contrast(t[a], t[b]); pairs++;
    if (r < 4.5) failures.push(id + ": " + a + "/" + b + " is " + r.toFixed(2) + ":1");
    return (r.toFixed(2) + (r < 4.5 ? " LOW" : r >= 7 ? " AAA" : " AA ")).padStart(14);
  });
  console.log(id.padEnd(11) + cells.join(""));
}
const ids = Object.keys(THEMES);
for (const id of ORIGINAL) if (!THEMES[id]) failures.push("built-in theme “" + id + "” is missing");
if (ids.length < 25) failures.push("only " + ids.length + " themes (11 original + at least 14 new expected)");

console.log("\n" + ids.length + " themes, " + (pairs - failures.filter((f) => /:1$/.test(f)).length) + "/" + pairs + " pairs at 4.5:1 or better");
if (failures.length){ console.log("Failures:"); failures.forEach((f) => console.log(" - " + f)); }
process.exit(failures.length ? 1 : 0);
