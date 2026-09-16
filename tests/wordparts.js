/* Word parts: the tables are complete, the analyser splits the classic examples the way a
   reader expects and leaves ordinary words alone. Runs morph.js directly in node:
     node tests/wordparts.js */
const morph = require("../morph.js");
const results = [];
function check(name, ok, detail){ results.push({ name, ok: !!ok }); console.log((ok ? "  ok   " : "  FAIL ") + name + (ok || !detail ? "" : "  -- " + detail)); }

/* a small dictionary standing in for the app's: just the base words the examples need */
const WORDS = "break expect happy read hope care act create run agree write port form nation friend comfort hurry predict deliberate " +
  "punctual consequence spirit understand synthesis marine night cast differ mark possible visible credible regular legal remark remarkable " +
  "thesis stand stance table uncle under island red ring interest mother water paper button carpet pumpkin cabinet moth pap wat " +
  "less cab pet kin pump ton but car bit son cabin";
const DICT = {};
WORDS.split(" ").forEach((w) => { DICT[w] = "the word " + w; });
const lookup = (w) => DICT[w] || null;
const texts = (r) => r ? r.parts.map((p) => p.text) : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check("PREFIXES has at least 110 entries", morph.PREFIXES.length >= 110, String(morph.PREFIXES.length));
check("SUFFIXES has at least 90 entries", morph.SUFFIXES.length >= 90, String(morph.SUFFIXES.length));
check("ROOTS has at least 220 entries", morph.ROOTS.length >= 220, String(morph.ROOTS.length));
check("grammatical endings are marked", morph.SUFFIXES.filter((s) => s.end).length >= 6);
check("every table entry has a form, a meaning and an origin", [].concat(morph.PREFIXES, morph.SUFFIXES, morph.ROOTS).every((e) => e.f && e.m && e.o));
check("roots have an origin from the expected set", morph.ROOTS.every((e) => /^(Latin|Greek|Old English|French)$/.test(e.o)));

const SPLITS = {
  unbreakable: ["un", "break", "able"],
  misunderstanding: ["mis", "understand", "ing"],
  photosynthesis: ["photo", "synthesis"],
  predictable: ["pre", "dict", "able"],
  extraordinary: ["extra", "ordin", "ary"],
  unhappiness: ["un", "happi", "ness"],
  biology: ["bio", "logy"],
  telephone: ["tele", "phone"],
  transportation: ["trans", "port", "ation"],
  disagreement: ["dis", "agree", "ment"],
  rewritten: ["re", "writt", "en"],
  submarine: ["sub", "mar", "ine"],
  international: ["inter", "nation", "al"],
  autobiography: ["auto", "bio", "graphy"],
  geology: ["geo", "logy"],
  spectator: ["spect", "ator"],
  dictionary: ["dict", "ion", "ary"],
  benevolent: ["bene", "vol", "ent"],
  chronological: ["chron", "o", "log", "ical"],
  hydrophobia: ["hydr", "o", "phobia"],
  antibiotic: ["anti", "bio", "tic"],
  unhurried: ["un", "hurri", "ed"],
  indifferent: ["in", "differ", "ent"],
  punctual: ["punct", "ual"],
  remarkably: ["remark", "abl", "y"],
  careless: ["care", "less"],
  hopefulness: ["hope", "ful", "ness"],
  runner: ["runn", "er"],
  agreeable: ["agree", "able"],
  uncomfortable: ["un", "comfort", "able"],
  unexpected: ["un", "expect", "ed"],
  deliberately: ["deliberate", "ly"],
  consequences: ["con", "sequ", "ence", "s"],
  impossible: ["im", "poss", "ible"],
  irregular: ["ir", "regul", "ar"],
  illegal: ["il", "leg", "al"],
  midnight: ["mid", "night"],
  forecast: ["fore", "cast"],
  microscope: ["micro", "scope"],
  thermometer: ["therm", "o", "meter"],
  democracy: ["dem", "o", "cracy"],
  philosophy: ["phil", "o", "sophy"],
  manuscript: ["man", "u", "script"],
  benefactor: ["bene", "fact", "or"],
  contradict: ["contra", "dict"],
  invisible: ["in", "vis", "ible"],
  audible: ["aud", "ible"],
  portable: ["port", "able"],
  exported: ["ex", "port", "ed"],
  reduction: ["re", "duc", "tion"],
  conductor: ["con", "duct", "or"],
  credible: ["cred", "ible"],
  incredible: ["in", "cred", "ible"],
  reader: ["read", "er"],
  creation: ["creat", "ion"],
  friendship: ["friend", "ship"],
  formless: ["form", "less"],
  actor: ["act", "or"]
};
/* the parts tile the word exactly; the kinds are what a reader expects */
Object.keys(SPLITS).forEach((w) => {
  const r = morph.analyse(w, lookup);
  check(w + " → " + SPLITS[w].join(" + "), same(texts(r), SPLITS[w]), JSON.stringify(texts(r)));
  if (r){
    check(w + " parts tile the word", r.parts.map((p) => p.text).join("") === w);
    check(w + " every part has a kind and a meaning", r.parts.every((p) => /^(prefix|root|base|suffix|ending|link)$/.test(p.kind) && p.meaning));
    check(w + " has a gloss and a confidence", typeof r.gloss === "string" && r.gloss.length > 2 && r.confidence > 0 && r.confidence <= 1, r.gloss + " / " + r.confidence);
  }
});
const kinds = (w) => morph.analyse(w, lookup).parts.map((p) => p.kind).join(" ");
check("unbreakable kinds", kinds("unbreakable") === "prefix base suffix", kinds("unbreakable"));
check("predictable kinds", kinds("predictable") === "prefix root suffix", kinds("predictable"));
check("unexpected kinds", kinds("unexpected") === "prefix base ending", kinds("unexpected"));
check("hydrophobia kinds", kinds("hydrophobia") === "root link suffix", kinds("hydrophobia"));
check("base parts carry the dictionary word", morph.analyse("unhappiness", lookup).parts[1].word === "happy");
check("roots carry an origin", morph.analyse("predictable", lookup).parts[1].origin === "Latin");

