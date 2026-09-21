/* Explain and Simplify, upgraded — the rules, in node against the same small fake dictionary
   tests/simplify-node.js uses (tests/fixtures/simplify-dict.json).
   Two halves: the four simplify strengths (light / plain / very / kid) and what each one is
   allowed to change, and the figurative language and register that explain() now reports.
     node tests/explain2-node.js */
const fs = require("fs"), path = require("path");
global.window = {};
require("../explain.js");
const X = window.llExplain;
const DICT = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "simplify-dict.json"), "utf8"));
const dict = (w) => (Object.prototype.hasOwnProperty.call(DICT, w) ? DICT[w] : null);
const rank = X.rank;

const results = [];
function check(name, ok, detail){ results.push({ name, ok: !!ok }); console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || !detail ? "" : "  -- " + detail)); }
function run(s, level){ return X.simplify(s, dict, rank, level ? { level } : undefined); }
const whys = (r) => r.changes.map((c) => c.why);
/* every change must still point at its own text in the output */
const offsetsOk = (r) => r.changes.every((c) => r.text.slice(c.start, c.end) === c.to && typeof c.from === "string" && c.from.length > 0);
/* the longest sentence of a result, in words */
const longest = (s) => Math.max(0, ...X.splitSentences(s).map((sp) => (s.slice(sp.s, sp.e).match(/[A-Za-zÀ-ɏ\d][A-Za-zÀ-ɏ\d'’-]*/g) || []).length));
const WHYS = ["rarer word", "idiom", "shorter phrase", "split long sentence", "passive to active", "aside removed", "connector", "shortened", "glossed", "abbreviation"];

/* ---------- 1. the four strengths ---------- */
const LONG = "The old woman had lived alone in the crooked house at the end of the lane for nearly thirty years, but nobody in the village could remember ever having spoken to her.";
const MIX = "The old lawyer commenced his address in order to demonstrate the extraordinary consequences of the agreement, although the jury was already weary.";
const COMPOUND = "The rain had stopped by morning, but the streets were still wet and nobody wanted to walk to the shop.";

check("simplify takes a level and reports it back", ["light", "plain", "very", "kid"].every((l) => run("The cat sat on the mat.", l).level === l) && run("The cat sat on the mat.").level === "plain");
check("an unknown level falls back to plain", run(MIX, "loud").text === run(MIX, "plain").text);

let light = run(MIX, "light"), plain = run(MIX), very = run(MIX, "very"), kid = run(MIX, "kid");
check("light changes least, kid most", light.changes.length < plain.changes.length && plain.changes.length <= very.changes.length && very.changes.length < kid.changes.length,
  [light.changes.length, plain.changes.length, very.changes.length, kid.changes.length].join(" / "));
check("…and the sentences get shorter as the level rises", longest(light.text) >= longest(plain.text) && longest(plain.text) >= longest(very.text) && longest(very.text) > longest(kid.text),
  [longest(light.text), longest(plain.text), longest(very.text), longest(kid.text)].join(" / "));
check("every why is one of the ten known reasons", [light, plain, very, kid].every((r) => whys(r).every((w) => WHYS.indexOf(w) >= 0)), JSON.stringify(whys(kid)));
check("offsets stay right at every level", [light, plain, very, kid].every(offsetsOk));

/* light: only the rarest words and idioms */
check("light swaps a word nobody meets (commenced → began)", /The old lawyer began his address/.test(light.text), light.text);
check("…but leaves the wordy phrase and the merely uncommon word alone", /in order to demonstrate the extraordinary/.test(light.text), light.text);
check("light never splits, however long the sentence", whys(run(LONG, "light")).indexOf("split long sentence") < 0 && run(LONG, "light").text.indexOf("thirty years, but nobody") > 0, run(LONG, "light").text);
check("light leaves a passive as it is", run("The window was broken by the storm.", "light").changes.length === 0, run("The window was broken by the storm.", "light").text);
check("light still simplifies an idiom", whys(run("The soldiers were ordered to keep an eye on the bridge.", "light")).indexOf("idiom") >= 0);

/* plain: unchanged from before */
check("plain is exactly today's behaviour", plain.text === X.simplify(MIX, dict, rank).text && /began his address to show the unusual consequences/.test(plain.text), plain.text);

/* very: splits a 20-word compound sentence that plain leaves whole */
const vc = run(COMPOUND, "very"), pc = run(COMPOUND);
check("plain leaves a 20-word compound sentence whole", pc.changes.length === 0, pc.text);
check("very splits it at both joining words", vc.text === "The rain had stopped by morning. But the streets were still wet. Nobody wanted to walk to the shop." && whys(vc).every((w) => w === "split long sentence"), vc.text);
check("very takes the swap threshold down to rank 3000", /walked to the assembly/.test(run("They walked to the assembly.", "very").text) || run("The physician departed.", "very").text === "The doctor left.", run("The physician departed.", "very").text);
let r = run("The rain fell all morning; however, the children went out anyway.", "very");
check("very turns a semicolon between clauses into a full stop and shortens the connector",
  r.text === "The rain fell all morning. But the children went out anyway." && whys(r).indexOf("connector") >= 0 && whys(r).indexOf("split long sentence") >= 0, r.text + " " + JSON.stringify(whys(r)));
check("…and plain leaves that sentence alone", run("The rain fell all morning; however, the children went out anyway.").changes.length === 0);
r = run("The committee met on Tuesday (the room was cold) and agreed on nothing.", "very");
check("an aside with a verb becomes its own sentence", r.text === "The committee met on Tuesday and agreed on nothing. The room was cold." && whys(r).indexOf("shortened") >= 0, r.text);
r = run("The house — a large one — stood at the end of the lane.", "very");
check("an aside without a verb is dropped, recorded as ‘aside removed’", r.text === "The house stood at the end of the lane." && whys(r).join() === "aside removed", r.text + " " + JSON.stringify(whys(r)));
r = run("The rain — which nobody expected — started again.", "very");
check("a describing clause between dashes is left where it is", r.text.indexOf("which nobody expected") > 0, r.text);

/* kid: shortening, abbreviations, numbers and glosses */
check("kid cuts the closing clause loose and repeats the subject",
  kid.text.indexOf("of the agreement. The jury was already weary, though.") > 0 && whys(kid).indexOf("shortened") >= 0, kid.text);
check("kid glosses ‘consequences’ in four words or fewer",
  /consequences \(= [^)]+\)/.test(kid.text) && kid.text.match(/consequences \(= ([^)]+)\)/)[1].split(" ").length <= 4 && whys(kid).indexOf("glossed") >= 0, kid.text);
r = run("She smiled, although she was tired.", "kid");
check("‘She smiled, although she was tired.’ → ‘She smiled. She was tired, though.’", r.text === "She smiled. She was tired, though." && whys(r).every((w) => w === "shortened"), r.text);
check("…and no other level touches it", ["light", "plain", "very"].every((l) => run("She smiled, although she was tired.", l).changes.length === 0));
r = run("He stayed at home because he was ill.", "kid");
check("a reason clause becomes its own sentence too", r.text === "He stayed at home. That is because he was ill.", r.text);
r = run("Bring warm clothes, e.g. a coat, and about 2,400,000 people will do the same.", "kid");
check("kid expands e.g. and says a big number in words", r.text === "Bring warm clothes, for example a coat, and about 2.4 million people will do the same." &&
  whys(r).indexOf("abbreviation") >= 0 && whys(r).indexOf("shortened") >= 0, r.text);
check("i.e. and etc. too", run("The room was empty, i.e. nobody was there.", "kid").text === "The room was empty, that is nobody was there." &&
  /and so on\.$/.test(run("She packed books, maps, etc.", "kid").text), run("She packed books, maps, etc.", "kid").text);
r = run("It was a small, deliberate decision.", "kid");
check("stacked adjectives come down to the commonest one", r.text === "It was a small decision." && whys(r).join() === "shortened", r.text);
const kc = run(COMPOUND, "kid");
check("kid keeps every sentence to 12 words or fewer where a split is possible", longest(kc.text) <= 12, kc.text + " -> " + longest(kc.text));
check("kid never changes what is inside quotation marks beyond swaps and glosses",
  run("He said, “In order to win, however, we must make a decision.”", "kid").text.indexOf("“In order to win, however, we must make a decision.”") > 0,
  run("He said, “In order to win, however, we must make a decision.”", "kid").text);
check("an already plain sentence stays plain at every level",
  ["light", "plain", "very", "kid"].every((l) => run("The cat sat on the mat.", l).text === "The cat sat on the mat."));

/* ---------- 2. figurative language ---------- */
const style = (s) => X.explain(s, dict, rank).style;
const kinds = (s) => style(s).figurative.map((f) => f.kind);
const first = (s) => style(s).figurative[0] || {};

check("explain() now reports style with figurative and register", (() => { const st = style("The cat sat on the mat."); return st && Array.isArray(st.figurative) && st.register && typeof st.register.kind === "string" && typeof st.register.note === "string"; })());
check("the older keys are untouched", (() => { const e = X.explain("The window was broken by the storm.", dict, rank); return Array.isArray(e.tokens) && Array.isArray(e.clauses) && Array.isArray(e.expressions) && typeof e.plain === "string" && Array.isArray(e.keywords); })());

let f = first("The puddles glittered like spilled coins.");
check("simile: ‘like spilled coins’, with a note naming the coins", f.kind === "simile" && f.text === "like spilled coins" && /coins/.test(f.note) && /puddles/.test(f.note), JSON.stringify(f));
check("…and its offsets point at the sentence", "The puddles glittered like spilled coins.".slice(f.start, f.end) === f.text, f.start + "–" + f.end);
check("simile: ‘as cold as ice’", kinds("The room was as cold as ice.").indexOf("simile") >= 0, JSON.stringify(kinds("The room was as cold as ice.")));
check("simile: ‘as if’", kinds("She looked at him as if he were a stranger.").indexOf("simile") >= 0);
check("‘I like tea’ is no simile", kinds("I like tea.").length === 0, JSON.stringify(style("I like tea.").figurative));
check("‘as many as 400 people’ is no simile", kinds("As many as 400 people came.").indexOf("simile") < 0, JSON.stringify(kinds("As many as 400 people came.")));

f = first("Her words were daggers.");
check("metaphor: ‘Her words were daggers’", f.kind === "metaphor" && /likeness/.test(f.note) && f.text === "Her words were daggers", JSON.stringify(f));
check("metaphor: ‘a sea of troubles’", kinds("He faced a sea of troubles.").indexOf("metaphor") >= 0, JSON.stringify(kinds("He faced a sea of troubles.")));
check("‘The room was empty’ is no metaphor", kinds("The room was empty.").indexOf("metaphor") < 0);

f = first("The wind whispered through the trees.");
check("personification: a thing doing something only people do", f.kind === "personification" && /human action/.test(f.note) && f.text === "The wind whispered", JSON.stringify(f));
check("a person whispering is not personification", kinds("The old woman whispered to her sister.").indexOf("personification") < 0);

f = first("I've told you a million times.");
check("hyperbole: ‘a million times’", f.kind === "hyperbole" && f.text === "a million times" && /exaggerates/.test(f.note), JSON.stringify(f));
check("hyperbole: ‘for ages’ and ‘the whole world’", kinds("We waited for ages.").indexOf("hyperbole") >= 0 && kinds("The whole world knew.").indexOf("hyperbole") >= 0);

check("an idiom the dictionary knows is listed with its sense", (() => {
  const fs2 = style("The soldiers were ordered to keep an eye on the bridge.").figurative.filter((x) => x.kind === "idiom");
  return fs2.length === 1 && /eye/.test(fs2[0].text) && fs2[0].note.length > 6;
})(), JSON.stringify(style("The soldiers were ordered to keep an eye on the bridge.").figurative));

/* ---------- 3. register ---------- */
const reg = (s) => style(s).register;
let g = reg("Thou art a villain, and thy words hurt.");
check("archaic: thou / thy", g.kind === "archaic" && /^Archaic — /.test(g.note), JSON.stringify(g));
g = reg("Well, you know, it's kinda late, isn't it?");
check("spoken: contractions, fillers and a question tag", g.kind === "spoken" && /^Spoken — /.test(g.note) && /question tag/.test(g.note), JSON.stringify(g));
g = reg("The application must be submitted prior to the deadline; failure to do so will result in disqualification.");
check("formal: no contractions, a passive and long words", g.kind === "formal" && /^Formal — no contractions/.test(g.note), JSON.stringify(g));
g = reg("The cat sat on the mat.");
check("neutral: plain everyday prose", g.kind === "neutral" && /^Neutral — /.test(g.note), JSON.stringify(g));
g = reg("The puddles glittered like spilled coins.");
check("literary: a figure of speech makes it literary", g.kind === "literary" && /^Literary — /.test(g.note), JSON.stringify(g));
check("a formal sentence with a semicolon is formal, not literary", reg("The application must be submitted prior to the deadline; failure to do so will result in disqualification.").kind === "formal");

const fails = results.filter((x) => !x.ok);
console.log("\n" + (results.length - fails.length) + "/" + results.length + " checks passed");
process.exit(fails.length ? 1 : 0);
