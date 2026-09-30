/* Contrast audit of every built-in theme (no browser needed):
     node tests/themes.js
   Every pair the interface relies on must read at 4.5:1 or better (WCAG AA; 7:1 is the aim):
   text, secondary text, the accent and the lamp on the page, the panel and the raised surface
   (the table's `raise`, which applyTheme uses as it stands); the panel colour (--on-fill) on a lamp
   and on an accent fill; the text on the soft lamp and accent tints (--lamp-soft is 14 % lamp on
   the panel, --accent-soft 16 % accent over the raised surface; 16 % and 18 % over the raised
   surface in a dark theme), since text on those pills is
   always --ink; and the toast, which is inverse (the page colour on the text colour). Two
   boundaries need 3:1: the accent border of a chosen control against its own --accent-soft fill,
   and the control edge (--edge, the secondary text) on the raised surface, which the muted/raise
   text pair already holds to 4.5:1.
   The table and the picker groups are read straight out of app.js; every theme needs a family
   (warm, cool or neutral) and must sit in exactly one picker group. */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const m = /var THEMES = (\{[\s\S]*?\n  \});/.exec(src);
if (!m){ console.log("FAIL  the THEMES table was not found in app.js"); process.exit(1); }
const THEMES = new Function("return " + m[1])();
const g = /var THEME_GROUPS = (\{[\s\S]*?\n  \});/.exec(src);
const GROUPS = g ? new Function("return " + g[1])() : null;

function rgb(h){ h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function luminance(h){ const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b){ const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/* app.js's mix(): the sRGB blend color-mix() also makes */
function mix(a, b, t){ const A = rgb(a), B = rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
const HICON = ["hicon", "hidark"];

/* [text, surface, minimum]; the surfaces "lampSoft" and "accentSoft" are the design tokens' tints */
const TEXT = 4.5, EDGE = 3;
const PAIRS = [
  ["ink", "bg"], ["ink", "panel"], ["ink", "raise"],
  ["muted", "bg"], ["muted", "panel"], ["muted", "raise"],
  ["accent", "bg"], ["accent", "panel"], ["accent", "raise"],
  ["lamp", "bg"], ["lamp", "panel"], ["lamp", "raise"],
  ["panel", "lamp"], ["panel", "accent"],
  ["ink", "lampSoft"], ["ink", "accentSoft"],
  ["bg", "ink"],
  ["accent", "accentSoft", EDGE]
].map(([a, b, min]) => [a, b, min || TEXT]);
const LABEL = { "panel/lamp": "onfill/lamp", "panel/accent": "onfill/acc", "accent/accentSoft": "acc/accSoft", "ink/accentSoft": "ink/accSoft", "ink/lampSoft": "ink/lampSoft", "bg/ink": "toast" };
const ORIGINAL = ["day", "sepia", "mist", "rose", "dusk", "forest", "ocean", "plum", "ink", "hicon", "hidark"];
const FAMILIES = ["warm", "cool", "neutral"];
const HEX = /^#[0-9a-f]{6}$/i;
let failures = [], pairs = 0, low = 0;

const head = PAIRS.map(([a, b, min]) => { const k = a + "/" + b; return (min === EDGE ? "edge " : "") + (LABEL[k] || k); });
console.log("theme".padEnd(11) + head.map((h) => h.slice(0, 12).padStart(13)).join(""));
for (const [id, t0] of Object.entries(THEMES)){
  for (const k of ["bg", "ink", "muted", "panel", "raise", "line", "accent", "lamp"]) if (!HEX.test(t0[k] || "")) failures.push(id + ": " + k + " is not a 6-digit hex colour (" + t0[k] + ")");
  if (typeof t0.name !== "string" || !t0.name.trim()) failures.push(id + ": no name");
  if (FAMILIES.indexOf(t0.family) < 0) failures.push(id + ": family is " + t0.family + " (warm, cool or neutral)");
  if (HICON.includes(id) && t0.raise !== t0.panel) failures.push(id + ": a high-contrast theme's raised surface is its panel");
  if (!HEX.test(t0.raise || "")) continue;
  /* the dark tone's tints are a little stronger and sit on the raised surface (app.css :root[data-tone="dark"]) */
  const dark = !HICON.includes(id) && luminance(t0.bg) < 0.18;
  const t = Object.assign({}, t0, dark ? { lampSoft: mix(t0.raise, t0.lamp, 0.16), accentSoft: mix(t0.raise, t0.accent, 0.18) }
                                       : { lampSoft: mix(t0.panel, t0.lamp, 0.14), accentSoft: mix(t0.raise, t0.accent, 0.16) });
  const cells = PAIRS.map(([a, b, min]) => {
    const r = contrast(t[a], t[b]); pairs++;
    if (r < min){ low++; failures.push(id + ": " + a + "/" + b + " is " + r.toFixed(2) + ":1 (needs " + min + ":1)"); }
    return (r.toFixed(2) + (r < min ? " LOW" : r >= 7 ? " AAA" : "    ")).padStart(13);
  });
  console.log(id.padEnd(11) + cells.join(""));
}
const ids = Object.keys(THEMES);
for (const id of ORIGINAL) if (!THEMES[id]) failures.push("built-in theme “" + id + "” is missing");
if (ids.length < 25) failures.push("only " + ids.length + " themes (11 original + at least 14 new expected)");
/* the picker: light, dark and colour groups (high contrast is HICON), each built-in in exactly one */
if (!GROUPS) failures.push("the THEME_GROUPS table was not found in app.js");
else {
  const listed = [].concat(GROUPS.light || [], GROUPS.dark || [], GROUPS.colour || [], HICON);
  for (const id of ids){ const n = listed.filter((x) => x === id).length; if (n !== 1) failures.push(id + " is in " + n + " picker groups (1 expected)"); }
  for (const id of listed) if (!THEMES[id]) failures.push("picker group lists “" + id + "”, which is not a built-in theme");
  for (const id of GROUPS.light || []) if (luminance(THEMES[id] ? THEMES[id].bg : "#000000") < 0.18) failures.push(id + " is in the Light group but has a dark page");
  for (const id of GROUPS.dark || []) if (luminance(THEMES[id] ? THEMES[id].bg : "#ffffff") > 0.18) failures.push(id + " is in the Dark group but has a light page");
}

console.log("\n" + ids.length + " themes, " + (pairs - low) + "/" + pairs + " pairs pass (text 4.5:1, boundaries 3:1)");
if (failures.length){ console.log("Failures:"); failures.forEach((f) => console.log(" - " + f)); }
process.exit(failures.length ? 1 : 0);
