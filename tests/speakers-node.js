/* Who speaks each line (audiobook.js attribute(), behind a voice per character), on a passage written the way the
   reader's books are: the present tense ("Pony says", "Giraffy booms", "Pony deadpans"), the listener named inside a
   quote ("Aha! Good eye, Pony!" is Giraffy's), untagged turns, beats with a possessive subject ("Giraffy's ears
   droop.", "Mimi's voice drifts down the roof stairs."), and quotes split by a tag. No browser needed:
     node tests/speakers-node.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { makeReport } = { makeReport(){ const res = []; return { check(n, ok, d){ res.push(!!ok); console.log((ok ? "  ok   " : "  FAIL ") + n + (ok || !d ? "" : "  -- " + d)); }, done(){ const f = res.filter((x) => !x).length; console.log("\n" + (res.length - f) + "/" + res.length + " checks passed"); return f ? 1 : 0; } }; } };
const R = makeReport();

/* audiobook.js in a bare context: it hangs its pure parts on window.llAudiobook */
const win = { __ll: {} }, ctx = { window: win, console, setTimeout, clearTimeout, Promise };
ctx.self = win;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "audiobook.js"), "utf8"), ctx, { filename: "audiobook.js" });
const A = win.llAudiobook;
R.check("audiobook.js exposes attribute()", A && typeof A.attribute === "function");

/* one unit per paragraph, its quote marks kept: attribute() finds the quotes itself */
const text = fs.readFileSync(path.join(__dirname, "fixtures", "speakers", "dialogue.txt"), "utf8");
const units = [], re = /\r?\n[ \t]*\r?\n/g;
let last = 0, m;
while ((m = re.exec(text))){ units.push([last, m.index]); last = m.index + m[0].length; }
units.push([last, text.length]);
const paras = units.filter((p) => p[1] > p[0]).map((p) => ({ start: p[0], end: p[1], text: text.slice(p[0], p[1]), para: p[0] }));

const WANT = ["Pony", "Pony", "Giraffy", "Giraffy", "Pony", "Pony", "Giraffy", "Pony", "Giraffy", "Mimi", "Giraffy", "Pony", "Giraffy", "Giraffy", "Pony", "Giraffy", "Giraffy"];
const res = A.attribute(paras), nameOf = {};
res.cast.forEach((c) => { nameOf[c.key] = c.name; });
const got = res.quotes.map((q) => nameOf[q.role] || q.role);
const misses = got.map((g, i) => g === WANT[i] ? null : (i + 1) + ": " + g + " (want " + WANT[i] + ")").filter(Boolean);
R.check("17 quotes found", res.quotes.length === WANT.length, String(res.quotes.length));
R.check("every quote goes to the character who says it", misses.length === 0, misses.join("; "));
const cast = {}; res.cast.forEach((c) => { cast[c.name] = c.gender; });
R.check("the cast: Pony and Giraffy, both men, and Mimi, from her voice down the stairs", cast.Pony === "male" && cast.Giraffy === "male" && "Mimi" in cast, JSON.stringify(cast));
/* the speech verbs a present-tense book brings: "Giraffy booms", "Pony deadpans" */
R.check("the lines tagged booms and deadpans go to Giraffy and Pony", /booms/.test(text) && got[2] === "Giraffy" && got[4] === "Pony");
process.exit(R.done());
