/* Simplify, the rewriting rules: explain.js runs in node against a small fake dictionary
   (tests/fixtures/simplify-dict.json — the bundled dictionary's own entries for the words these
   sentences use, plus the synonyms they list). Rare-word swaps with inflection, the wordy-phrase
   table, long sentences split at a joining word, a passive turned round, names / quotes /
   numbers / contractions left alone, an already plain sentence coming back unchanged, and the
   change offsets pointing at the right substrings of the output.
     node tests/simplify-node.js */
const fs = require("fs"), path = require("path");
global.window = {};
require("../explain.js");
const X = window.llExplain;
const DICT = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "simplify-dict.json"), "utf8"));
const dict = (w) => (Object.prototype.hasOwnProperty.call(DICT, w) ? DICT[w] : null);
const rank = X.rank;

const results = [];
function check(name, ok, detail){ results.push({ name, ok: !!ok }); console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || !detail ? "" : "  -- " + detail)); }
function run(s){ return X.simplify(s, dict, rank); }
/* every change must point at its own text in the output */
function offsetsOk(r){ return r.changes.every((c) => r.text.slice(c.start, c.end) === c.to && typeof c.from === "string" && c.from.length > 0); }
const whys = (r) => r.changes.map((c) => c.why);

check("exports simplify and splitSentences", typeof X.simplify === "function" && typeof X.splitSentences === "function");
check("the older exports are still there", ["explain", "rank", "tokenize", "tag", "inflect", "lemmas", "cleanDef", "bestSense"].every((k) => typeof X[k] === "function"));

/* 1. a rare word swapped and inflected */
let r = run("They commenced walking towards the village.");
check("commenced → began (inflected)", r.text === "They began walking towards the village.", r.text);
check("…recorded as a rarer word with offsets", r.changes.length === 1 && r.changes[0].from === "commenced" && r.changes[0].to === "began" && r.changes[0].why === "rarer word" && offsetsOk(r), JSON.stringify(r.changes));
r = run("Commence the engines. The window was broken by the storm.");
check("sentence-initial swap keeps its capital; two sentences counted", r.text === "Begin the engines. The storm broke the window." && r.sentences === 2 && offsetsOk(r), r.text);
r = run("A remarkable woman lived in a small hamlet near the river.");
check("a → an follows the new word; a dictionary synonym (hamlet → village) is used", r.text === "An unusual woman lived in a small village near the river." && offsetsOk(r), r.text);
check("…the article is part of the change", r.changes[0].from === "A remarkable" && r.changes[0].to === "An unusual", JSON.stringify(r.changes[0]));
r = run("She didn't purchase the house on the 3rd of May, and Mr. Darcy said nothing.");
check("contraction, number and names untouched; purchase → buy", r.text === "She didn't buy the house on the 3rd of May, and Mr. Darcy said nothing." && offsetsOk(r), r.text);

/* 2. the wordy-phrase table */
r = run("In order to succeed, you must make a decision prior to the meeting.");
check("wordy phrases shortened, verb-headed one inflected", r.text === "To succeed, you must decide before the meeting.", r.text);
check("…three changes, all shorter phrases, offsets right", r.changes.length === 3 && whys(r).every((w) => w === "shorter phrase") && offsetsOk(r), JSON.stringify(r.changes));
r = run("The committee was unable to reach an agreement due to the fact that a large number of members were absent.");
check("was unable to / reach an agreement / due to the fact that / a large number of", r.text === "The committee could not agree because many members were absent." && offsetsOk(r), r.text);

