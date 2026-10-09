/* Contrast audit of the twelve built-in themes, and the rules of the set (no browser needed):
     node tests/themes.js
   Every pair the interface relies on must read at 4.5:1 or better (WCAG AA; 7:1 is the aim):
   text, secondary text, the accent and the lamp on the page, the panel and the raised surface
   (the table's `raise`, which applyTheme uses as it stands); the panel colour (--on-fill) on a lamp
   and on an accent fill; the page colour on an accent fill (the current find, the selection, and on
   a light page the word the card looks up); the text on the soft lamp and accent tints (--lamp-soft
   is 14 % lamp in the panel and --accent-soft 16 % accent over the raised surface; in a dark theme,
   16 % lamp in the raised surface and 18 % accent over it), on a found word (28 % accent over the
   page), on the sentence read aloud (24 % lamp over the page, 18 % on a dark page), on the yellow
   highlight (#E8C547 at 42 % over the page, 38 % on a dark page) and, on a dark page only, on the
   word the card looks up (35 % accent over the page); the lamp on its own soft tint (the empty-state
   icons); and the toast, which is inverse (the page colour on the text colour). Two boundaries need
   3:1: the accent border of a chosen control against its own --accent-soft fill, and the control
   edge (--edge, the secondary text) on the raised surface, which the muted/raise text pair already
   holds to 4.5:1.
   Each mix is made in the colour space app.css makes it in: sRGB for color-mix(in srgb …), OKLab for
   in oklab (the dark tone's --lamp-soft), and a mix with transparent is its colour laid over what is
   behind it, in sRGB as the browser composites. "Dark" is the dark tone: a page under 0.18 relative
   luminance, Contrast dark aside (the two contrast themes have a tone of their own).
   The table, the looks and the retired themes are read straight out of app.js. The set is the twelve
   ids in the spec's order; every theme has a name, a family (warm, cool or neutral), the eight
   colours and no texture, and the contrast pair's raised surface is its panel. The six looks hold
   every built-in once, a light page by day and a dark one by night. Each retired theme moves to a
   kept theme of its own tone (a page on the same side of 0.18) other than the contrast pair, with a
   second choice of that tone that differs from the first, and keeps its name and five colours. And no
   two themes of one tone are near-duplicates: the weighted OKLab distance of the spec (§3.3),
   100 × (0.45 ΔE page + 0.30 ΔE text + 0.15 ΔE accent + 0.10 ΔE lamp), is at least 4.5. */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
function literal(name, re){
  const m = re.exec(src);
  if (!m){ console.log("FAIL  the " + name + " table was not found in app.js"); process.exit(1); }
  return new Function("return " + m[1])();
}
const THEMES = literal("THEMES", /var THEMES = (\{[\s\S]*?\n  \});/);
const LOOKS = literal("LOOKS", /var LOOKS = (\[[\s\S]*?\n  \]);/);
const RETIRED = literal("RETIRED", /var RETIRED = (\{[\s\S]*?\n  \});/);

