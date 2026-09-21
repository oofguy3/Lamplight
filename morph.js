/* lamplight — word parts (see llMorph) */
/* ============================================================
   Lamplight — word parts
   Breaks a word into prefix, root / base and suffix with the
   meaning and origin of each part, from tables of the classic
   Latin, Greek and English affixes and bound roots, plus a
   readable "put together" gloss. No network needed.
   window.llMorph.analyse(word, lookup)
   ============================================================ */
(function(global){
  "use strict";

  /* ---------- prefixes ----------
     f: the form, alt: other spellings (assimilated forms), m: meaning, o: origin (L Latin,
     G Greek, E Old English, F French — spelled out when the file loads).
     free: attaches to ordinary English words (un-happy, re-write); the others mostly
     join bound roots (ab-duct, syn-thesis) and are not trusted in front of a plain word.
     cf: a combining form (photo-, bio-) — only ever the first part of a word.
     t: gloss template, {x} being the rest of the word's meaning. */
  var PREFIXES = [
 { f: "un", m: "not, opposite of", o: "E", free: 1, t: "not {x}" },
 { f: "re", m: "again, back", o: "L", free: 1, t: "{x} again" },
 { f: "pre", m: "before", o: "L", free: 1, t: "{x} beforehand" },
 { f: "dis", m: "not, apart, away", o: "L", free: 1, t: "not {x}", tv: "{x} apart", alt: ["di", "dif"] },
 { f: "mis", m: "wrongly, badly", o: "E", free: 1, t: "{x} wrongly" },
 { f: "in", m: "not; also in, into", o: "L", free: 1, t: "not {x}", tv: "{x} in", alt: ["im", "il", "ir"] },
 { f: "non", m: "not", o: "L", free: 1, t: "not {x}" },
 { f: "over", m: "too much, above", o: "E", free: 1, t: "{x} too much" },
 { f: "under", m: "too little, beneath", o: "E", free: 1, t: "{x} too little" },
 { f: "out", m: "beyond, more than", o: "E", free: 1, t: "{x} beyond" },
 { f: "sub", m: "under, below", o: "L", free: 1, t: "{x} beneath", alt: ["sup", "suf", "sug", "sus", "suc"] },
 { f: "super", m: "above, beyond", o: "L", free: 1, t: "{x} above" },
 { f: "trans", m: "across, through", o: "L", free: 1, t: "{x} across" },
 { f: "inter", m: "between, among", o: "L", free: 1, t: "{x} between", alt: ["intel"] },
 { f: "intra", m: "within", o: "L", free: 1, t: "{x} within", alt: ["intro"] },
 { f: "anti", m: "against", o: "G", free: 1, t: "against {x}", alt: ["ant"] },
 { f: "auto", m: "self", o: "G", free: 1, cf: 1, t: "{x} of oneself" },
 { f: "bi", m: "two, twice", o: "L", t: "two {x}" },
 { f: "tri", m: "three", o: "L", t: "three {x}" },
 { f: "co", m: "with, together", o: "L", free: 1, t: "{x} together", alt: ["com", "con", "col", "cor"] },
 { f: "de", m: "down, away, undo", o: "L", free: 1, t: "{x} away" },
 { f: "ex", m: "out of, former", o: "L", free: 1, t: "{x} out", alt: ["ef"] },
 { f: "extra", m: "beyond, outside", o: "L", free: 1, t: "beyond {x}" },
 { f: "fore", m: "before, in front", o: "E", free: 1, t: "{x} beforehand" },
 { f: "hyper", m: "over, excessive", o: "G", free: 1, t: "excessively {x}" },
 { f: "hypo", m: "under, too little", o: "G", free: 1, t: "{x} beneath" },
 { f: "micro", m: "small", o: "G", free: 1, cf: 1, t: "small {x}" },
 { f: "macro", m: "large", o: "G", free: 1, cf: 1, t: "large {x}" },
 { f: "mono", m: "one, single", o: "G", cf: 1, t: "single {x}" },
 { f: "multi", m: "many", o: "L", free: 1, t: "many {x}" },
 { f: "post", m: "after", o: "L", free: 1, t: "{x} afterwards" },
 { f: "pro", m: "forward, in favour of", o: "L", t: "{x} forward" },
 { f: "semi", m: "half, partly", o: "L", free: 1, t: "half {x}" },
 { f: "tele", m: "far, distant", o: "G", cf: 1, t: "{x} from afar" },
 { f: "ultra", m: "beyond, extremely", o: "L", free: 1, t: "extremely {x}" },
 { f: "uni", m: "one", o: "L", t: "one {x}" },
 { f: "poly", m: "many", o: "G", cf: 1, t: "many {x}" },
 { f: "photo", m: "light", o: "G", cf: 1, t: "{x} by light" },
 { f: "bio", m: "life, living things", o: "G", cf: 1, t: "{x} of life" },
 { f: "geo", m: "earth", o: "G", cf: 1, t: "{x} of the earth" },
 { f: "psycho", m: "mind", o: "G", cf: 1, t: "{x} of the mind" },
 { f: "circum", m: "around", o: "L", t: "{x} around" },
 { f: "counter", m: "against, opposite", o: "L", free: 1, t: "{x} in return" },
 { f: "en", m: "make, put into", o: "F", free: 1, t: "make {x}", alt: ["em"] },
 { f: "mid", m: "middle", o: "E", free: 1, t: "the middle of the {x}" },
 { f: "mal", m: "bad, badly", o: "L", free: 1, t: "{x} badly" },
 { f: "bene", m: "good, well", o: "L", t: "{x} well" },
 { f: "omni", m: "all", o: "L", t: "all-{x}" },
 { f: "pan", m: "all", o: "G", t: "all-{x}" },
 { f: "para", m: "beside, beyond", o: "G", free: 1, t: "{x} alongside" },
 { f: "peri", m: "around", o: "G", t: "{x} around" },
 { f: "syn", m: "together, with", o: "G", free: 1, t: "{x} together", alt: ["sym", "syl"] },
 { f: "ab", m: "away from", o: "L", t: "{x} away", alt: ["abs"] },
 { f: "ad", m: "to, toward", o: "L", t: "{x} toward", alt: ["ac", "af", "ag", "al", "ap", "ar", "as", "at"] },
 { f: "per", m: "through, thoroughly", o: "L", t: "{x} through" },
 { f: "retro", m: "backward", o: "L", free: 1, t: "{x} backward" },
 { f: "pseudo", m: "false", o: "G", free: 1, cf: 1, t: "false {x}" },
 { f: "neo", m: "new", o: "G", free: 1, cf: 1, t: "new {x}" },
 { f: "hetero", m: "different, other", o: "G", cf: 1, t: "{x} of different kinds" },
 { f: "homo", m: "same", o: "G", cf: 1, t: "{x} of the same kind" },
 { f: "iso", m: "equal", o: "G", cf: 1, t: "equal {x}" },
 { f: "meta", m: "beyond, change", o: "G", t: "{x} beyond" },
 { f: "vice", m: "in place of", o: "L", free: 1, t: "deputy {x}" },
 { f: "arch", m: "chief, principal", o: "G", free: 1, t: "chief {x}" },
 { f: "a", m: "not, without", o: "G", t: "without {x}", alt: ["an"] },
 { f: "be", m: "thoroughly, make", o: "E", free: 1, t: "thoroughly {x}" },
 { f: "with", m: "against, back", o: "E", free: 1, t: "{x} back" },
 { f: "dia", m: "through, across", o: "G", t: "{x} through" },
 { f: "epi", m: "upon, over", o: "G", t: "{x} upon" },
 { f: "eu", m: "good, well", o: "G", t: "good {x}" },
 { f: "hemi", m: "half", o: "G", t: "half {x}" },
 { f: "kilo", m: "thousand", o: "G", cf: 1, t: "a thousand {x}" },
 { f: "mega", m: "great, million", o: "G", cf: 1, t: "great {x}" },
 { f: "milli", m: "thousandth", o: "L", t: "a thousandth of {x}" },
 { f: "centi", m: "hundredth", o: "L", t: "a hundredth of {x}" },
 { f: "deci", m: "tenth", o: "L", t: "a tenth of {x}" },
 { f: "quad", m: "four", o: "L", t: "four {x}", alt: ["quadr", "quadri"] },
 { f: "sept", m: "seven", o: "L", t: "seven {x}" },
 { f: "oct", m: "eight", o: "G", t: "eight {x}", alt: ["octo", "octa"] },
 { f: "dec", m: "ten", o: "G", t: "ten {x}", alt: ["deca"] },
 { f: "ambi", m: "both", o: "L", t: "both {x}", alt: ["amphi"] },
 { f: "ante", m: "before", o: "L", t: "{x} beforehand" },
 { f: "contra", m: "against", o: "L", t: "{x} against", alt: ["contro"] },
 { f: "demi", m: "half", o: "F", t: "half {x}" },
 { f: "equi", m: "equal", o: "L", t: "equal {x}" },
 { f: "infra", m: "below", o: "L", t: "{x} below" },
 { f: "juxta", m: "beside", o: "L", t: "{x} side by side" },
 { f: "ob", m: "against, in the way", o: "L", t: "{x} against", alt: ["oc", "of", "op"] },
 { f: "se", m: "apart, aside", o: "L", t: "{x} apart" },
 { f: "sur", m: "over, above", o: "F", free: 1, t: "{x} over" },
 { f: "ecto", m: "outside", o: "G", cf: 1, t: "outer {x}" },
 { f: "endo", m: "inside, within", o: "G", cf: 1, t: "inner {x}" },
 { f: "exo", m: "outside", o: "G", cf: 1, t: "outer {x}" },
 { f: "oligo", m: "few", o: "G", cf: 1, t: "few {x}" },
 { f: "proto", m: "first", o: "G", cf: 1, t: "first {x}" },
 { f: "pyro", m: "fire", o: "G", cf: 1, t: "{x} of fire" },
 { f: "self", m: "oneself", o: "E", free: 1, t: "{x} of oneself" },
 { f: "twi", m: "two", o: "E", t: "two {x}" },
 { f: "penta", m: "five", o: "G", t: "five {x}", alt: ["pent"] },
 { f: "hexa", m: "six", o: "G", t: "six {x}" },
 { f: "tetra", m: "four", o: "G", t: "four {x}" },
 { f: "dys", m: "bad, difficult", o: "G", t: "bad {x}" },
 { f: "ana", m: "up, back, again", o: "G", t: "{x} again" },
 { f: "apo", m: "away from", o: "G", t: "{x} away" },
 { f: "cata", m: "down, thoroughly", o: "G", t: "{x} down" },
 { f: "eco", m: "house, environment", o: "G", free: 1, cf: 1, t: "{x} of the environment" },
 { f: "step", m: "related by remarriage", o: "E", free: 1, t: "{x} by remarriage" },
 { f: "after", m: "later, behind", o: "E", free: 1, t: "{x} afterwards" },
 { f: "supra", m: "above, beyond", o: "L", t: "{x} above" },
 { f: "quasi", m: "as if, partly", o: "L", free: 1, t: "partly {x}" },
 { f: "mini", m: "small", o: "L", free: 1, t: "small {x}" }
  ];

  /* ---------- suffixes ----------
     pos: the kind of word the suffix makes; need: what it attaches to (n noun, v verb,
     a adjective — checked only when the dictionary tells us the base's part of speech);
     t: gloss template — {b} the base, {bed} its past participle, {bing} its -ing form,
     {bs} its -s form. greek: a Greek combining form that can close a word on its own
     (bio-logy, micro-scope). end: a grammatical ending, not a word-building suffix. */
  var SUFFIXES = [
    /* grammatical endings */
 { f: "s", alt: ["es"], m: "plural or present tense", pos: "", need: "nv", o: "E", t: "{bs}", end: 1 },
 { f: "ed", alt: ["d"], m: "past tense / participle", pos: "", need: "v", o: "E", t: "{bed}", end: 1 },
 { f: "ing", m: "ongoing / participle", pos: "", need: "vn", o: "E", t: "{bing}", end: 1 },
 { f: "en", m: "past participle", pos: "", need: "v", o: "E", t: "{bed}", end: 1, hide: 1 },
 { f: "er", m: "more", pos: "", need: "a", o: "E", t: "more {b}", end: 1 },
 { f: "est", m: "most", pos: "", need: "a", o: "E", t: "most {b}", end: 1 },
 { f: "'s", alt: ["’s"], m: "possessive", pos: "", need: "n", o: "E", t: "{b}'s", end: 1 },
 { f: "able", alt: ["ible", "abil", "ibil"], m: "can be, worthy of", pos: "a", need: "vn", o: "L", t: "able to be {bed}" },
 { f: "al", alt: ["ial", "ual"], m: "relating to", pos: "a", need: "nv", o: "L", t: "relating to {b}" },
 { f: "ance", alt: ["ence", "iance"], m: "state, act of", pos: "n", need: "va", o: "L", t: "the act of {bing}" },
 { f: "ancy", alt: ["ency"], m: "state, quality", pos: "n", need: "va", o: "L", t: "the state of {bing}" },
 { f: "ant", alt: ["ent", "ient"], m: "doing; one who", pos: "a", need: "v", o: "L", t: "{bing}" },
 { f: "ar", m: "relating to; one who", pos: "a", need: "nv", o: "L", t: "relating to {b}" },
 { f: "ary", alt: ["ery", "ury"], m: "place for; relating to", pos: "n", need: "nv", o: "L", t: "relating to {b}" },
 { f: "ory", alt: ["atory"], m: "place for; relating to", pos: "n", need: "nv", o: "L", t: "a place for {bing}" },
 { f: "ate", m: "make, cause; having", pos: "v", need: "nva", o: "L", t: "to make {b}" },
 { f: "ation", alt: ["tion", "sion", "ition", "ion", "ution"], m: "act, process, result", pos: "n", need: "v", o: "L", t: "the act of {bing}" },
 { f: "cy", m: "state, quality", pos: "n", need: "na", o: "L", t: "the state of being {b}" },
 { f: "dom", m: "state, realm of", pos: "n", need: "na", o: "E", t: "the state of being {b}" },
 { f: "ee", m: "one who receives", pos: "n", need: "v", o: "F", t: "one who is {bed}" },
 { f: "eer", m: "one who works with", pos: "n", need: "n", o: "F", t: "one who works with {b}" },
 { f: "en", m: "make, become; made of", pos: "v", need: "an", o: "E", t: "to make {b}" },
 { f: "er", alt: ["or", "ator", "yer"], m: "one who; that which", pos: "n", need: "v", o: "E", t: "one who {bs}" },
 { f: "ese", m: "of a place; language", pos: "a", need: "n", o: "F", t: "of {b}" },
 { f: "esque", m: "in the style of", pos: "a", need: "n", o: "F", t: "in the style of {b}" },
 { f: "ess", m: "female", pos: "n", need: "n", o: "F", t: "a female {b}" },
 { f: "ette", m: "small; female", pos: "n", need: "n", o: "F", t: "a small {b}" },
 { f: "fold", m: "multiplied by", pos: "a", need: "na", o: "E", t: "{b} times over" },
 { f: "ful", alt: ["full"], m: "full of; amount", pos: "a", need: "nv", o: "E", t: "full of {b}" },
 { f: "fy", alt: ["ify", "efy"], m: "make, become", pos: "v", need: "nav", o: "L", t: "to make {b}" },
 { f: "hood", m: "state, group of", pos: "n", need: "na", o: "E", t: "the state of being a {b}" },
 { f: "ic", alt: ["ical", "tic", "atic"], m: "relating to, like", pos: "a", need: "nv", o: "G", t: "relating to {b}" },
 { f: "ics", m: "science, art of", pos: "n", need: "n", o: "G", t: "the science of {b}" },
 { f: "ile", m: "able to, relating to", pos: "a", need: "nv", o: "L", t: "able to {b}" },
 { f: "ine", m: "of, like; chemical", pos: "a", need: "n", o: "L", t: "of {b}" },
 { f: "ish", m: "somewhat, like", pos: "a", need: "an", o: "E", t: "somewhat {b}" },
 { f: "ism", m: "belief, practice", pos: "n", need: "nav", o: "G", t: "the practice of {b}" },
 { f: "ist", m: "one who practises", pos: "n", need: "nav", o: "G", t: "one who practises {b}" },
 { f: "ite", m: "follower; mineral", pos: "n", need: "n", o: "G", t: "a follower of {b}" },
 { f: "ity", alt: ["ty", "iety"], m: "quality, state", pos: "n", need: "a", o: "L", t: "the quality of being {b}" },
 { f: "ive", alt: ["ative", "itive", "sive"], m: "tending to", pos: "a", need: "vn", o: "L", t: "tending to {b}" },
 { f: "ize", alt: ["ise"], m: "make, become", pos: "v", need: "nav", o: "G", t: "to make {b}" },
 { f: "less", m: "without", pos: "a", need: "nv", o: "E", t: "without {b}" },
 { f: "let", m: "small", pos: "n", need: "n", o: "F", t: "a small {b}" },
 { f: "like", m: "resembling", pos: "a", need: "n", o: "E", t: "like a {b}" },
 { f: "ling", m: "small, young", pos: "n", need: "na", o: "E", t: "a young {b}" },
 { f: "ly", alt: ["ally"], m: "in a way; like", pos: "r", need: "an", o: "E", t: "in a {b} way" },
 { f: "ment", m: "result, act of", pos: "n", need: "v", o: "L", t: "the result of {bing}" },
 { f: "ness", m: "state of being", pos: "n", need: "a", o: "E", t: "the state of being {b}" },
 { f: "oid", m: "resembling", pos: "a", need: "n", o: "G", t: "resembling {b}" },
 { f: "ous", alt: ["ious", "eous", "ulous"], m: "full of, having", pos: "a", need: "nv", o: "L", t: "full of {b}" },
 { f: "ose", m: "full of", pos: "a", need: "n", o: "L", t: "full of {b}", whole: "a" },
 { f: "ship", m: "state, skill, office", pos: "n", need: "na", o: "E", t: "the state of being a {b}" },
 { f: "some", m: "tending to, causing", pos: "a", need: "nva", o: "E", t: "causing {b}" },
 { f: "th", alt: ["eth"], m: "state, quality; number", pos: "n", need: "av", o: "E", t: "the state of being {b}" },
 { f: "tude", alt: ["itude"], m: "state, quality", pos: "n", need: "a", o: "L", t: "the state of being {b}" },
 { f: "ure", alt: ["ature"], m: "act, result, means", pos: "n", need: "v", o: "L", t: "the result of {bing}" },
 { f: "ward", alt: ["wards"], m: "in the direction of", pos: "r", need: "na", o: "E", t: "toward {b}" },
 { f: "wise", m: "in the manner of", pos: "r", need: "na", o: "E", t: "in the manner of {b}" },
 { f: "y", alt: ["ey"], m: "having, like; state", pos: "a", need: "nv", o: "E", t: "having {b}" },
 { f: "an", alt: ["ian"], m: "belonging to; one who", pos: "n", need: "n", o: "L", t: "one belonging to {b}" },
 { f: "age", m: "action, collection", pos: "n", need: "nv", o: "F", t: "the act of {bing}" },
 { f: "ade", m: "action, product", pos: "n", need: "nv", o: "F", t: "the product of {bing}" },
 { f: "ern", m: "direction", pos: "a", need: "n", o: "E", t: "in the direction of {b}" },
 { f: "ster", m: "one who is or does", pos: "n", need: "nav", o: "E", t: "one who {bs}" },
    /* Greek and Latin combining forms that close a word (bio-logy, micro-scope) */
 { f: "logy", alt: ["ology"], m: "study of", pos: "n", need: "n", o: "G", t: "the study of {b}", greek: 1 },
 { f: "logist", alt: ["ologist"], m: "one who studies", pos: "n", need: "n", o: "G", t: "one who studies {b}", greek: 1 },
 { f: "itis", m: "inflammation", pos: "n", need: "n", o: "G", t: "inflammation of the {b}", greek: 1 },
 { f: "phobia", alt: ["phobe", "phobic"], m: "fear of", pos: "n", need: "n", o: "G", t: "fear of {b}", greek: 1 },
 { f: "philia", alt: ["phile", "philic"], m: "love of", pos: "n", need: "n", o: "G", t: "love of {b}", greek: 1 },
 { f: "cide", alt: ["cidal"], m: "killing, killer", pos: "n", need: "n", o: "L", t: "the killing of {b}", greek: 1 },
 { f: "cracy", alt: ["crat", "cratic"], m: "rule, government", pos: "n", need: "n", o: "G", t: "rule by {b}", greek: 1 },
 { f: "gram", m: "something written", pos: "n", need: "n", o: "G", greek: 1 },
 { f: "graph", m: "writing, recording", pos: "n", need: "n", o: "G", greek: 1 },
 { f: "graphy", m: "writing about", pos: "n", need: "n", o: "G", t: "writing about {b}", greek: 1 },
 { f: "sophy", m: "wisdom", pos: "n", need: "n", o: "G", t: "{b} of wisdom", greek: 1 },
 { f: "worthy", m: "deserving", pos: "a", need: "nv", o: "E", t: "deserving {b}" },
 { f: "proof", m: "protected against", pos: "a", need: "n", o: "E", t: "protected against {b}" },
 { f: "monger", m: "dealer in", pos: "n", need: "n", o: "E", t: "a dealer in {b}" },
 { f: "wright", m: "maker", pos: "n", need: "n", o: "E", t: "a maker of {bs}" },
 { f: "escent", m: "becoming", pos: "a", need: "nv", o: "L", t: "becoming {b}" },
 { f: "meter", alt: ["metre"], m: "measure", pos: "n", need: "n", o: "G", t: "an instrument that measures {b}", greek: 1 },
 { f: "metry", m: "measuring", pos: "n", need: "n", o: "G", t: "the measuring of {b}", greek: 1 },
 { f: "nomy", alt: ["nomic"], m: "law, system of", pos: "n", need: "n", o: "G", t: "the laws of {b}", greek: 1 },
 { f: "scope", alt: ["scopy", "scopic"], m: "instrument for viewing", pos: "n", need: "n", o: "G", t: "an instrument for looking at {b}", greek: 1 },
 { f: "archy", m: "rule, government", pos: "n", need: "n", o: "G", t: "rule by {b}", greek: 1 },
 { f: "sphere", m: "ball, region", pos: "n", need: "n", o: "G", t: "the region of {b}", greek: 1 },
 { f: "tomy", m: "cutting", pos: "n", need: "n", o: "G", t: "cutting into the {b}", greek: 1 },
 { f: "ectomy", m: "surgical removal", pos: "n", need: "n", o: "G", t: "surgical removal of the {b}", greek: 1 },
 { f: "therapy", m: "treatment", pos: "n", need: "n", o: "G", t: "treatment using {b}", greek: 1 },
 { f: "phone", alt: ["phonic", "phony"], m: "sound, voice", pos: "n", need: "n", o: "G", greek: 1 },
 { f: "path", alt: ["pathy", "pathic"], m: "feeling; disease", pos: "n", need: "n", o: "G", greek: 1 },
 { f: "mania", alt: ["maniac"], m: "madness for", pos: "n", need: "n", o: "G", t: "a madness for {b}", greek: 1 },
 { f: "genic", m: "producing, born of", pos: "a", need: "n", o: "G", t: "producing {b}", greek: 1 },
 { f: "algia", m: "pain", pos: "n", need: "n", o: "G", t: "pain in the {b}", greek: 1 },
 { f: "osis", m: "condition, process", pos: "n", need: "n", o: "G", t: "a condition of {b}", greek: 1 },
 { f: "emia", alt: ["aemia"], m: "blood condition", pos: "n", need: "n", o: "G", t: "a blood condition involving {b}", greek: 1 },
  ];

  /* ---------- bound roots ----------
     m: meaning (a verb first when the root is verbal, so the gloss can conjugate it);
     n: the noun phrase the Greek templates want ("the study of {n}") when the meaning
     doesn't read well there. Roots of three letters are treated as weak (too easy to
     find by accident inside ordinary words) unless marked s; longer ones that collide
     with everyday words (cent, fort, ten) are marked w. */
  var ROOTS = [
 { f: "spect", alt: ["spic"], m: "look, see", o: "L" },
 { f: "port", m: "carry", o: "L" },
 { f: "dict", alt: ["dic"], m: "say, speak", o: "L" },
 { f: "scrib", alt: ["script"], m: "write", o: "L" },
 { f: "vis", alt: ["vid"], m: "see", o: "L", s: 1 },
 { f: "aud", alt: ["audit"], m: "hear", o: "L", s: 1 },
 { f: "ject", alt: ["jac"], m: "throw", o: "L" },
 { f: "duc", alt: ["duct"], m: "lead", o: "L", s: 1 },
 { f: "mit", alt: ["miss", "mitt"], m: "send", o: "L", s: 1 },
 { f: "cred", m: "believe, trust", o: "L" },
 { f: "fac", alt: ["fact", "fect", "fic", "fici", "feas"], m: "do, make", o: "L", s: 1 },
 { f: "graph", alt: ["gram"], m: "write, record", o: "G", n: "writing" },
 { f: "log", alt: ["logue"], m: "word, reason", o: "G", s: 1, n: "words" },
 { f: "phon", m: "sound, voice", o: "G", n: "sound" },
 { f: "bio", m: "life", o: "G", s: 1 },
 { f: "chron", m: "time", o: "G" },
 { f: "geo", alt: ["ge"], m: "earth", o: "G", s: 1, n: "the earth" },
 { f: "path", m: "feeling, disease", o: "G", n: "disease" },
 { f: "photo", alt: ["phot"], m: "light", o: "G" },
 { f: "scop", m: "look, watch", o: "G" },
 { f: "therm", m: "heat", o: "G" },
 { f: "aqua", alt: ["aqu"], m: "water", o: "L" },
 { f: "cap", alt: ["capt", "cept", "ceiv", "ceit", "cip", "cup"], m: "take, seize", o: "L", w: 1 },
 { f: "ced", alt: ["ceed", "cess"], m: "go, yield", o: "L", s: 1 },
 { f: "clud", alt: ["clus", "clos"], m: "shut, close", o: "L" },
 { f: "cur", alt: ["curs", "cours"], m: "run", o: "L", s: 1 },
 { f: "fer", m: "carry, bear", o: "L", s: 1 },
 { f: "flect", alt: ["flex"], m: "bend", o: "L" },
 { f: "form", m: "shape", o: "L" },
 { f: "fract", alt: ["frag", "frang"], m: "break", o: "L" },
 { f: "grat", m: "pleasing, thankful", o: "L" },
 { f: "greg", m: "flock, group", o: "L" },
 { f: "jur", alt: ["jus"], m: "law, right", o: "L" },
 { f: "loc", m: "place", o: "L", s: 1 },
 { f: "loqu", alt: ["locut"], m: "speak, talk", o: "L" },
 { f: "manu", alt: ["man", "mani"], m: "hand", o: "L", s: 1 },
 { f: "mem", alt: ["memor"], m: "remember, mindful", o: "L", s: 1 },
 { f: "mort", m: "death", o: "L" },
 { f: "mov", alt: ["mot", "mob"], m: "move", o: "L", s: 1 },
 { f: "nov", m: "new", o: "L", s: 1 },
 { f: "pel", alt: ["puls"], m: "drive, push", o: "L", s: 1 },
 { f: "pend", alt: ["pond"], m: "hang, weigh", o: "L" },
 { f: "pens", m: "pay, weigh", o: "L" },
 { f: "ped", alt: ["pod"], m: "foot", o: "L", s: 1 },
 { f: "pon", alt: ["pos", "posit"], m: "put, place", o: "L", s: 1 },
 { f: "rupt", m: "break, burst", o: "L" },
 { f: "sect", alt: ["seg"], m: "cut", o: "L" },
 { f: "sent", alt: ["sens"], m: "feel, think", o: "L" },
 { f: "sequ", alt: ["secut", "sue"], m: "follow", o: "L" },
 { f: "sol", m: "alone; sun", o: "L" },
 { f: "spir", m: "breathe", o: "L" },
 { f: "struct", alt: ["stru"], m: "build", o: "L" },
 { f: "tang", alt: ["tact", "tag", "tig"], m: "touch", o: "L", w: 1 },
 { f: "tain", alt: ["ten", "tent", "tin"], m: "hold", o: "L", w: 1 },
 { f: "terr", alt: ["terra"], m: "earth, land", o: "L" },
 { f: "tract", m: "pull, draw", o: "L" },
 { f: "vac", m: "empty", o: "L", s: 1 },
 { f: "ven", alt: ["vent"], m: "come", o: "L", w: 1 },
 { f: "ver", m: "true", o: "L" },
 { f: "vert", alt: ["vers"], m: "turn", o: "L" },
 { f: "viv", alt: ["vit"], m: "live, life", o: "L", s: 1 },
 { f: "voc", alt: ["vok", "voke"], m: "call, voice", o: "L", s: 1 },
 { f: "vol", m: "wish, will", o: "L", s: 1 },
 { f: "anthrop", m: "human", o: "G", n: "human beings" },
 { f: "arch", alt: ["arche"], m: "rule, chief; ancient", o: "G", w: 1 },
 { f: "astr", alt: ["aster"], m: "star", o: "G", n: "the stars" },
 { f: "auto", m: "self", o: "G", n: "oneself" },
 { f: "crat", alt: ["crac"], m: "rule, power", o: "G" },
 { f: "dem", m: "people", o: "G", s: 1, n: "the people" },
 { f: "derm", alt: ["dermat"], m: "skin", o: "G", n: "the skin" },
 { f: "gen", alt: ["gener", "genit"], m: "birth, kind, produce", o: "G", s: 1 },
 { f: "hydr", m: "water", o: "G" },
 { f: "metr", alt: ["meter"], m: "measure", o: "G" },
 { f: "morph", m: "form, shape", o: "G" },
 { f: "neur", m: "nerve", o: "G", n: "the nerves" },
 { f: "nom", alt: ["nym", "onym"], m: "name; law", o: "G", s: 1 },
 { f: "phil", m: "love", o: "G" },
 { f: "phob", m: "fear", o: "G" },
 { f: "polis", alt: ["polit", "poli"], m: "city, citizen", o: "G" },
 { f: "psych", m: "mind, soul", o: "G", n: "the mind" },
 { f: "soph", m: "wisdom", o: "G" },
 { f: "techn", m: "art, skill", o: "G", n: "craft" },
 { f: "theo", m: "god", o: "G" },
 { f: "zo", m: "animal", o: "G", n: "animals" },
 { f: "cardi", m: "heart", o: "G", n: "the heart" },
 { f: "cosm", m: "universe, order", o: "G", n: "the universe" },
 { f: "cycl", m: "circle, wheel", o: "G" },
 { f: "dyn", alt: ["dynam"], m: "power, force", o: "G", s: 1 },
 { f: "erg", alt: ["urg"], m: "work", o: "G", s: 1 },
 { f: "hypn", m: "sleep", o: "G" },
 { f: "lith", m: "stone", o: "G" },
 { f: "opt", m: "eye, sight; choose", o: "G" },
 { f: "orth", m: "straight, correct", o: "G" },
 { f: "pale", m: "ancient", o: "G", w: 1 },
 { f: "phys", alt: ["physi"], m: "nature, body", o: "G", n: "nature" },
 { f: "pyr", m: "fire", o: "G", s: 1 },
 { f: "tox", m: "poison", o: "G", s: 1 },
 { f: "pater", alt: ["patri", "patr", "patern"], m: "father", o: "L", n: "fathers" },
 { f: "mater", alt: ["matri", "matr", "matern"], m: "mother", o: "L", n: "mothers" },
 { f: "materi", m: "matter, material", o: "L" },
 { f: "frater", alt: ["fratern"], m: "brother", o: "L" },
 { f: "domin", alt: ["dom"], m: "master, rule", o: "L", s: 1 },
 { f: "reg", alt: ["rect", "regul"], m: "rule, straight", o: "L", s: 1 },
 { f: "lum", alt: ["luc", "lumin"], m: "light", o: "L", s: 1 },
 { f: "magn", alt: ["magni"], m: "great", o: "L" },
 { f: "min", alt: ["mini"], m: "small, less", o: "L", s: 1 },
 { f: "maj", m: "greater", o: "L", s: 1 },
 { f: "medi", m: "middle", o: "L" },
 { f: "nat", m: "born", o: "L" },
 { f: "ora", alt: ["orat"], m: "speak, pray", o: "L" },
 { f: "pac", m: "peace", o: "L", s: 1 },
 { f: "prim", alt: ["prime"], m: "first", o: "L" },
 { f: "sci", m: "know", o: "L", s: 1 },
 { f: "simil", alt: ["simul", "sembl"], m: "like, together", o: "L" },
 { f: "sta", alt: ["stat", "stit", "sist"], m: "stand", o: "L", s: 1 },
 { f: "urb", m: "city", o: "L", s: 1 },
 { f: "ann", alt: ["enn"], m: "year", o: "L", s: 1 },
 { f: "bell", alt: ["belli"], m: "war", o: "L", w: 1 },
 { f: "brev", m: "short", o: "L" },
 { f: "cand", m: "glow, white", o: "L" },
 { f: "carn", m: "flesh", o: "L" },
 { f: "cent", m: "hundred", o: "L" },
 { f: "cid", alt: ["cis"], m: "cut, kill", o: "L", s: 1 },
 { f: "civ", m: "citizen", o: "L", s: 1 },
 { f: "clam", alt: ["claim"], m: "shout, cry out", o: "L", w: 1 },
 { f: "clin", alt: ["cline"], m: "lean, bend", o: "L" },
 { f: "cogn", alt: ["gnos", "gnit"], m: "know", o: "L" },
 { f: "cord", m: "heart", o: "L" },
 { f: "corp", alt: ["corpor"], m: "body", o: "L" },
 { f: "crypt", m: "hidden", o: "G", n: "hidden things" },
 { f: "cult", m: "till, care for", o: "L" },
 { f: "dent", m: "tooth", o: "L", w: 1 },
 { f: "dign", m: "worthy", o: "L" },
 { f: "doc", alt: ["doct"], m: "teach", o: "L", s: 1 },
 { f: "dorm", m: "sleep", o: "L" },
 { f: "dur", m: "hard, last", o: "L", s: 1 },
 { f: "ego", m: "I, self", o: "L", s: 1 },
 { f: "equ", alt: ["equi"], m: "equal", o: "L", s: 1 },
 { f: "ess", m: "be", o: "L", s: 1 },
 { f: "fid", m: "faith, trust", o: "L", s: 1 },
 { f: "fin", alt: ["finit"], m: "end, limit", o: "L", s: 1 },
 { f: "flu", alt: ["flux", "fluct"], m: "flow", o: "L", s: 1 },
 { f: "fort", m: "strong", o: "L", w: 1 },
 { f: "fug", m: "flee", o: "L", s: 1 },
 { f: "gest", m: "carry, bear", o: "L" },
 { f: "grad", alt: ["gress"], m: "step, go", o: "L" },
 { f: "hab", alt: ["hib"], m: "have, hold", o: "L", s: 1 },
 { f: "her", alt: ["hes"], m: "stick, cling", o: "L" },
 { f: "hosp", alt: ["host"], m: "guest, host", o: "L", w: 1 },
 { f: "jud", alt: ["judic"], m: "judge", o: "L", s: 1 },
 { f: "junct", alt: ["jug"], m: "join", o: "L" },
 { f: "lab", alt: ["labor"], m: "work", o: "L", s: 1 },
 { f: "lat", m: "carry, bear; side", o: "L", s: 1 },
 { f: "leg", m: "law", o: "L", s: 1 },
 { f: "lect", alt: ["lig"], m: "choose, gather, read", o: "L" },
 { f: "liber", m: "free; book", o: "L", w: 1 },
 { f: "lingu", alt: ["lingua"], m: "tongue, language", o: "L" },
 { f: "liter", alt: ["litera"], m: "letter", o: "L" },
 { f: "luna", alt: ["lun"], m: "moon", o: "L" },
 { f: "mand", m: "order, entrust", o: "L" },
 { f: "mar", alt: ["mari"], m: "sea", o: "L", s: 1 },
 { f: "migr", m: "move, wander", o: "L" },
 { f: "mil", alt: ["milit"], m: "soldier", o: "L" },
 { f: "mir", m: "wonder", o: "L", s: 1 },
 { f: "mod", m: "measure, manner", o: "L" },
 { f: "mon", alt: ["monit"], m: "warn, remind", o: "L" },
 { f: "mut", m: "change", o: "L", s: 1 },
 { f: "narr", m: "tell", o: "L" },
 { f: "nav", alt: ["nau", "naut", "navig"], m: "ship, sail", o: "L", s: 1 },
 { f: "neg", m: "deny, no", o: "L", s: 1 },
 { f: "noc", alt: ["nox"], m: "harm; night", o: "L" },
 { f: "not", m: "mark, know", o: "L" },
 { f: "numer", m: "number", o: "L" },
 { f: "ocul", m: "eye", o: "L" },
 { f: "oper", m: "work", o: "L" },
 { f: "pass", alt: ["pati"], m: "suffer, feel; step", o: "L", w: 1 },
 { f: "pict", m: "paint", o: "L" },
 { f: "plac", m: "please, calm", o: "L", w: 1 },
 { f: "plen", alt: ["plet"], m: "fill, full", o: "L" },
 { f: "plic", alt: ["plex", "ply", "plicat"], m: "fold", o: "L" },
 { f: "popul", m: "people", o: "L" },
 { f: "prehend", alt: ["pris", "prehens"], m: "grasp, seize", o: "L" },
 { f: "prob", m: "test, prove", o: "L", w: 1 },
 { f: "pugn", m: "fight", o: "L" },
 { f: "punct", alt: ["pung"], m: "point, prick", o: "L" },
 { f: "put", m: "think, reckon", o: "L" },
 { f: "quer", alt: ["quir", "quis", "quest"], m: "ask, seek", o: "L" },
 { f: "rad", alt: ["radic"], m: "root; ray", o: "L" },
 { f: "rid", alt: ["ris"], m: "laugh", o: "L" },
 { f: "rog", m: "ask", o: "L", s: 1 },
 { f: "sal", alt: ["sult", "sil"], m: "leap; salt", o: "L" },
 { f: "sanct", m: "holy", o: "L" },
 { f: "sat", alt: ["satis"], m: "enough", o: "L" },
 { f: "sed", alt: ["sess", "sid"], m: "sit, settle", o: "L", s: 1 },
 { f: "sen", alt: ["senil"], m: "old", o: "L" },
 { f: "sign", m: "mark, sign", o: "L", w: 1 },
 { f: "soci", m: "companion", o: "L", n: "society" },
 { f: "son", m: "sound", o: "L" },
 { f: "stell", m: "star", o: "L" },
 { f: "stinct", alt: ["sting"], m: "prick, mark out", o: "L" },
 { f: "string", alt: ["strict", "strain"], m: "bind, tighten", o: "L", w: 1 },
 { f: "sum", alt: ["sumpt"], m: "take; highest", o: "L" },
 { f: "tempor", alt: ["temp"], m: "time", o: "L" },
 { f: "tend", alt: ["tens"], m: "stretch, aim", o: "L" },
 { f: "test", m: "witness", o: "L", w: 1 },
 { f: "text", m: "weave", o: "L", w: 1 },
 { f: "tim", m: "fear", o: "L" },
 { f: "tort", alt: ["tors"], m: "twist", o: "L" },
 { f: "tribut", m: "give, pay", o: "L" },
 { f: "trud", alt: ["trus"], m: "push, thrust", o: "L" },
 { f: "turb", m: "stir, confuse", o: "L" },
 { f: "umbr", m: "shadow", o: "L" },
 { f: "und", m: "wave", o: "L" },
 { f: "us", alt: ["ut", "util"], m: "use", o: "L" },
 { f: "val", alt: ["vail"], m: "strong, worth", o: "L", s: 1 },
 { f: "vas", alt: ["vad"], m: "go", o: "L" },
 { f: "vor", m: "eat, devour", o: "L", s: 1 },
 { f: "vulg", m: "common people", o: "L" },
 { f: "volv", alt: ["volu", "volut"], m: "roll", o: "L" },
 { f: "solv", alt: ["solu", "solut"], m: "loosen, free", o: "L" },
 { f: "spond", alt: ["spons"], m: "promise, answer", o: "L" },
 { f: "sert", m: "join, put", o: "L" },
 { f: "cern", alt: ["cret"], m: "separate, decide", o: "L" },
 { f: "riv", m: "stream", o: "L", s: 1 },
 { f: "ordin", alt: ["ord"], m: "order, rank", o: "L" },
 { f: "norm", m: "rule, pattern", o: "L" },
 { f: "anim", m: "life, spirit", o: "L" },
 { f: "verb", m: "word", o: "L", w: 1 },
 { f: "cit", m: "rouse, summon", o: "L" },
 { f: "fus", alt: ["fund", "found"], m: "pour", o: "L", w: 1 },
 { f: "poss", alt: ["pot", "poten"], m: "power, able", o: "L" },
 { f: "sui", m: "self", o: "L", n: "oneself" },
 { f: "hom", alt: ["homin"], m: "human", o: "L", n: "a human" },
 { f: "vinc", alt: ["vict"], m: "conquer", o: "L" },
 { f: "aer", m: "air", o: "G", s: 1 },
 { f: "agr", m: "field", o: "L", n: "the fields" },
 { f: "alg", m: "pain", o: "G" },
 { f: "allo", m: "other", o: "G" },
 { f: "andr", m: "man, male", o: "G" },
 { f: "angl", m: "angle, corner", o: "L" },
 { f: "bibli", m: "book", o: "G", n: "books" },
 { f: "cephal", m: "head", o: "G", n: "the head" },
 { f: "chlor", m: "green", o: "G" },
 { f: "chrom", alt: ["chromat"], m: "colour", o: "G" },
 { f: "cyt", m: "cell", o: "G", n: "cells" },
 { f: "dactyl", m: "finger", o: "G" },
 { f: "dendr", m: "tree", o: "G" },
 { f: "dogm", alt: ["dogmat"], m: "opinion, belief", o: "G" },
 { f: "dox", m: "opinion, belief", o: "G", s: 1 },
 { f: "eco", alt: ["ec", "oec"], m: "house, environment", o: "G", n: "the household" },
 { f: "electr", m: "amber, electricity", o: "G", n: "electricity" },
 { f: "gam", m: "marriage", o: "G" },
 { f: "gastr", m: "stomach", o: "G", n: "the stomach" },
 { f: "glyc", alt: ["gluc"], m: "sweet", o: "G" },
 { f: "gon", m: "angle, corner", o: "G" },
 { f: "gyn", alt: ["gynec"], m: "woman", o: "G", n: "women" },
 { f: "heli", m: "sun", o: "G" },
 { f: "hem", alt: ["hemat", "haem"], m: "blood", o: "G" },
 { f: "hex", m: "six", o: "G" },
 { f: "hier", m: "sacred", o: "G", n: "priests" },
 { f: "hipp", m: "horse", o: "G" },
 { f: "hol", m: "whole", o: "G" },
 { f: "homo", m: "same", o: "G" },
 { f: "hygr", m: "moisture", o: "G" },
 { f: "iatr", m: "heal", o: "G", n: "healing" },
 { f: "icon", m: "image", o: "G" },
 { f: "idi", m: "one's own", o: "G" },
 { f: "kine", alt: ["cine", "kinet"], m: "move", o: "G" },
 { f: "lex", alt: ["lexic"], m: "word", o: "G", s: 1 },
 { f: "lys", alt: ["lyt"], m: "loosen, dissolve", o: "G" },
 { f: "macr", m: "large, long", o: "G" },
 { f: "mega", m: "great", o: "G" },
 { f: "melan", m: "black", o: "G" },
 { f: "mes", m: "middle", o: "G" },
 { f: "micr", m: "small", o: "G" },
 { f: "mis", m: "hate", o: "G" },
 { f: "narc", m: "numbness, sleep", o: "G" },
 { f: "necr", m: "dead", o: "G", n: "the dead" },
 { f: "neo", m: "new", o: "G" },
 { f: "nephr", m: "kidney", o: "G", n: "the kidneys" },
 { f: "odont", m: "tooth", o: "G", n: "teeth" },
 { f: "ophthalm", m: "eye", o: "G", n: "the eyes" },
 { f: "ornith", m: "bird", o: "G", n: "birds" },
 { f: "oste", m: "bone", o: "G", n: "bones" },
 { f: "ox", alt: ["oxy"], m: "sharp, acid, oxygen", o: "G" },
 { f: "pan", alt: ["pant"], m: "all", o: "G" },
 { f: "pedo", alt: ["paed", "paedo"], m: "child", o: "G", n: "children" },
 { f: "petr", m: "rock", o: "G" },
 { f: "phag", m: "eat", o: "G" },
 { f: "phan", alt: ["phen"], m: "show, appear", o: "G" },
 { f: "phor", alt: ["pher"], m: "carry, bear", o: "G" },
 { f: "phyll", m: "leaf", o: "G" },
 { f: "phyt", m: "plant", o: "G" },
 { f: "plas", alt: ["plast"], m: "form, mould", o: "G" },
 { f: "pneum", alt: ["pneumon"], m: "breath, lung", o: "G" },
 { f: "prot", m: "first", o: "G" },
 { f: "rhin", m: "nose", o: "G", n: "the nose" },
 { f: "schiz", m: "split", o: "G" },
 { f: "seism", m: "shake, earthquake", o: "G", n: "earthquakes" },
 { f: "sept", m: "seven; rot", o: "L" },
 { f: "som", alt: ["somat"], m: "body", o: "G" },
 { f: "sperm", alt: ["spor"], m: "seed", o: "G" },
 { f: "spher", m: "ball, globe", o: "G" },
 { f: "stere", m: "solid", o: "G" },
 { f: "tax", m: "arrange, order", o: "G" },
 { f: "tele", m: "far", o: "G", n: "distant things" },
 { f: "tetr", m: "four", o: "G" },
 { f: "thanat", m: "death", o: "G" },
 { f: "therap", m: "treat, cure", o: "G" },
 { f: "thes", alt: ["thet"], m: "put, place", o: "G" },
 { f: "tom", m: "cut", o: "G" },
 { f: "top", m: "place", o: "G" },
 { f: "trop", m: "turn", o: "G" },
 { f: "xen", m: "foreign, strange", o: "G", n: "strangers" },
 { f: "xyl", m: "wood", o: "G" },
 { f: "zyg", m: "yoke, pair", o: "G" },
 { f: "act", alt: ["ag"], m: "do, drive", o: "L", s: 1 },
 { f: "cad", alt: ["cas"], m: "fall", o: "L" },
 { f: "capit", m: "head", o: "L" },
 { f: "centr", m: "centre", o: "G" },
 { f: "cert", m: "sure", o: "L" },
 { f: "commun", m: "common, shared", o: "L" },
 { f: "crea", alt: ["creat"], m: "make, produce", o: "L" },
 { f: "cura", m: "care", o: "L" },
 { f: "divid", alt: ["divis"], m: "divide", o: "L" },
 { f: "don", alt: ["donat"], m: "give", o: "L", s: 1 },
 { f: "fend", alt: ["fens"], m: "strike, ward off", o: "L" },
 { f: "fess", m: "speak, admit", o: "L" },
 { f: "firm", m: "steady, strong", o: "L", w: 1 },
 { f: "flor", m: "flower", o: "L" },
 { f: "grav", m: "heavy, serious", o: "L" },
 { f: "libr", m: "book; balance", o: "L" },
 { f: "medic", m: "heal", o: "L" },
 { f: "merg", alt: ["mers"], m: "dip, plunge", o: "L" },
 { f: "nomin", m: "name", o: "L" },
 { f: "nutri", alt: ["nutr"], m: "nourish", o: "L" },
 { f: "par", alt: ["pair"], m: "equal", o: "L", w: 1 },
 { f: "pen", alt: ["poen"], m: "punish, penalty", o: "L", w: 1 },
 { f: "petit", alt: ["pet"], m: "seek, strive", o: "L" },
 { f: "plaud", alt: ["plaus", "plod", "plos"], m: "clap, approve", o: "L" },
 { f: "press", m: "press", o: "L", w: 1 },
 { f: "priv", m: "own, separate", o: "L" },
 { f: "quadr", m: "four", o: "L" },
 { f: "rat", alt: ["ratio"], m: "reason, reckon", o: "L", s: 1 },
 { f: "rot", m: "wheel, turn", o: "L", s: 1 },
 { f: "sacr", m: "holy", o: "L" },
 { f: "scend", alt: ["scens", "scal"], m: "climb", o: "L" },
 { f: "serv", m: "serve, keep", o: "L" },
 { f: "somn", m: "sleep", o: "L" },
 { f: "surg", alt: ["surrect"], m: "rise", o: "L" },
 { f: "termin", m: "end, boundary", o: "L" },
 { f: "ton", m: "tone, stretch", o: "G" },
 { f: "tors", m: "twist", o: "L" },
 { f: "vali", alt: ["valid"], m: "strong", o: "L" },
 { f: "ventr", m: "belly", o: "L" },
 { f: "vest", m: "clothe", o: "L", w: 1 },
 { f: "zon", m: "belt, zone", o: "G" }
  ];

  /* ---------- indexes ---------- */
  var ORIGIN = { L: "Latin", G: "Greek", E: "Old English", F: "French", D: "Dutch" };
  var POS = { a: "adjective", n: "noun", v: "verb", r: "adverb" };
  [PREFIXES, SUFFIXES, ROOTS].forEach(function(t){ t.forEach(function(e){ e.o = ORIGIN[e.o] || e.o; if (e.pos) e.pos = POS[e.pos] || e.pos; }); });
  function forms(e){ return [e.f].concat(e.alt || []); }
  function index(table){
    var m = {};
    table.forEach(function(e){ forms(e).forEach(function(f){ (m[f] = m[f] || []).push(e); }); });
    return m;
  }
  function byLength(m){ return Object.keys(m).sort(function(a, b){ return b.length - a.length || (a < b ? -1 : 1); }); }
  var PRE = index(PREFIXES), SUF = index(SUFFIXES), RT = index(ROOTS);
  var PRE_FORMS = byLength(PRE), SUF_FORMS = byLength(SUF);
  function set(s){ var o = {}; s.split(" ").forEach(function(w){ if (w) o[w] = 1; }); return o; }
  /* a root is only trusted on its own when it is long enough not to turn up by accident */
  function strong(root, form){ return !root.w && form.length >= 3 && (form.length >= 4 || !!root.s); }
  function first(m){ return String(m || "").split(/[,;]/)[0].trim(); }

  /* Everyday words the spelling rules would cut up wrongly: letter is not let + er, a
     recent thing is not re + cent, unless is not un + less. Found by running the rules over
     the 10 000 most common words against the dictionary and keeping the false splits; a
     listed word also covers its -s, -ed, -ing, -ly, -er and -est forms (see noSplit). */
  var NOSPLIT = set("abandon absence absent accent accurate acid acids admin affair affairs afford afghan afghanistan agencies " +
    "agency airport airports alex allen alliance allow allowed allows almost already although altogether always " +
    "amount amounts annotate annotation anticipate appear appearance appeared appears archive archives aspect " +
    "assess assist australia australian automate avail available average banner barrier barriers beach beauty " +
    "beaver because before belief beliefs betray better beverage beverages binary bitter british brochure " +
    "brochures brother butter capabilities capability capable career careers center centers central centre " +
    "champion champions championship charities charity chinese christian closer cluster clusters coach coalition " +
    "coding colonial colony columbus combination combinations combine combined comfort comfortable comfortably " +
    "coming compare compared comparison comply compromise condition conditional conditioning conditions consider " +
    "considerable consideration considered considering console content contents controller cooper copper copy " +
    "cordless corner cottage cottages counties cover curiosity curious damage debate debian decade decades decent " +
    "decor decorate decoration decorations decorative decrease delete delight deliver delivered deliveries " +
    "delivering delivers delivery desire detail detailed details develop developed developer developers " +
    "developing development developmental developments device diego dimension dinner directories discuss disgust " +
    "dish display displayed disproportionate distance distress district districts divide divine email emails " +
    "embassy emerge emergency empire empirical ending engage england enquiry ensure ensuring enter entire " +
    "entirely entities entity entrance estate estates examine example examples excel excellence excellent " +
    "experience experienced experiences experiment experimental experiments expert expertise explanation " +
    "explanations extent external externally extreme extremely famine fascinate fascinating favorite favorites " +
    "favourite finish finland finnish floor florence flower former french galleries gallery garage gary genuine " +
    "genuinely german germany gorgeous grammar gregory hammer handling heaven hockey holdem honor honors honour " +
    "imaging impair improve improved improvement improvements incentive incentives increase increased increases " +
    "increasing increasingly index indicate indices injure injury input inputs inquiry instance instant instantly " +
    "intent intention intentions interest interested interesting interests intern internal internally interns " +
    "internship inventory invitation invite invited invoice invoices ireland isolate isolation japanese johnny " +
    "lately letter logistics lotion luxurious luxury magic magical magically magnetic manage manner mansion " +
    "martin massage master material materials matter measure message messages minister ministers ministry mirror " +
    "miscellaneous miss missing mistress moderate moderation moderator moderators modern modify moment momentum " +
    "monkey monkeys monster monsters mother nancy norman notice number office officer officers official " +
    "officially officials orleans output outputs parachute parade paradise parent parental parish passion " +
    "passionate passive patient patients patrick penalties penalty pepper petite pioneer polish portion portions " +
    "possess possession possessions possessive premise premises prepare presence present presentation presented " +
    "presently presents prevent prevention profile profiles programme programmes promise proportion proportional " +
    "proportionate prostate protocol protocols queen queens rather reach recent recently refinance refine " +
    "refinery rehearsal rehearse release released releases relevance relevant relief remain remainder remained " +
    "remaining remains remedies remedy remember remembered render repair repaired repairs repeat repeated " +
    "repeatedly restore restored restrict retail retention retire retired retirement reveal revealed rider riders " +
    "river rivers roger rogers search secure secured securities security senate senator senegal separate shower " +
    "sister spain spanish special specialist specialize specially specialty specify stability student students " +
    "sublime suck summer supplier supply surgeon surgery surgical sweden swedish syndrome template tender " +
    "terrible terribly terrific terrify terror terrorism terrorist tiger tigers titan titans topic topics tower " +
    "towers transparency transparent turkey union unions unless vaccine vaccines various vermont veteran veterans");

  /* ---------- spelling repairs ----------
     The forms a stem may have taken before a suffix was added: creat(e)-ion, runn→run-er,
     happi→happy-ness, familie→family-s. */
  function repairs(stem, suffix){
    var out = [stem];
    function add(x){ if (x.length > 1 && out.indexOf(x) < 0) out.push(x); }
    if (/([bdfgklmnprstvz])\1$/.test(stem)){ add(stem.slice(0, -1)); if (suffix === "en") add(stem.slice(0, -1) + "e"); }
    if (/[^aeiou]$/.test(stem) || /u$/.test(stem)) add(stem + "e");
    if (/i$/.test(stem)) add(stem.slice(0, -1) + "y");
    return out;
  }

  /* ---------- enumeration ----------
     Every way of reading the word as prefixes + stem + suffixes; the callback gets the
     prefix parts, the stem's letters and the suffix parts (innermost first). */
  function walk(w, cb, isWord){
    var pres = [[]];
    PRE_FORMS.forEach(function(f1){
      if (w.length - f1.length < 3 || w.indexOf(f1) !== 0) return;
      PRE[f1].forEach(function(e1){
        pres.push([{ text: f1, e: e1 }]);
        var rest = w.slice(f1.length);
        PRE_FORMS.forEach(function(f2){
          if (f1.length < 2 || rest.length - f2.length < 3 || rest.indexOf(f2) !== 0) return;
          PRE[f2].forEach(function(e2){ if (!e2.cf && f2.length > 1) pres.push([{ text: f1, e: e1 }, { text: f2, e: e2 }]); });
        });
      });
    });
    pres.forEach(function(pre){
      var rest = w.slice(pre.reduce(function(n, p){ return n + p.text.length; }, 0));
      sufWalk(rest, [], 0, function(stem, sufs){ cb(pre, stem, sufs); }, pre.length === 1, isWord);
    });
  }
  function sufWalk(rest, sufs, depth, cb, allowEmpty, isWord){
    cb(rest, sufs);
    if (depth >= 3) return;
    var tries = [{ s: rest, cut: 0 }];
    if (depth && (/[^aeiou]$/.test(rest) || /u$/.test(rest)) && (!isWord || isWord(rest + "e"))) tries.push({ s: rest + "e", cut: 1 });   /* creativ-ity ← creative */
    if (/[bdgkptz]ly$/.test(rest) && rest.length > 5) SUF["ly"].forEach(function(e){
      sufWalk(rest.slice(0, -1), [{ text: "y", e: e }].concat(sufs), depth + 1, cb, allowEmpty, isWord);
    });
    tries.forEach(function(t){
      SUF_FORMS.forEach(function(f){
        var n = t.s.length - f.length;
        if (n < 0 || t.s.slice(n) !== f) return;
        var text = f.slice(0, f.length - t.cut);
        if (!text) return;
        if (f === "d" && !/e$/.test(t.s.slice(0, n))) return;
        if (f === "es" && !/(s|x|z|ch|sh|o|i)$/.test(t.s.slice(0, n))) return;
        SUF[f].forEach(function(e){
          if (n >= 3) sufWalk(rest.slice(0, n), [{ text: text, e: e }].concat(sufs), depth + 1, cb, allowEmpty, isWord);
          else if (n === 0 && allowEmpty && e.greek && e.o === "Greek" && !t.cut) cb("", [{ text: text, e: e }].concat(sufs));
        });
      });
    });
  }

  /* ---------- plain meanings for common bases ----------
     The dictionary's senses come in no useful order (its first sense for "expect" is "be
     pregnant with"), so the everyday words that most often sit inside a longer one carry a
     short meaning of their own here. A word's part of speech still comes from the dictionary. */
  var BASES = {
    /* added for the glosses: each of these has a dictionary sense that reads oddly out of
       context ("predict: indicate by signs", "summit: a meeting of heads of governments") */
    predict: "say what will happen", summit: "the highest point", inherit: "receive from someone who has died",
    curious: "wanting to know; strange", hesitate: "pause before doing something", glitter: "shine with flashes of light",
    linger: "stay longer than expected", anticipate: "expect; look forward to", notion: "an idea",
    vivid: "bright and clear", profound: "very deep or strong", obscure: "hard to understand; little known",
    peculiar: "strange; belonging to only one", threshold: "the doorway; where something begins",
    deliberate: "done on purpose; slow and careful", reluctant: "unwilling", solitude: "being alone",
    weary: "very tired", mourn: "feel sad that someone has died", ponder: "think carefully about",
    scarce: "hard to find; not enough", murmur: "a low soft sound", restless: "unable to keep still",
    able: "having the skill or power", accept: "take what is offered", act: "do something", add: "put together with",
    admit: "let in; agree it is true", adopt: "take as your own", advise: "say what someone should do", agree: "have the same opinion",
    allow: "let happen", amaze: "surprise greatly", amuse: "make someone smile", announce: "tell everyone",
    annoy: "make a little angry", appear: "come into view; seem", apply: "put to use; ask for", appoint: "choose for a job",
    approve: "think well of", argue: "give reasons; quarrel", arm: "the limb; a weapon", arrange: "put in order",
    arrive: "reach a place", ask: "put a question", assist: "help", assume: "take as true", attach: "fasten to",
    attack: "act against with force", attend: "be present at", attract: "draw towards", avoid: "keep away from",
    aware: "knowing about", back: "the rear; support", bake: "cook in an oven", balance: "steady weight on both sides",
    bank: "the place for money; a river's edge", base: "the bottom part", bear: "carry; put up with", beat: "hit again and again",
    beauty: "what pleases the eye", behave: "act in a certain way", believe: "hold to be true", belong: "be someone's; fit in",
    bend: "curve; make crooked", bind: "tie together", bite: "cut with the teeth", bless: "wish well; make holy",
    blind: "unable to see", block: "stop the way", blow: "move air; a hit", board: "a flat piece of wood; get on",
    boil: "heat until bubbling", bold: "brave, daring", bolt: "a fastener; run suddenly", bore: "make a hole; tire out",
    bother: "trouble, annoy", bound: "tied; leaping; a limit", brave: "not afraid", break: "come apart; smash",
    breath: "air taken in", bright: "giving much light; clever", broad: "wide", build: "make by putting parts together",
    burn: "be on fire", busy: "having much to do", calm: "quiet, not worried", care: "look after; worry about",
    carry: "take from one place to another", catch: "take hold of", cause: "make happen", centre: "the middle", center: "the middle",
    certain: "sure", change: "make different", charge: "ask a price; rush at; fill with power", cheer: "shout with joy",
    child: "a young person", choose: "pick out", claim: "say that it is so", clean: "free of dirt",
    clear: "easy to see through; plain", clever: "quick to learn", climb: "go up", close: "shut; near",
    cloud: "water floating in the sky", coat: "an outer garment; a layer", cold: "of low temperature", collect: "gather together",
    colour: "what the eye sees as red, blue and so on", color: "what the eye sees as red, blue and so on", comfort: "ease, freedom from pain",
    command: "give an order", common: "shared; ordinary", compare: "look at side by side", complete: "whole; finish",
    conduct: "lead; behaviour", confuse: "mix up", connect: "join together", consider: "think about carefully",
    content: "what is inside; satisfied", continue: "go on", control: "have power over", cook: "prepare food with heat",
    cool: "a little cold", correct: "right; put right", count: "say the numbers; matter", courage: "bravery",
    cover: "put something over", crack: "a thin break", create: "bring into being", cross: "go from one side to the other",
    crowd: "many people together", cure: "make well", cut: "open or divide with a blade", damage: "harm",
    danger: "the chance of harm", dark: "without light", date: "the day of the month", deal: "do business; hand out",
    dear: "loved; costly", decide: "make up your mind", deep: "going far down", defend: "keep safe from attack",
    define: "say exactly what something means", delight: "great pleasure", deliver: "bring to someone", demand: "ask firmly for",
    depend: "rely on", describe: "say what something is like", deserve: "be worthy of", design: "plan how it will look",
    desire: "wish for", destroy: "put an end to; wreck", develop: "grow; work out", differ: "be unlike",
    direct: "straight; point the way", dirt: "earth; something unclean", discover: "find out", distance: "how far apart",
    disturb: "break the peace of", divide: "split into parts", do: "carry out", doubt: "not be sure",
    drag: "pull along", draw: "make a picture; pull", dream: "pictures in sleep; a hope", dress: "clothing; put clothes on",
    drink: "swallow liquid", drive: "steer a vehicle; push forward", drop: "let fall", dry: "without water",
    earn: "get by working", ease: "freedom from difficulty", east: "where the sun rises", eat: "take in food",
    edge: "the outer line", educate: "teach", effect: "what a cause brings about", elect: "choose by vote",
    employ: "give work to", empty: "with nothing inside", end: "the last part", enjoy: "take pleasure in",
    enter: "go in", equal: "the same in amount", escape: "get free", even: "level; still",
    event: "something that happens", exact: "quite correct", examine: "look at closely", excite: "stir up feeling",
    excuse: "forgive; a reason given", exist: "be real", expect: "think something will happen", expense: "cost",
    experience: "what you have lived through", explain: "make clear", explore: "travel to find out", express: "put into words",
    face: "the front of the head; meet", fail: "not succeed", fair: "just; light in colour", faith: "trust, belief",
    fall: "come down", false: "not true", fame: "being widely known", familiar: "well known",
    fashion: "the current style", fast: "quick; firmly fixed", fat: "having much flesh", father: "a male parent",
    fault: "a mistake; a flaw", favour: "kindness; prefer", favor: "kindness; prefer", fear: "the feeling of danger",
    feed: "give food to", feel: "sense by touch; have a feeling", fever: "a high temperature", fill: "make full",
    find: "come upon", finish: "bring to an end", fire: "burning", firm: "solid, steady",
    fit: "of the right size; healthy", fix: "fasten; mend", flat: "level", flow: "move like water",
    fly: "move through the air", fold: "bend over on itself", follow: "go after", fond: "loving",
    fool: "a silly person", force: "strength; make someone do", forget: "fail to remember", forgive: "stop blaming",
    form: "shape; make", fortune: "luck; wealth", found: "set up; start", frame: "a border that holds",
    free: "not held; without cost", fresh: "new; not stale", friend: "a person you like and trust", fright: "sudden fear",
    front: "the forward part", fruit: "what a plant grows to hold its seeds", full: "holding all it can", fun: "enjoyment",
    gain: "get more of", gather: "bring together", gentle: "soft, kind", gift: "something given",
    give: "hand over", glad: "pleased", glory: "great honour", go: "move; leave",
    govern: "rule", grace: "beauty of movement; favour", grand: "great, splendid", grate: "shred; scrape harshly",
    great: "large; important", greet: "welcome", grief: "deep sorrow", grow: "get bigger",
    guard: "keep safe", guess: "answer without knowing", guide: "show the way", guilt: "having done wrong",
    habit: "what you usually do", hand: "the end of the arm", handle: "a part to hold; deal with", hang: "fasten from above",
    happy: "feeling pleased", hard: "firm; difficult", harm: "hurt, damage", haste: "hurry",
    hate: "dislike strongly", head: "the top part; lead", heal: "make well again", health: "how well the body is",
    hear: "take in sound", heart: "the organ that pumps blood; the centre", heat: "warmth", heavy: "weighing a lot",
    help: "make easier for someone", hide: "put out of sight", high: "far up", hold: "keep in the hand",
    home: "where you live", honest: "truthful", honour: "high respect", honor: "high respect",
    hope: "wish and expect", hot: "very warm", house: "a building to live in", human: "a person",
    humble: "modest, not proud", hunt: "chase to catch", hurry: "move quickly", hurt: "cause pain",
    ice: "frozen water", idle: "doing nothing", imagine: "picture in the mind", import: "bring in from abroad",
    improve: "make better", inform: "tell", instruct: "teach; order", intend: "mean to do",
    interest: "wanting to know more", invent: "make for the first time", invite: "ask to come", iron: "a hard grey metal; press flat",
    join: "put together", joy: "great happiness", judge: "decide about; a person who decides", just: "fair; only",
    keep: "hold on to", kind: "friendly; a sort", know: "have in the mind", labour: "work", labor: "work",
    land: "ground; come down", large: "big", last: "after all others; go on", late: "after the right time",
    laugh: "make the sound of amusement", law: "a rule made by government", lay: "put down", lead: "go in front; show the way",
    learn: "get knowledge", leave: "go away from", legal: "allowed by law", lend: "let someone use for a while",
    length: "how long", level: "flat; a height", life: "being alive", lift: "raise",
    light: "what lets us see; not heavy", like: "enjoy; similar to", limit: "the furthest point", line: "a long thin mark",
    list: "a set of items written down", listen: "pay attention to sound", live: "be alive; dwell", load: "what is carried",
    lock: "a fastening that needs a key", lone: "alone", long: "of great length", look: "use the eyes",
    loose: "not tight", lose: "no longer have", loud: "making much sound", love: "deep affection",
    low: "not high", luck: "chance, good or bad", manage: "be in charge of; cope", mark: "a sign or spot",
    marry: "become husband or wife", master: "one in charge; become skilled at", match: "be alike; a contest", mature: "fully grown",
    mean: "signify; unkind", measure: "find the size of", meet: "come together", melt: "turn to liquid with heat",
    mend: "repair", mercy: "kindness to one in your power", mind: "the thinking part; object to", miss: "fail to hit or catch",
    mistake: "an error", mix: "put together", moist: "slightly wet", mother: "a female parent",
    motion: "movement", mount: "climb; fix in place", move: "change place", name: "what something is called",
    nation: "a country and its people", nature: "the living world; character", near: "close by", neat: "tidy",
    need: "must have", neglect: "fail to care for", nerve: "a body fibre that carries feeling; courage", new: "not existing before",
    noise: "unwanted sound", north: "the direction of the pole star", note: "a short written record", notice: "see; a written sign",
    number: "a count", obey: "do as told", object: "a thing; say you are against", observe: "watch carefully",
    obtain: "get", occupy: "live in; fill", offend: "hurt the feelings of", offer: "hold out to be taken",
    open: "not shut", operate: "work; do surgery", order: "arrangement; a command", organ: "a body part with a job",
    origin: "where something began", pack: "put into a container", pain: "hurt", paint: "colour put on with a brush",
    pair: "two together", pardon: "forgive", part: "a piece", pass: "go by",
    patient: "putting up with delay", pay: "give money for", peace: "freedom from war or noise", people: "persons",
    perfect: "without fault", perform: "do; act on stage", person: "a human being", place: "a position; put",
    plain: "simple, clear", plan: "a way worked out beforehand", plant: "a growing thing; put in the ground", play: "have fun; act",
    please: "give pleasure", plenty: "as much as is needed", point: "a sharp end; show with a finger", poison: "a substance that harms",
    polite: "having good manners", poor: "having little money", popular: "liked by many", possess: "own",
    possible: "able to happen", post: "mail; a pole", pour: "make liquid flow", power: "strength; the ability to act",
    practice: "doing something to get better", praise: "say good things about", pray: "speak to a god", prefer: "like better",
    prepare: "make ready", present: "here now; a gift; show", press: "push against", pretend: "act as if",
    prevent: "stop from happening", price: "what something costs", pride: "high opinion of yourself", print: "put marks on paper",
    prison: "a building for lawbreakers", private: "for one person only", prize: "a reward", produce: "make; bring forth",
    profit: "money gained", promise: "say you will", proper: "right, suitable", protect: "keep safe",
    proud: "feeling pleased with yourself", prove: "show to be true", provide: "supply", public: "for everyone",
    pull: "draw towards you", punish: "make suffer for a wrong", pure: "clean, not mixed", purpose: "the reason for doing",
    push: "press away from you", quick: "fast", quiet: "with little sound", rain: "water falling from clouds",
    raise: "lift up", rank: "a position in order", rapid: "fast", rare: "not often found",
    rate: "how fast; a charge", reach: "stretch out to; arrive at", read: "take in written words", ready: "prepared",
    real: "actually existing", reason: "why; thinking", receive: "get what is given", recognise: "know again",
    recognize: "know again", record: "write down; a stored account", reduce: "make smaller", refer: "point to; mention",
    reflect: "throw back light; think", refuse: "say no", regard: "look at; consider", region: "an area",
    regular: "happening at even intervals", relate: "tell; connect", relax: "become less tense", relief: "ease after pain",
    rely: "depend", remain: "stay", remark: "say; notice", remember: "keep in the mind",
    remove: "take away", repair: "mend", repeat: "say or do again", replace: "put back; put another in place of",
    reply: "answer", report: "give an account of", represent: "stand for", require: "need",
    rescue: "save from danger", resist: "stand against", respect: "high regard", respond: "answer",
    rest: "stop working; what is left", result: "what comes of something", return: "go or give back", reveal: "show",
    reverse: "turn the other way", review: "look over again", reward: "what is given for doing well", rich: "having much money",
    ride: "sit on and travel", right: "correct; the opposite of left", rise: "go up", risk: "the chance of harm",
    roll: "turn over and over", room: "a space in a building", root: "the part in the ground", rough: "not smooth",
    round: "shaped like a ball", rude: "not polite", rule: "a law; govern", run: "move fast on foot",
    sad: "unhappy", safe: "free from danger", sail: "travel by boat", satisfy: "give what is wanted",
    save: "keep from harm; keep for later", scare: "frighten", school: "a place for learning", score: "points gained",
    search: "look for", season: "a part of the year", seat: "a place to sit", secure: "safe; fasten",
    see: "use the eyes", seek: "look for", seem: "appear to be", select: "choose",
    self: "one's own person", sell: "give for money", send: "make go", sense: "a feeling; good judgement",
    separate: "apart; divide", serve: "work for; give food to", set: "put; a group", settle: "come to rest; decide",
    shade: "shelter from light", shake: "move quickly to and fro", shame: "the feeling of having done wrong", shape: "outer form",
    share: "have or use with others", sharp: "with a fine edge", shine: "give out light", ship: "a large boat; send",
    shock: "a sudden upset", shoot: "fire a weapon", shop: "a place that sells; buy", short: "not long",
    show: "let be seen", shut: "close", sick: "ill", side: "the left or right part",
    sight: "seeing; what is seen", sign: "a mark that means something; write your name", silent: "making no sound", simple: "easy; plain",
    sing: "make music with the voice", sink: "go down in water", sit: "rest on the seat", skill: "the ability to do well",
    sleep: "rest with eyes closed", slip: "slide by accident", slow: "not fast", small: "little",
    smart: "clever; neat", smell: "sense with the nose", smile: "turn the mouth up in pleasure", smooth: "even, not rough",
    snow: "frozen rain", soft: "not hard", solid: "firm, not liquid", solve: "find the answer to",
    sort: "a kind; arrange", sound: "what is heard; healthy", south: "the direction opposite north", space: "room; the area beyond earth",
    speak: "say words", special: "not ordinary", speed: "how fast", spell: "write the letters of; magic words",
    spend: "pay out; use time", spirit: "the soul; liveliness", spoil: "damage; go bad", spot: "a small mark; a place",
    spread: "open out wide", stable: "steady", stand: "be on the feet", start: "begin",
    state: "how something is; a nation; say", stay: "remain", steady: "firm, not shaking", step: "one movement of a foot",
    stick: "a thin piece of wood; fasten", stiff: "not easily bent", still: "not moving; yet", stir: "mix by moving round",
    stop: "come to an end", store: "keep for later; a shop", storm: "wind and rain", straight: "without a bend",
    strange: "unusual", stress: "pressure; strain", stretch: "make longer", strike: "hit",
    strong: "having power", study: "learn about", stupid: "slow to learn", subject: "what it is about",
    succeed: "do well; come after", suffer: "feel pain", suggest: "put forward an idea", suit: "fit well; a set of clothes",
    sum: "the total", supply: "provide", support: "hold up; help", suppose: "think likely",
    sure: "certain", surprise: "the unexpected", survive: "stay alive", sweet: "tasting of sugar",
    swim: "move through water", take: "get hold of", talk: "speak", taste: "sense with the tongue",
    teach: "help to learn", tell: "say to", tempt: "attract to do wrong", tend: "look after; be likely to",
    tender: "soft, gentle", terror: "great fear", test: "a trial", thank: "say you are grateful",
    thick: "wide from side to side", thin: "not thick", think: "use the mind", thought: "thinking",
    threat: "a sign of harm to come", throw: "send through the air", tidy: "neat", tie: "fasten with string",
    tight: "held firmly", tire: "make weary", top: "the highest part", touch: "feel with the hand",
    tough: "hard to break", town: "a place with many houses", trace: "a mark left behind; follow", trade: "buying and selling",
    train: "teach by practice; carriages on rails", travel: "go from place to place", treat: "deal with; give something nice", tree: "a tall plant with a trunk",
    trick: "a clever act to deceive", trouble: "difficulty", true: "as it really is", trust: "believe in",
    truth: "what is true", try: "make an effort", turn: "move round", type: "a kind; write with keys",
    understand: "know the meaning of", unite: "join into one", use: "put to work", usual: "as normally happens",
    value: "worth", vary: "be different", view: "what can be seen; an opinion", visit: "go to see",
    voice: "the sound of speaking", wait: "stay until", wake: "stop sleeping", walk: "go on foot",
    wander: "go about without aim", want: "wish for", warm: "a little hot", warn: "tell of danger",
    wash: "clean with water", waste: "use badly", watch: "look at; a small clock", water: "the liquid of rain and rivers",
    wave: "a moving ridge of water; move the hand", weak: "not strong", wealth: "riches", wear: "have on the body",
    weigh: "find how heavy", welcome: "greet gladly", west: "where the sun sets", wet: "covered with water",
    whole: "all of it", wide: "far from side to side", wild: "not tamed", will: "wish; what is going to happen",
    win: "come first", wind: "moving air", wise: "having good judgement", wish: "want",
    wonder: "want to know; amazement", wood: "the hard part of trees", word: "a unit of language", work: "effort to do or make",
    worry: "feel anxious", worth: "value", wound: "an injury", wrap: "cover by folding round",
    write: "put words on paper", wrong: "not right", yield: "give way; produce", young: "not old"
  };
  /* ---------- reading the stem ---------- */
  function normLookup(lookup, w){
    var r = lookup ? lookup(w) : null;
    if (!r) return null;
    if (BASES[w]) r = typeof r === "string" ? BASES[w] : { d: BASES[w], pos: r.pos, obscure: false, open: r.open };
    if (typeof r === "string") return { d: r, pos: "", obscure: false };
    var pos = r.pos || "";
    if (Object.prototype.toString.call(pos) === "[object Array]") pos = pos.join(" ");
    pos = String(pos).replace(/adverb/g, "r").replace(/adjective/g, "a").replace(/noun/g, "n").replace(/verb/g, "v").replace(/[^nvar]/g, "");
    return { d: r.d || "", pos: pos, obscure: !!r.obscure, open: !!r.open };
  }
  function rootPart(text, form, e){
    return { text: text, kind: "root", meaning: e.m, origin: e.o, e: e, strong: strong(e, form) };
  }
  /* the ways a stem can be read: a dictionary word, a root (with or without a silent e),
     or two roots with or without a linking vowel */
  function stemReadings(stem, hasAffix, lookup, cache, sufs, pre){
    var out = [];
    if (!stem) return out;
    var seen = {};
    (hasAffix ? repairs(stem, sufs.length ? sufs[0].e.f : "") : [stem]).forEach(function(word){
      if (seen[word]) return; seen[word] = 1;
      var b = cache[word] !== undefined ? cache[word] : (cache[word] = normLookup(lookup, word));
      if (b) out.push({ kind: "base", parts: [{ text: stem, kind: "base", meaning: b.d, origin: "", word: word, pos: b.pos }], obscure: b.obscure, open: b.open, pos: b.pos, repaired: word !== stem, word: word });
    });
    function roots(text, form){
      return (RT[form] || []).map(function(e){ return rootPart(text, form, e); });
    }
    function push(parts, link){ out.push({ kind: "root", parts: parts, link: link }); }
    var own = roots(stem, stem), basePos = "";
    if (own.some(function(p){ return p.strong; })){
      out.forEach(function(r){ if (r.kind === "base" && r.word === stem) basePos = r.pos; });
      out = out.filter(function(r){ return r.kind !== "base" || r.word !== stem; });
    }
    own.forEach(function(p){ push([p]); out[out.length - 1].basePos = basePos; });
    var verbWord = out.some(function(r){ return r.kind === "base" && r.word === stem && (r.pos.indexOf("v") >= 0 || r.open); });
    if (/e$/.test(stem) && !verbWord) roots(stem, stem.slice(0, -1)).forEach(function(p){ push([p]); });
    if (/[oi]$/.test(stem) && stem.length > 3 && sufs.length && sufs[0].e.greek) roots(stem.slice(0, -1), stem.slice(0, -1)).forEach(function(p){
      push([p, { text: stem.slice(-1), kind: "link", meaning: "joins the parts", origin: "" }], stem.slice(-1));
    });
    /* two roots: photo+graph, tele+phon(e), chron+o+log */
    for (var i = 3; i <= stem.length - 3; i++){
      var a = stem.slice(0, i), rest = stem.slice(i), link = "";
      var ra = roots(a, a);
      if (!ra.length) continue;
      if (/^[oiu]/.test(rest) && rest.length > 3 && !RT[rest] && !RT[rest.replace(/e$/, "")]){ link = rest.charAt(0); rest = rest.slice(1); }
      if (rest.replace(/e$/, "").length < 3) continue;
      var rb = roots(rest, rest);
      if (!rb.length && /e$/.test(rest)) rb = roots(rest, rest.slice(0, -1));
      if (!rb.length) continue;
      ra.forEach(function(pa){ rb.forEach(function(pb){
        if (!pa.strong || !pb.strong) return;
        var parts = [pa];
        if (link) parts.push({ text: link, kind: "link", meaning: "joins the parts", origin: "" });
        parts.push(pb);
        push(parts, link);
      }); });
    }
    return out;
  }

  /* ---------- scoring ---------- */
  function partPos(e){ return e.pos === "adjective" || (e.end && /^(ed|ing|en)$/.test(e.f)) ? "a" : e.pos === "noun" ? "n" : e.pos === "verb" ? "v" : e.pos === "adverb" ? "r" : ""; }
  function fits(need, pos){
    if (!need || !pos) return true;
    for (var i = 0; i < need.length; i++) if (pos.indexOf(need.charAt(i)) >= 0) return true;
    return false;
  }
  function evaluate(pre, stem, reading, sufs, whole){
    var n = pre.length + sufs.length + (reading ? reading.parts.filter(function(p){ return p.kind !== "link"; }).length : 0);
    if (n < 2) return null;
    if (!reading){                                   /* bio-logy, micro-scope: a combining form closes the word */
      if (pre.length !== 1 || !sufs.length || !sufs[0].e.greek) return null;
      if (!pre[0].e.cf && pre[0].e.o !== "Greek") return null;
    } else if (reading.kind === "base"){
      if (pre.length > 1) return null;
      if (pre.length && !pre[0].e.free && !pre[0].e.cf) return null;
      if (reading.obscure && sufs.length && sufs[0].e.end) return null;
      if (sufs.length && !reading.open && !fits(sufs[0].e.need, reading.pos)) return null;
      if (sufs.length && sufs[sufs.length - 1].e.whole && whole && !whole.open && whole.pos && whole.pos.indexOf(sufs[sufs.length - 1].e.whole) < 0) return null;
    } else if (reading.kind === "root"){
      if (sufs.length && sufs[0].e.end && sufs[0].e.need === "a") return null;      /* mod-est is not "most mod" */
    }
    for (var k = 1; k < sufs.length; k++){          /* a later suffix attaches to what the earlier one made */
      var made = partPos(sufs[k - 1].e);
      if (made && !fits(sufs[k].e.need, made)) return null;
    }
    if (!pre.length && sufs.length && sufs.every(function(s){ return s.e.end; })) return null;   /* only an inflection */
    for (var j = 0; j < sufs.length - 1; j++){                                                     /* endings close the word */
      if (!sufs[j].e.end) continue;
      if (!/^(ed|ing|en)$/.test(sufs[j].e.f)) return null;
      for (var q = j + 1; q < sufs.length; q++) if (!/^(ly|ness)$/.test(sufs[q].e.f)) return null;
    }
    if (sufs.length && reading && reading.kind !== "base" && (sufs[0].e.f === "y" || sufs[0].text === "d")) return null;
    for (var y = 1; y < sufs.length; y++) if (sufs[y].e.f === "y" || sufs[y - 1].e.f === "th" || (sufs[y].e.end && /^(er|est)$/.test(sufs[y].e.f))) return null;
    if (!pre.length && reading && reading.repaired) for (var z = 0; z < sufs.length; z++){
      if (!sufs[z].e.end && sufs[z].e.f !== "er" && (SUF[sufs[z].e.f] || []).some(function(e){ return e.end; })) return null;
    }
    var score = 0, weak = false, link = false;
    if (!reading) score += 5;
    else if (reading.kind === "base"){ score += reading.obscure ? 1 : 3; if (reading.obscure) weak = true; }
    else {
      var bestRoot = 0, nroots = 0;
      reading.parts.forEach(function(p){
        if (p.kind === "link"){ link = true; return; }
        nroots++;
        bestRoot = Math.max(bestRoot, p.strong ? 3 : 1);
        if (p.strong && reading.parts.length === 1 && p.text.replace(/e$/, "").length >= 5) bestRoot += 1;
        if (!p.strong) weak = true;
      });
      score += bestRoot + (link && nroots > 1 && !weak ? 1 : 0);
    }
    score += pre.length + sufs.length;
    var nEnd = sufs.filter(function(x){ return x.e.end; }).length, nb = n - nEnd;
    score -= Math.max(0, nb - 2) + Math.max(0, nb - 3) + Math.max(0, sufs.length - nEnd - 2);
    if (pre.length === 2) score -= 1;
    if (reading && reading.kind === "base" && Math.min(stem.length, reading.word.length) <= 3 && (pre.length || (reading.repaired && !sufs[0].e.end && !(sufs[0].e.f === "er" && reading.word.length < stem.length)))) score -= 2;
    if (pre.length && pre[0].text.length === 1) score -= 1;
    if (stem && stem.length < 3) score -= 2;
    return { score: score, weak: weak, link: link, n: n, pre: pre, stem: stem, reading: reading, sufs: sufs };
  }
  function better(a, b){
    if (a.score !== b.score) return a.score > b.score;
    if (a.stem.length !== b.stem.length) return a.stem.length < b.stem.length;
    if (a.n !== b.n) return a.n < b.n;
    if (!a.reading !== !b.reading) return !a.reading;
    var ka = a.reading ? a.reading.kind : "", kb = b.reading ? b.reading.kind : "";
    if (ka !== kb) return ka === "root";
    if (!!a.link !== !!b.link) return !a.link;
    var ra = a.reading && a.reading.repaired ? 1 : 0, rb = b.reading && b.reading.repaired ? 1 : 0;
    if (ra !== rb) return ra < rb;
    return a.pre.length > b.pre.length;
  }

  /* ---------- the analysis ---------- */
  function clean(word){
    return String(word || "").toLowerCase().replace(/’/g, "'").replace(/^[^a-z]+|[^a-z']+$/g, "");
  }
  function noSplit(w){
    if (NOSPLIT[w]) return true;
    var m = w.match(/^(.+?)(ies|es|s|ed|d|ing|ly|ers|er|est)$/);
    return !!(m && (NOSPLIT[m[1]] || NOSPLIT[m[1] + "e"] || (m[2] === "ies" && NOSPLIT[m[1] + "y"])));
  }
  function candidates(word){
    var w = clean(word), out = [], seen = {};
    if (!/^[a-z]+('s)?$/.test(w)) return out;
    function add(x){ if (x && x.length > 1 && !seen[x]){ seen[x] = 1; out.push(x); } }
    add(w);
    walk(w, function(pre, stem, sufs){
      if (!stem) return;
      (pre.length || sufs.length ? repairs(stem, sufs.length ? sufs[0].e.f : "") : [stem]).forEach(add);
    });
    return out;
  }
  function analyse(word, lookup){
    var w = clean(word);
    if (!/^[a-z]+('s)?$/.test(w) || w.length < 4) return null;
    if (noSplit(w)) return null;
    var cache = {};
    var whole = normLookup(lookup, w); cache[w] = whole;
    if (whole && w.length <= 5) return null;
    var best = null;
    function isWord(x){ var b = cache[x] !== undefined ? cache[x] : (cache[x] = normLookup(lookup, x)); return !!b && !b.obscure; }
    walk(w, function(pre, stem, sufs){
      if (sufs.length && sufs[0].e.f === "ling" && (/l$/.test(stem) || isWord(stem + "l") || isWord(stem + "le"))) return;
      var readings = stem ? stemReadings(stem, !!(pre.length || sufs.length), lookup, cache, sufs, pre) : [null];
      readings.forEach(function(r){
        var c = evaluate(pre, stem, r, sufs, whole);
        if (c && c.score >= 3 && (!best || better(c, best))) best = c;
      });
    }, isWord);
    if (!best) return null;
    best.whole = whole;
    return finish(best);
  }
  function finish(c){
    var parts = [];
    c.pre.forEach(function(p){ parts.push({ text: p.text, kind: "prefix", meaning: p.e.m, origin: p.e.o }); });
    if (c.reading) c.reading.parts.forEach(function(p){
      parts.push({ text: p.text, kind: p.kind, meaning: p.meaning, origin: p.origin, word: p.word });
    });
    c.sufs.forEach(function(s){ parts.push({ text: s.text, kind: s.e.end ? "ending" : "suffix", meaning: s.e.m, origin: s.e.o }); });
    var conf = Math.min(1, c.score / 5);
    if (c.weak) conf -= 0.25;
    conf = Math.round(Math.max(0.1, conf) * 100) / 100;
    return { parts: parts, gloss: gloss(c), confidence: conf };
  }

  /* ---------- gloss: putting the meanings together ---------- */
  var PP = {be:"been",have:"had",do:"done",go:"gone",make:"made",take:"taken",give:"given",see:"seen",say:"said",know:"known",get:"got",come:"come",think:"thought",find:"found",tell:"told",become:"become",leave:"left",feel:"felt",put:"put",bring:"brought",begin:"begun",keep:"kept",hold:"held",write:"written",stand:"stood",hear:"heard",let:"let",mean:"meant",set:"set",meet:"met",run:"run",pay:"paid",sit:"sat",speak:"spoken",lie:"lain",lead:"led",read:"read",grow:"grown",lose:"lost",fall:"fallen",send:"sent",build:"built",understand:"understood",draw:"drawn",break:"broken",spend:"spent",cut:"cut",rise:"risen",drive:"driven",buy:"bought",wear:"worn",choose:"chosen",seek:"sought",throw:"thrown",catch:"caught",deal:"dealt",win:"won",forget:"forgotten",lay:"laid",sell:"sold",fight:"fought",bear:"borne",teach:"taught",eat:"eaten",shake:"shaken",hide:"hidden",strike:"struck",bind:"bound",swear:"sworn",tear:"torn",fly:"flown",bend:"bent",shut:"shut",light:"lit",sing:"sung",ring:"rung",sink:"sunk",swim:"swum",drink:"drunk",ride:"ridden",bite:"bitten",freeze:"frozen",steal:"stolen",wake:"woken",weave:"woven",flee:"fled",feed:"fed",bleed:"bled",breed:"bred",sleep:"slept",sweep:"swept",creep:"crept",weep:"wept",spin:"spun",stick:"stuck",sting:"stung",swing:"swung",hang:"hung",dig:"dug",cling:"clung",fling:"flung",slide:"slid",shoot:"shot",shine:"shone",tread:"trodden",thrust:"thrust",cast:"cast",hurt:"hurt",spread:"spread",split:"split",burst:"burst",cost:"cost",hit:"hit",quit:"quit",prove:"proven",show:"shown",sew:"sewn",saw:"sawn",mow:"mown"};
  var STRESSED = set("begin admit omit commit submit permit refer prefer confer defer infer occur incur recur concur control patrol compel expel propel rebel regret forget upset equip");
  function cvc(v){ return /[^aeiou][aeiou][bdgklmnprtvz]$/.test(v) && (v.length <= 3 || (v.length === 4 && /^[^aeiou]{2}/.test(v)) || STRESSED[v]); }
  function inflect(v, form){
    if (form === "ed" && PP[v]) return PP[v];
    if (/ie$/.test(v) && form === "ing") return v.slice(0, -2) + "ying";
    if (/[^e]e$/.test(v) && form !== "s") return v.slice(0, -1) + form;
    if (/ee$/.test(v) && form === "ed") return v + "d";
    if (/[^aeiou]y$/.test(v)) return form === "s" ? v.slice(0, -1) + "ies" : form === "ed" ? v.slice(0, -1) + "ied" : v + form;
    if (form === "s") return /(s|x|z|ch|sh|o)$/.test(v) ? v + "es" : v + "s";
    return (cvc(v) ? v + v.charAt(v.length - 1) : v) + form;
  }
  /* conjugate the verb inside a phrase ("not agree" → "not agreeing") */
  function verbOf(ph){ var ws = ph.split(" "), i = 0; while (i < ws.length - 1 && /^(not|to)$/.test(ws[i])) i++; return ws[i]; }
  function conj(phrase, form){
    var ws = phrase.replace(/^to /, "").split(" "), i = 0;
    while (i < ws.length - 1 && /^(not|to)$/.test(ws[i])) i++;
    ws[i] = inflect(ws[i], form);
    return ws.join(" ");
  }
  /* noun readings of the prefixes that sit in front of a thing rather than an action
     ("between nations", "beneath the sea"); {bs} is the plural */
  var TN = { inter: "between {pl}", sub: "beneath the {b}", trans: "across the {b}", super: "above the {b}", extra: "outside the {b}",
    intra: "within the {b}", circum: "around the {b}", ante: "before the {b}", post: "after the {b}",     mid: "the middle of the {b}", counter: "against the {b}", anti: "against {b}", hypo: "beneath the {b}",
    hyper: "excessive {b}", epi: "upon the {b}", para: "beside the {b}", meta: "beyond the {b}", ex: "former {b}", peri: "around the {b}",
    under: "beneath the {b}", over: "above the {b}", tele: "distant {b}",
    micro: "small {b}", macro: "large {b}", multi: "many {pl}", poly: "many {pl}", mono: "one {b}", uni: "one {b}", bi: "two {pl}",
    tri: "three {pl}", semi: "half {b}", demi: "half {b}", hemi: "half {b}", omni: "all {pl}", pan: "all {pl}", pro: "in favour of {b}",
    contra: "against {b}", retro: "backward {b}", pseudo: "false {b}", neo: "new {b}", arch: "chief {b}", vice: "deputy {b}",
    mal: "bad {b}", bene: "good {b}", eu: "good {b}", dys: "bad {b}", a: "without {b}", auto: "{b} of oneself", self: "{b} of oneself",
    photo: "{b} by light", bio: "{b} of living things", geo: "{b} of the earth", psycho: "{b} of the mind", step: "{b} by remarriage" };
  /* what the Greek templates want after "the study of" */
  var N = { micro: "small things", macro: "large things", tele: "distant things", poly: "many things", mono: "one", auto: "oneself",
    photo: "light", bio: "life", geo: "the earth", psycho: "the mind", eco: "the household", neo: "new things", pseudo: "false things",
    hyper: "too much", hypo: "too little", omni: "everything", pan: "everything", mega: "great things", iso: "equal things",
    homo: "the same kind", hetero: "different kinds", proto: "the first", pyro: "fire", ecto: "the outside", endo: "the inside",
    exo: "the outside", oligo: "the few", kilo: "a thousand", self: "oneself" };
  /* root meanings that are verbs, so they can be conjugated in a gloss */
  var VERBS = set("look see say speak write hear throw lead send believe do make carry bend break shut close run flow go yield take seize hang weigh put place feel think follow breathe build touch hold pull draw come turn live call wish remember move drive push cut step climb fight ask seek laugh sit settle stand know teach flee have loosen roll promise join separate decide judge conquer eat wander deny change trust warn order paint please fill fold grasp prove test point prick reckon shout lean stick cling scatter clap rise stretch twist give pay thrust stir wash lift play dip mix nourish rub guard tremble clothe strike ward admit shape deceive divide arrange show appear treat measure suffer bear bind tighten sing sail work rule till tell mark heal free use");

  var PREP = /^(between|across|beneath|above|around|before|after|within|outside|beyond|against|upon|beside|under|over|through|in|out|away|toward|forward|apart|from|of)\b/;
  var WRAP = set("un in non a dis anti extra hyper ultra super semi arch vice pseudo neo self counter mal bene omni pan");
  function fill(t, b){
    return t.replace(/\{bed\}/g, function(){ return conj(b, "ed"); })
            .replace(/\{bing\}/g, function(){ return conj(b, "ing"); })
            .replace(/\{bs\}|\{pl\}/g, function(){ return conj(b, "s"); })
            .replace(/\{b\}|\{x\}/g, b);
  }
  function joined(c, inWord){
    var out = [];
    c.pre.forEach(function(p){ out.push(p.e.f === "in" && inWord ? inWord : first(p.e.m)); });
    if (c.reading) c.reading.parts.forEach(function(p){ if (p.kind !== "link") out.push(p.kind === "base" ? p.word : first(p.meaning)); });
    c.sufs.forEach(function(s){ if (!s.e.end && s.e.f !== "y") out.push(first(s.e.m)); });
    return out.join(" + ");
  }
  function gloss(c){
    var r = c.reading, pre = c.pre, sufs = c.sufs;
    var last = sufs.length ? sufs[sufs.length - 1].e : null;
    /* a Greek closing form: "the study of life", "sound from afar" */
    if (!r){
      var p0 = pre[0].e, g = sufs[0].e;
      if (g.t && N[p0.f]) return fill(g.t, N[p0.f]);
      if (p0.t) return fill(p0.t, first(g.m));
      return joined(c);
    }
    var rootsIn = r.parts.filter(function(p){ return p.kind === "root"; });
    if (last && last.greek && last.t && sufs.length === 1 && !pre.length && rootsIn.length === 1 && r.parts.length <= 3){
      var e0 = rootsIn[0].e;
      return fill(last.t, e0.n || first(e0.m));
    }
    if (r.parts.length > 1 || pre.length > 1) return joined(c);
    var base = r.parts[0];
    var phrase = base.kind === "base" ? base.word : first(base.meaning);
    if (base.kind === "root" && base.text === "log" && pre.length === 1 && N[pre[0].e.f]){
      pre = []; phrase = "the study of " + N[c.pre[0].e.f];
    }
    var pos = base.kind === "base" ? r.pos : (VERBS[phrase] ? "v" : "n");
    var NOUNY = /^(al|ial|ual|ic|ical|ar|ary|ery|ory|ous|ious|ine|ish|hood|ship|dom|less|ful|like|wise|ward|y|ese|esque|ess|ette|let|ling|oid|an|ian|ics)$/;
    var verbish = base.kind === "base" ? (pos ? (pos.indexOf("v") >= 0 || r.open) : !(sufs.length && NOUNY.test(sufs[0].e.f))) : !!VERBS[phrase];
    var wholeNoun = c.whole && !c.whole.open && c.whole.pos.indexOf("n") >= 0 && c.whole.pos.indexOf("v") < 0;
    var nounish = sufs.length ? !verbish : (base.kind === "base" ? (wholeNoun || (!!pos && pos.indexOf("v") < 0 && !r.open)) : !verbish);
    var head = phrase;
    var core = phrase, rel = false, ok = true;
    var adjEnd = -1;
    sufs.forEach(function(s, i){ if (partPos(s.e) === "a") adjEnd = i; });
    var tagged = base.kind === "base" ? (/(ed|ing)$/.test(base.word) ? "" : pos) : (r.basePos || "");
    var negable = tagged.indexOf("a") >= 0 || sufs.some(function(x){
      return x.e.pos === "adjective" && !/^(ant|ent)$/.test(x.e.f) && (/^(able|ible)$/.test(x.e.f) || (base.kind === "base" && !/[nv]/.test(pos)));
    });
    var wp = c.whole && !c.whole.open ? c.whole.pos : "";
    if (wp && !sufs.length && pre.length === 1 && pre[0].e.f === "in") negable = wp.indexOf("a") >= 0 && wp.indexOf("n") < 0;
    function apply(t){
      if (t === "to make {b}" && verbish) return;
      if (/\{b(ed|ing|s)\}/.test(t) && !verbish){ ok = false; return; }
      if (t === "in a {b} way" && phrase.indexOf(" ") >= 0) t = "in a way that is {b}";
      phrase = fill(t, phrase);
    }
    function applyPrefix(p, whole){
      var e = p.e, t = e.t;
      if (e.f === "in"){
        if (negable) t = "not {x}";
        else if (verbish) t = e.tv;
        else t = "in the {x}";
      } else if (e.f === "dis" && base.kind === "root" && verbish) t = e.tv;
      else if (!whole && nounish && TN[e.f]) t = TN[e.f];
      if (!t){ ok = false; return; }
      if (whole && rel && !/^(not|without) /.test(t)){ phrase = core; rel = false; }
      apply(t);
    }
    var wraps = [];
    pre.forEach(function(p){ if (WRAP[p.e.f]) wraps.push(p); else applyPrefix(p, false); });
    function applyWraps(){ wraps.forEach(function(p){ applyPrefix(p, true); }); wraps = []; }
    if (adjEnd < 0) applyWraps();
    sufs.forEach(function(s, i){
      var t = s.e.t;
      if (!t){ ok = false; return; }
      var relational = /^(relating to|of|having) \{b\}$/.test(t);
      if (relational && PREP.test(phrase)){ rel = false; }               /* "between nations" already reads as an adjective */
      else if (relational){ core = phrase; apply(t); rel = true; }
      else if (s.e.end && phrase.indexOf(" ") >= 0 && (!verbish || verbOf(phrase) !== head)){ rel = false; }   /* "the act of following", plural implied */
      else { apply(t); rel = false; }
      if (i === adjEnd) applyWraps();
    });
    return ok ? phrase : joined(c, negable ? "not" : "in");
  }

  var api = { PREFIXES: PREFIXES, SUFFIXES: SUFFIXES, ROOTS: ROOTS, BASES: BASES, analyse: analyse, candidates: candidates };
  global.llMorph = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);