/* 3. a long sentence split at a joining word */
r = run("The old woman had lived alone in the crooked house at the end of the lane for nearly thirty years, but nobody in the village could remember ever having spoken to her.");
check("split at ', but' — But may open the new sentence", /thirty years\. But nobody in the village/.test(r.text) && whys(r).indexOf("split long sentence") >= 0 && offsetsOk(r), r.text);
check("…the split change spans ', but' → '. But'", r.changes.some((c) => c.from === ", but" && c.to === ". But"), JSON.stringify(r.changes));
r = run("Elizabeth listened in silence, but was not convinced; their behaviour at the assembly had not been calculated to please in general, and she ventured to hope that her sister would endeavour to conceal her disappointment.");
check("split at the semicolon and at ', and she'; 'and' dropped", /convinced\. Their behaviour/.test(r.text) && /in general\. She ventured/.test(r.text) && offsetsOk(r), r.text);
check("…rare words swapped in the same pass", /would try to hide her disappointment\./.test(r.text), r.text);
r = run("Nobody could have predicted the extraordinary consequences of that small, deliberate decision.");
check("a short sentence is not split; extraordinary → unusual", r.text === "Nobody could have predicted the unusual consequences of that small, deliberate decision." && whys(r).indexOf("split long sentence") < 0, r.text);
r = run("Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and caprice, that the experience of three-and-twenty years had been insufficient to make his wife understand his character.");
check("a list joined by 'and' is not split", !/reserve\. /.test(r.text) && whys(r).indexOf("split long sentence") < 0, r.text);

/* 4. passive → active */
r = run("The window was broken by the storm.");
check("The window was broken by the storm → The storm broke the window", r.text === "The storm broke the window." && r.changes.length === 1 && r.changes[0].why === "passive to active" && offsetsOk(r), r.text);
r = run("She was seen by him at the station.");
check("pronouns change case: She … by him → He saw her", r.text === "He saw her at the station." && offsetsOk(r), r.text);
r = run("The window was not broken by the storm.");
check("a negated passive is left alone", r.text === "The window was not broken by the storm." && r.changes.length === 0, r.text);
r = run("The register of his burial was signed by the clergyman, the clerk, the undertaker, and the chief mourner.");
check("a passive with a list of agents is left alone", r.changes.every((c) => c.why !== "passive to active"), r.text);

/* 5. quotes: only rare words change inside them */
r = run("“You must endeavour to be punctual,” said Mr. Bennet, “for the carriage departs at nine.”");
check("rare words inside quotes are swapped; the name and the quotes stay", r.text === "“You must try to be punctual,” said Mr. Bennet, “for the carriage leaves at nine.”" && offsetsOk(r), r.text);
r = run("He said, “In order to win, we must make a decision.”");
check("a wordy phrase inside quotes is left alone", r.text === "He said, “In order to win, we must make a decision.”" && r.changes.length === 0, r.text);

/* 6. an idiom the dictionary knows, and nothing to simplify */
r = run("The soldiers were ordered to keep an eye on the bridge.");
check("idiom: keep an eye on → watch", r.text === "The soldiers were ordered to watch the bridge." && whys(r)[0] === "idiom" && offsetsOk(r), r.text);
r = run("The cat sat on the mat.");
check("a plain sentence comes back unchanged with no changes", r.text === "The cat sat on the mat." && r.changes.length === 0 && r.sentences === 1);
r = run("");
check("empty input", r.text === "" && r.changes.length === 0 && r.sentences === 0);

/* 7. sentence splitting of the input */
const sp = (s) => X.splitSentences(s).map((x) => s.slice(x.s, x.e));
check("splitSentences: abbreviation, closing quote, no split before a lowercase word", JSON.stringify(sp("Mr. Bennet went home. He slept.")) === JSON.stringify(["Mr. Bennet went home.", "He slept."]) && sp("“Wait!” he shouted.").length === 1 && sp("He asked, “Are you coming?” She did not answer.").length === 2, JSON.stringify(sp("He asked, “Are you coming?” She did not answer.")));
r = run("They commenced walking towards the village.  The window was broken by the storm.");
check("offsets stay right across sentences and their spacing", r.text === "They began walking towards the village.  The storm broke the window." && offsetsOk(r), r.text);

/* 8. the analysis kept its shape for the explain card */
const ex = X.explain("The window was broken by the storm.", dict, rank);
check("explain still returns tokens, clauses, expressions, plain and keywords", Array.isArray(ex.tokens) && Array.isArray(ex.clauses) && Array.isArray(ex.expressions) && typeof ex.plain === "string" && Array.isArray(ex.keywords));
check("…tokens now carry source offsets", ex.tokens.every((t) => typeof t.s === "number" && typeof t.e === "number" && t.e > t.s));

const fails = results.filter((x) => !x.ok);
console.log("\n" + (results.length - fails.length) + "/" + results.length + " checks passed");
process.exit(fails.length ? 1 : 0);