function rgb(h){ h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const hex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function luminance(h){ const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b){ const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/* app.js's mix(), the sRGB blend color-mix(in srgb …) makes: `t` of b into a. Laying a colour at
   alpha t over a backdrop is the same sum */
function mix(a, b, t){ const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); }
/* OKLab, Björn Ottosson's matrices: sRGB to OKLab, and back the way tests/lib.js's parseColor reads an
   oklab() colour (to linear sRGB, the sRGB curve, clamped) */
function toOklab(h){
  const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab([L, A, B]){
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), k = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
  const enc = (x) => 255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
  return hex([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * k, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * k, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * k].map(enc));
}
/* color-mix(in oklab, b t, a) */
function mixOklab(a, b, t){ const A = toOklab(a), B = toOklab(b); return fromOklab(A.map((v, i) => v + (B[i] - v) * t)); }
const dE = (a, b) => { const A = toOklab(a), B = toOklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
/* the spec's distance between two themes (§3.3): about 2 is just visible, under 4.5 a near-duplicate */
const distance = (x, y) => 100 * (0.45 * dE(x.bg, y.bg) + 0.30 * dE(x.ink, y.ink) + 0.15 * dE(x.accent, y.accent) + 0.10 * dE(x.lamp, y.lamp));
const HICON = ["hicon", "hidark"];
const IDS = ["day", "dusk", "paper", "ink", "sepia", "cocoa", "sage", "forest", "seaair", "canals", "hicon", "hidark"];
const TOKENS = ["bg", "ink", "muted", "panel", "raise", "line", "accent", "lamp"];
const FAMILIES = ["warm", "cool", "neutral"];
const HEX = /^#[0-9a-f]{6}$/i;
const LIGHT = 0.18, lightPage = (h) => luminance(h) >= LIGHT;

/* [text, surface, minimum, the dark tone only]; the surfaces past the table's own are the tints and mixes
   made below */
const TEXT = 4.5, EDGE = 3;
const PAIRS = [
  ["ink", "bg"], ["ink", "panel"], ["ink", "raise"],
  ["muted", "bg"], ["muted", "panel"], ["muted", "raise"],
  ["accent", "bg"], ["accent", "panel"], ["accent", "raise"],
  ["lamp", "bg"], ["lamp", "panel"], ["lamp", "raise"],
  ["panel", "lamp"], ["panel", "accent"],
  ["ink", "lampSoft"], ["ink", "accentSoft"],
  ["bg", "ink"],
  ["accent", "accentSoft", EDGE],
  ["bg", "accent"], ["ink", "find"], ["ink", "hit", TEXT, true], ["ink", "speak"], ["ink", "sun"], ["lamp", "lampSoft"]
].map(([a, b, min, darkOnly]) => [a, b, min || TEXT, !!darkOnly]);
const LABEL = { "panel/lamp": "onfill/lamp", "panel/accent": "onfill/acc", "accent/accentSoft": "acc/accSoft", "ink/accentSoft": "ink/accSoft", "ink/lampSoft": "ink/lampSoft",
  "bg/ink": "toast", "bg/accent": "bg/accFill", "lamp/lampSoft": "lamp/lampSft" };
let failures = [], pairs = 0, low = 0;

const head = PAIRS.map(([a, b, min]) => { const k = a + "/" + b; return (min === EDGE ? "edge " : "") + (LABEL[k] || k); });
console.log("theme".padEnd(8) + head.map((h) => h.slice(0, 12).padStart(13)).join(""));
for (const [id, t0] of Object.entries(THEMES)){
  for (const k of TOKENS) if (!HEX.test(t0[k] || "")) failures.push(id + ": " + k + " is not a 6-digit hex colour (" + t0[k] + ")");
  if (typeof t0.name !== "string" || !t0.name.trim()) failures.push(id + ": no name");
  if (FAMILIES.indexOf(t0.family) < 0) failures.push(id + ": family is " + t0.family + " (warm, cool or neutral)");
  if (t0.texture !== undefined) failures.push(id + ": has a texture (" + t0.texture + "); the themes have none");
  if (HICON.includes(id) && t0.raise !== t0.panel) failures.push(id + ": a high-contrast theme's raised surface is its panel");
  if (!TOKENS.every((k) => HEX.test(t0[k] || ""))) continue;
  /* the dark tone's tints are a little stronger and sit on the raised surface (app.css :root[data-tone="dark"]),
     its lamp tint mixed in OKLab; its highlights over the page are lighter */
  const dark = !HICON.includes(id) && !lightPage(t0.bg);
  const t = Object.assign({}, t0, {
    lampSoft: dark ? mixOklab(t0.raise, t0.lamp, 0.16) : mix(t0.panel, t0.lamp, 0.14),
    accentSoft: mix(t0.raise, t0.accent, dark ? 0.18 : 0.16),
    find: mix(t0.bg, t0.accent, 0.28),
    hit: mix(t0.bg, t0.accent, 0.35),
    speak: mix(t0.bg, t0.lamp, dark ? 0.18 : 0.24),
    sun: mix(t0.bg, "#E8C547", dark ? 0.38 : 0.42)
  });
  const cells = PAIRS.map(([a, b, min, darkOnly]) => {
    if (darkOnly && !dark) return "-".padStart(13);
    const r = contrast(t[a], t[b]); pairs++;
    if (r < min){ low++; failures.push(id + ": " + a + "/" + b + " is " + r.toFixed(2) + ":1 (needs " + min + ":1)"); }
    return (r.toFixed(2) + (r < min ? " LOW" : r >= 7 ? " AAA" : "    ")).padStart(13);
  });
  console.log(id.padEnd(8) + cells.join(""));
}

/* the set: the twelve, in the spec's order */
const ids = Object.keys(THEMES);
if (ids.join() !== IDS.join()) failures.push("the built-ins are " + ids.join(", ") + " (expected " + IDS.join(", ") + ")");

/* the looks: six, every built-in in exactly one, a light page by day and a dark one by night */
if (LOOKS.length !== 6) failures.push(LOOKS.length + " looks (6 expected)");
const halves = LOOKS.flatMap((l) => [l.day, l.night]);
for (const id of ids){ const n = halves.filter((x) => x === id).length; if (n !== 1) failures.push(id + " is in " + n + " looks (1 expected)"); }
for (const l of LOOKS){
  for (const k of ["day", "night"]) if (!THEMES[l[k]]) failures.push("the look " + l.id + "'s " + k + " half, " + l[k] + ", is not a built-in theme");
  if (THEMES[l.day] && !lightPage(THEMES[l.day].bg)) failures.push("the look " + l.id + "'s day half, " + l.day + ", has a dark page");
  if (THEMES[l.night] && lightPage(THEMES[l.night].bg)) failures.push("the look " + l.id + "'s night half, " + l.night + ", has a light page");
}

/* the retired themes: 38, none of them kept; each moves within its tone to a theme that is no contrast theme */
const gone = Object.keys(RETIRED);
if (gone.length !== 38) failures.push(gone.length + " retired themes (38 expected)");
for (const [id, r] of Object.entries(RETIRED)){
  if (THEMES[id]) failures.push(id + " is retired and still a built-in");
  if (typeof r.name !== "string" || !r.name.trim()) failures.push(id + " (retired): no name");
  for (const k of ["bg", "panel", "ink", "muted", "accent"]) if (!HEX.test(r[k] || "")) failures.push(id + " (retired): " + k + " is not a 6-digit hex colour (" + r[k] + ")");
  for (const k of ["to", "alt"]){
    const t = THEMES[r[k]];
    if (!t || HICON.includes(r[k])) failures.push(id + " (retired): its " + k + ", " + r[k] + ", is not a kept theme outside the contrast pair");
    else if (HEX.test(r.bg || "") && lightPage(t.bg) !== lightPage(r.bg)) failures.push(id + " (retired): its " + k + ", " + r[k] + ", is of the other tone");
  }
  if (r.alt === r.to) failures.push(id + " (retired): its second choice is its first, " + r.to);
}

/* no near-duplicates within a tone */
const near = [], closest = {};
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
  const x = THEMES[ids[i]], y = THEMES[ids[j]];
  if (!TOKENS.every((k) => HEX.test(x[k] || "") && HEX.test(y[k] || ""))) continue;
  const tone = lightPage(x.bg) ? "light" : "dark";
  if (tone !== (lightPage(y.bg) ? "light" : "dark")) continue;
  const d = distance(x, y);
  if (!closest[tone] || d < closest[tone].d) closest[tone] = { d, pair: ids[i] + "–" + ids[j] };
  if (d < 4.5) near.push(ids[i] + "–" + ids[j] + " " + d.toFixed(2));
}
for (const n of near) failures.push("near-duplicates (distance under 4.5): " + n);
console.log("\nclosest of one tone: " + Object.entries(closest).map(([tone, c]) => tone + " " + c.pair + " " + c.d.toFixed(2)).join(", "));

console.log("\n" + ids.length + " themes, " + (pairs - low) + "/" + pairs + " pairs pass (text 4.5:1, boundaries 3:1)");
if (failures.length){ console.log("Failures:"); failures.forEach((f) => console.log(" - " + f)); }
process.exit(failures.length ? 1 : 0);