/* glosses read as English */
const G = {
  unbreakable: "not able to be broken", runner: "one who runs", careless: "without care", unhappiness: "the state of being not happy",
  biology: "the study of life", telephone: "sound from afar", democracy: "rule by the people", hydrophobia: "fear of water",
  predictable: "able to be said beforehand", invisible: "not able to be seen", transportation: "the act of carrying across",
  microscope: "an instrument for looking at small things", midnight: "the middle of the night", international: "between nations",
  disagreement: "the result of not agreeing", benefactor: "one who does well", unexpected: "not expected", spectator: "one who looks",
  incredible: "not able to be believed", rewritten: "written again", misunderstanding: "understanding wrongly"
};
Object.keys(G).forEach((w) => { const r = morph.analyse(w, lookup); check("gloss " + w + ' = "' + G[w] + '"', r && r.gloss === G[w], r && r.gloss); });
check("a two-root word joins the meanings", morph.analyse("manuscript", lookup).gloss === "hand + write", morph.analyse("manuscript", lookup).gloss);
check("confidence is high for a clean split", morph.analyse("unbreakable", lookup).confidence >= 0.7);
const guess = morph.analyse("abdicates", lookup);   /* ab + dic + ate + s: "dic" is a short, shaky spelling of dict */
check("a shaky root gives a low confidence", guess && guess.confidence < 0.5 && guess.confidence < morph.analyse("unbreakable", lookup).confidence, String(guess && guess.confidence));

/* no false splits */
["uncle", "under", "island", "red", "ring", "table", "interest", "mother", "water", "paper", "button", "carpet", "pumpkin", "cabinet",
 "unless", "letter", "started", "cats", "running", "understood", "bigger", "the", "a", "", "Lamplight's"].forEach((w) => {
  check("no breakdown for " + JSON.stringify(w), morph.analyse(w, lookup) === null, JSON.stringify(texts(morph.analyse(w, lookup))));
});
check("case and punctuation are ignored", same(texts(morph.analyse("“Unexpected,”", lookup)), ["un", "expect", "ed"]));
check("a possessive is an ending", same(texts(morph.analyse("runner's", lookup)), ["runn", "er", "'s"]), JSON.stringify(texts(morph.analyse("runner's", lookup))));

/* candidates: every stem the analysis may look up, so the app can preload their chunks */
const c = morph.candidates("unbreakable");
check("candidates include the stems", c.indexOf("break") >= 0 && c.indexOf("breakable") >= 0 && c.indexOf("unbreakable") >= 0, c.join(","));
check("candidates include repaired spellings", morph.candidates("creation").indexOf("create") >= 0 && morph.candidates("unhappiness").indexOf("happy") >= 0);
check("candidates of a non-word are empty", morph.candidates("12:30").length === 0);

/* a richer lookup (definition + part of speech) gates the endings */
const rich = (w) => ({ moth: { d: "an insect", pos: ["noun"] }, read: { d: "to look at words", pos: ["verb", "noun"] }, inter: { d: "to bury", pos: ["verb"] },
  rath: { d: "early", pos: [], obscure: true }, expect: { d: "to look for", pos: "verb" } })[w] || null;
check("mother is not moth + er (moth is a noun)", morph.analyse("mother", rich) === null);
check("reader is read + er (read is a verb)", same(texts(morph.analyse("reader", rich)), ["read", "er"]));
check("interest is not inter + est", morph.analyse("interest", rich) === null);
check("rather is not rath + er (an obscure base)", morph.analyse("rather", rich) === null);
check("unexpected with a rich lookup", same(texts(morph.analyse("unexpected", rich)), ["un", "expect", "ed"]));

const fails = results.filter((r) => !r.ok);
console.log("\n" + (results.length - fails.length) + "/" + results.length + " checks passed");
process.exit(fails.length ? 1 : 0);
