/* lamplight — offline sentence explainer (see llExplain) */
/* ============================================================
   Lamplight — offline sentence explainer
   Rule-based English analysis using the bundled dictionary:
   clauses, who / did what / to whom, tense, phrasal verbs and
   idioms, and a plainer rewrite. No network needed.
   window.llExplain.explain(sentence, dictLookup, wordRank)
   ============================================================ */
(function(){
  "use strict";

  /* ---------- closed-class words ---------- */
  function set(s){ var o = {}; s.split(" ").forEach(function(w){ if (w) o[w] = 1; }); return o; }
  var DET   = set("a an the this that these those my your his her its our their some any no every each either neither much many more most few fewer several all both half another other such enough little less whose what which");
  var PRON  = set("i you he she it we they who someone somebody anyone anybody everyone everybody nobody none one something anything everything nothing whoever whatever mine yours hers ours theirs myself yourself himself herself itself ourselves themselves this that these those");
  var PRONO = set("me you him her it us them whom myself yourself himself herself itself ourselves themselves");
  var PERSON = set("i you he she we they me him us them who whom someone somebody anyone anybody everyone everybody nobody myself yourself himself herself ourselves themselves man woman boy girl child children people person friend mother father sister brother son daughter husband wife family doctor teacher king queen lady gentleman sir madam mr mrs miss ms baby uncle aunt neighbour neighbor stranger guest master servant soldier sailor captain nurse officer");
  var PREP  = set("about above across after against along amid among amongst around as at before behind below beneath beside besides between beyond by despite down during except for from in inside into like near of off on onto out outside over past per since than through throughout till to toward towards under underneath until unto up upon via with within without versus unlike aboard concerning regarding");
  var PART  = set("up down off out over on in away back through along around about forward aside apart together");
  var CC    = set("and but or nor so yet");
  var SUB = {
    "because":"reason", "since":"reason", "as":"reason / time", "although":"contrast", "though":"contrast", "whereas":"contrast",
    "while":"time / contrast", "whilst":"time / contrast", "when":"time", "whenever":"time", "before":"time", "after":"time",
    "until":"time", "till":"time", "once":"time", "if":"condition", "unless":"condition", "where":"place", "wherever":"place",
    "whether":"alternative", "lest":"purpose", "than":"comparison", "so":"result"
  };
  var SUB2 = { "so that":"purpose", "in order that":"purpose", "even though":"contrast", "even if":"condition", "as soon as":"time",
    "as long as":"condition", "as if":"manner", "as though":"manner", "now that":"reason", "provided that":"condition", "in case":"condition",
    "rather than":"contrast", "in order to":"purpose", "so as to":"purpose" };
  var REL   = set("who whom whose which that where when");
  var WH    = set("what where when why how who whom whose which whether");
  var BE    = set("am is are was were be been being");
  var HAVE  = set("have has had having");
  var DO    = set("do does did");
  var MODAL = set("will would shall should can could may might must ought");
  var NEG   = set("not never");
  var ADVS  = set("very quite rather too so also just only even still yet already always never often sometimes usually soon now then here there again almost nearly perhaps maybe really well away back ever however therefore thus instead anyway indeed later ago once twice far long much more most less least early late hard fast enough tonight today tomorrow yesterday seldom rarely everywhere anywhere somewhere nowhere pretty else forever meanwhile afterwards afterward finally eventually suddenly home abroad upstairs downstairs outside inside");
  var TIME_ADV = set("now then soon later ago already still yet always never often sometimes usually seldom rarely today tonight tomorrow yesterday once twice again finally eventually meanwhile afterwards afterward suddenly forever");
  var COPULA = set("be seem become appear remain stay feel look sound smell taste get grow turn prove keep lie stand sit");
  var CATEN  = set("keep start stop begin continue go come like love hate enjoy finish avoid consider mind try help let make see hear watch feel need want seem appear tend happen manage fail dare used going remember forget");
  var DITRANS = set("give send tell show offer bring hand lend pay teach buy make get write read sell pass throw owe promise ask leave wish cost save find cook build pour fetch grant deny refuse");
  var MOTION = set("go come walk run fall sit stand lie live stay put drive ride fly move climb jump step travel arrive return rush hurry wander stroll march creep crawl swim sail float drift lean hang");
  var LOCPREP = set("in on at into onto under over along across through down up near by to from toward towards behind beside above below beneath inside outside between among around past");
  var TIME_NOUN = set("morning evening afternoon night day week month year hour minute second moment time century decade summer winter spring autumn dawn dusk midnight noon monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december weekend christmas easter breakfast lunch dinner tea sunset sunrise dark daybreak nightfall");
  var REPORT = set("say think know believe hope feel suggest claim admit explain insist remember realise realize understand notice hear decide wish mean promise fear suppose guess imagine agree argue reply doubt assume expect learn discover forget bet reckon swear pretend");

  /* irregular verbs: base -> [past, past participle] */
  var IRR = {
    be:["was","been"], have:["had","had"], do:["did","done"], go:["went","gone"], say:["said","said"], make:["made","made"], get:["got","got"],
    give:["gave","given"], take:["took","taken"], come:["came","come"], see:["saw","seen"], know:["knew","known"], think:["thought","thought"],
    tell:["told","told"], find:["found","found"], leave:["left","left"], feel:["felt","felt"], keep:["kept","kept"], hold:["held","held"],
    bring:["brought","brought"], buy:["bought","bought"], catch:["caught","caught"], teach:["taught","taught"], seek:["sought","sought"],
    fight:["fought","fought"], stand:["stood","stood"], understand:["understood","understood"], hear:["heard","heard"], lead:["led","led"],
    mean:["meant","meant"], meet:["met","met"], pay:["paid","paid"], run:["ran","run"], sit:["sat","sat"], sell:["sold","sold"], send:["sent","sent"],
    spend:["spent","spent"], speak:["spoke","spoken"], steal:["stole","stolen"], swear:["swore","sworn"], swim:["swam","swum"], throw:["threw","thrown"],
    wear:["wore","worn"], win:["won","won"], write:["wrote","written"], wake:["woke","woken"], draw:["drew","drawn"], drive:["drove","driven"],
    drink:["drank","drunk"], eat:["ate","eaten"], fall:["fell","fallen"], fly:["flew","flown"], forget:["forgot","forgotten"], freeze:["froze","frozen"],
    grow:["grew","grown"], hide:["hid","hidden"], hang:["hung","hung"], lie:["lay","lain"], lay:["laid","laid"], lose:["lost","lost"], ring:["rang","rung"],
    rise:["rose","risen"], ride:["rode","ridden"], sing:["sang","sung"], sink:["sank","sunk"], shake:["shook","shaken"], shine:["shone","shone"],
    shoot:["shot","shot"], sleep:["slept","slept"], slide:["slid","slid"], spring:["sprang","sprung"], stick:["stuck","stuck"], strike:["struck","struck"],
    sweep:["swept","swept"], swing:["swung","swung"], tear:["tore","torn"], weep:["wept","wept"], bend:["bent","bent"], bite:["bit","bitten"],
    bleed:["bled","bled"], blow:["blew","blown"], break:["broke","broken"], build:["built","built"], burn:["burnt","burnt"], choose:["chose","chosen"],
    cling:["clung","clung"], creep:["crept","crept"], deal:["dealt","dealt"], dig:["dug","dug"], dream:["dreamt","dreamt"], feed:["fed","fed"],
    flee:["fled","fled"], fling:["flung","flung"], forbid:["forbade","forbidden"], kneel:["knelt","knelt"], lend:["lent","lent"], light:["lit","lit"],
    leap:["leapt","leapt"], learn:["learnt","learnt"], shrink:["shrank","shrunk"], smell:["smelt","smelt"], spell:["spelt","spelt"], spill:["spilt","spilt"],
    spit:["spat","spat"], spin:["spun","spun"], stride:["strode","stridden"], strive:["strove","striven"], swell:["swelled","swollen"], weave:["wove","woven"],
    withdraw:["withdrew","withdrawn"], arise:["arose","arisen"], bear:["bore","borne"], beat:["beat","beaten"], begin:["began","begun"], bind:["bound","bound"],
    dwell:["dwelt","dwelt"], overcome:["overcame","overcome"], become:["became","become"], cut:["cut","cut"], put:["put","put"], let:["let","let"],
    set:["set","set"], shut:["shut","shut"], hit:["hit","hit"], hurt:["hurt","hurt"], cost:["cost","cost"], read:["read","read"], spread:["spread","spread"],
    quit:["quit","quit"], split:["split","split"], bet:["bet","bet"], cast:["cast","cast"], burst:["burst","burst"], wind:["wound","wound"], grind:["ground","ground"],
    forgive:["forgave","forgiven"], mistake:["mistook","mistaken"], undertake:["undertook","undertaken"], awake:["awoke","awoken"], sew:["sewed","sewn"],
    show:["showed","shown"], prove:["proved","proven"], mow:["mowed","mown"], tread:["trod","trodden"], string:["strung","strung"], wring:["wrung","wrung"],
    sting:["stung","stung"], slay:["slew","slain"], forsake:["forsook","forsaken"], shed:["shed","shed"], wed:["wed","wed"], thrust:["thrust","thrust"],
    breed:["bred","bred"], speed:["sped","sped"], lean:["leant","leant"], spoil:["spoilt","spoilt"], bid:["bid","bid"],
    hew:["hewed","hewn"], sow:["sowed","sown"], strew:["strewed","strewn"], shear:["sheared","shorn"], rid:["rid","rid"], foresee:["foresaw","foreseen"],
    overtake:["overtook","overtaken"], upset:["upset","upset"], withhold:["withheld","withheld"], uphold:["upheld","upheld"], behold:["beheld","beheld"]
  };
  var PAST = {}, PP = {};
  Object.keys(IRR).forEach(function(b){ PAST[IRR[b][0]] = b; PP[IRR[b][1]] = b; });
  var SPECIAL = { am:["be","base"], is:["be","3sg"], are:["be","base"], was:["be","past"], were:["be","past"], been:["be","pp"], being:["be","ing"],
    has:["have","3sg"], had:["have","past"], having:["have","ing"], does:["do","3sg"], did:["do","past"], done:["do","pp"], goes:["go","3sg"], went:["go","past"], gone:["go","pp"] };

  /* common verbs (base forms) — the bundled dictionary keeps only three senses per word,
     so very ordinary verbs are often listed as nouns only */
  var VERBS = set("accept achieve act add admit affect afford agree aim allow announce answer appear apply argue arrange arrive ask attack attend avoid awake bake bang bear beat become beg begin behave believe belong bend bet bind bite bleed blow boil borrow bounce bow break breathe bring build burn burst bury buy call calm care carry cast catch cause change chase chat cheat check cheer chew choose chop claim clap clean clear climb cling close collect come comfort command compare complain confess connect consider contain continue cook cost count cover crack crash crawl creep cross cry cut dance dare deal decide deliver deny depend describe deserve destroy die dig disappear discover dislike dismiss divide do doubt drag draw dream dress drift drink drip drive drop drown dry dwell earn eat empty end enjoy enter escape excuse exist expect explain express fade fail fall fear feed feel fetch fight fill find finish fit fix flash flee fling float flow fly fold follow forbid force forget forgive form freeze frighten frown gather gaze get give glance go grab grant grasp greet grin grind grip groan grow guard guess guide hand handle hang happen harm hate have head heal hear heat help hesitate hide hit hold hope hug hum hunt hurry hurt ignore imagine include insist intend interrupt invite join joke judge jump keep kick kill kiss kneel knit knock know land last laugh lay lead lean leap learn leave lend let lie lift light like listen live load lock long look lose love make manage mark marry matter mean measure meet melt mend mention mind miss mix moan move murmur name need nod note notice obey observe occur offer open order own pack paint pass pause pay peer pick pile place plan plant play plead please point pour pray prefer prepare press pretend prevent promise protect prove pull punish push put question quit race raise reach read realise realize receive recognise recognize refuse regret relax release remain remember remind remove repeat reply rest return ride ring rise risk roar rock roll rub ruin run rush sail save say scare scatter scream search see seek seem seize sell send serve set settle shake shape share shift shine shiver shoot shout show shrug shut sigh sign sing sink sit sleep slide slip smell smile snap sniff snow sob sound speak spend spill spin spit spoil spread spring squeeze stand stare start stay steal step stick sting stir stop stretch strike struggle study succeed suffer suggest suit supply support suppose surprise surround survive swallow swear sweep swim swing take talk taste teach tear tell tend thank think throw tick tie touch trace train travel treat tremble trip trust try turn twist understand undo unlock urge use vanish visit wait wake walk wander want warm warn wash waste watch wave wear weep weigh welcome whisper win wind wish wonder work worry wrap write yawn yell yield tremble mutter mumble glare stumble creak whirl gleam glow flicker rattle pace toss clutch cradle wince flinch scramble sprint dash tiptoe linger hover perch huddle slump sprawl squint blink gape nudge shove tug yank fling hurl snatch scoop dab pat stroke scrub rinse polish sweep scatter sprinkle stir simmer sizzle");

  /* ---------- helpers ---------- */
  function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function isCap(w){ return /^[A-ZÀ-Þ]/.test(w); }
  function lower(w){ return w.toLowerCase().replace(/[’]/g, "'"); }

  /* lemma guesses for an inflected word: [[lemma, form], ...] */
  function lemmas(w){
    var out = [];
    function add(l, f){ if (l && l.length > 1 && !out.some(function(o){ return o[0] === l && o[1] === f; })) out.push([l, f]); }
    if (SPECIAL[w]) add(SPECIAL[w][0], SPECIAL[w][1]);
    if (PAST[w]) add(PAST[w], "past");
    if (PP[w]) add(PP[w], "pp");
    if (IRR[w]) add(w, "base");
    if (w.length > 3){
      if (/ies$/.test(w)) add(w.slice(0,-3) + "y", "s");
      if (/(ses|xes|zes|ches|shes)$/.test(w)) add(w.slice(0,-2), "s");
      if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0,-1), "s");
      if (/ied$/.test(w)) add(w.slice(0,-3) + "y", "ed");
      if (/ed$/.test(w)){ add(w.slice(0,-1), "ed"); add(w.slice(0,-2), "ed"); if (/(.)\1ed$/.test(w)) add(w.slice(0,-3), "ed"); }
      if (/ing$/.test(w)){ add(w.slice(0,-3), "ing"); add(w.slice(0,-3) + "e", "ing"); if (/(.)\1ing$/.test(w)) add(w.slice(0,-4), "ing"); }
      if (/er$/.test(w)){ add(w.slice(0,-2), "er"); add(w.slice(0,-1), "er"); }
      if (/est$/.test(w)){ add(w.slice(0,-3), "est"); add(w.slice(0,-2), "est"); }
      if (/ly$/.test(w)) add(w.slice(0,-2), "ly");
    }
    add(w, "base");
    return out;
  }

  /* inflect a base verb: base | 3sg | past | pp | ing */
  function inflect(base, form){
    if (!form || form === "base") return base;
    if (form === "ed") form = "past";
    if (IRR[base]){ if (form === "past") return IRR[base][0]; if (form === "pp") return IRR[base][1]; }
    if (base === "be") return form === "3sg" ? "is" : form === "ing" ? "being" : base;
    if (base === "have") return form === "3sg" ? "has" : form === "ing" ? "having" : base;
    var cvc = /[^aeiou][aeiou][^aeiouwxy]$/.test(base) && base.length <= 5 && !/[^aeiou](er|en|el|on|it|et|ow)$/.test(base);
    if (form === "3sg"){
      if (/(s|x|z|ch|sh|o)$/.test(base)) return base + "es";
      if (/[^aeiou]y$/.test(base)) return base.slice(0,-1) + "ies";
      return base + "s";
    }
    if (form === "past" || form === "pp"){
      if (/e$/.test(base)) return base + "d";
      if (/[^aeiou]y$/.test(base)) return base.slice(0,-1) + "ied";
      if (cvc) return base + base.charAt(base.length-1) + "ed";
      return base + "ed";
    }
    if (form === "ing"){
      if (/ie$/.test(base)) return base.slice(0,-2) + "ying";
      if (/e$/.test(base) && !/ee$/.test(base)) return base.slice(0,-1) + "ing";
      if (cvc) return base + base.charAt(base.length-1) + "ing";
      return base + "ing";
    }
    return base;
  }
  function plural(n){
    if (/(s|x|z|ch|sh)$/.test(n)) return n + "es";
    if (/[^aeiou]y$/.test(n)) return n.slice(0,-1) + "ies";
    return n + "s";
  }

  /* ---------- tokeniser (splits contractions) ---------- */
  var TOK = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-z]+)?(?:-[A-Za-zÀ-ɏ]+)*|\d+(?:[.,:]\d+)*(?:st|nd|rd|th)?|[^\sA-Za-zÀ-ɏ\d]/g;
  function tokenize(s){
    var toks = [], m, at = 0;
    /* s / e: where the token sits in the source string (both halves of a contraction share the span) */
    function push(l, w, glued){ toks.push({ w: w, l: l, glued: !!glued, punct: !glued && !/^[A-Za-zÀ-ɏ\d]/.test(w), s: at, e: at + m[0].length }); }
    TOK.lastIndex = 0;
    while ((m = TOK.exec(s))){
      var w = m[0], l = lower(w);
      at = m.index;
      if (/^[A-Za-z]/.test(w) && l.indexOf("'") > 0){
        var stem = l.split("'")[0], suf = l.split("'")[1], W = w.slice(0, stem.length);
        if (l === "can't"){ push("can", W.slice(0,3)); push("not", "not", true); continue; }
        if (l === "won't"){ push("will", isCap(w) ? "Will" : "will"); push("not", "not", true); continue; }
        if (l === "shan't"){ push("shall", isCap(w) ? "Shall" : "shall"); push("not", "not", true); continue; }
        if (l === "let's"){ push("let", W); push("us", "us", true); continue; }
        if (l === "ain't"){ push("is", isCap(w) ? "Is" : "is"); push("not", "not", true); continue; }
        if (suf === "t" && /n$/.test(stem)){ push(stem.slice(0,-1), W.slice(0,-1)); push("not", "not", true); continue; }
        if (suf === "ll"){ push(stem, W); push("will", "'ll", true); continue; }
        if (suf === "ve"){ push(stem, W); push("have", "'ve", true); continue; }
        if (suf === "re"){ push(stem, W); push("are", "'re", true); continue; }
        if (suf === "m"){ push(stem, W); push("am", "'m", true); continue; }
        if (suf === "d"){ push(stem, W); push("'d", "'d", true); continue; }
        if (suf === "s"){
          if (/^(he|she|it|that|there|what|who|where|here|how|when|this|everything|nothing|something|someone|everyone|nobody|somebody)$/.test(stem)){ push(stem, W); push("'s", "'s", true); continue; }
          push(stem, w); toks[toks.length-1].poss = true; continue;
        }
      }
      push(l, w);
    }
    toks.forEach(function(t, i){ t.i = i; });
    return toks;
  }

  /* ---------- tagging ---------- */
  function posOf(entry){
    var o = {};
    if (!entry) return o;
    entry.m.forEach(function(m){
      if (m.p) o[m.p] = 1;
      else if (/^(\([^)]*\)\s*)?To\b/.test(m.d || "")) o.verb = 1;
      else if (/^(\([^)]*\)\s*)?(A|An|The|One who|That which|Any)\b/.test(m.d || "")) o.noun = 1;
    });
    return o;
  }
  function isVerbBase(L, dict){ return !!(VERBS[L] || IRR[L] || Object.prototype.hasOwnProperty.call(FORMAL.verb, L) || posOf(dict(L)).verb); }

  function candidates(t, i, toks, dict){
    var w = t.l, c = {};
    t.forms = {};
    if (t.punct){ c.PUNCT = 1; return c; }
    if (/^\d/.test(w)){ c.NUM = 1; return c; }
    if (w === "'s" || w === "'d"){ c.AUX = 1; return c; }
    if (w === "to"){ c.TO = 1; c.PREP = 1; return c; }
    if (w === "there"){ c.THERE = 1; c.ADV = 1; return c; }
    if (t.poss){ c.POSS = 1; return c; }
    if (BE[w] || HAVE[w] || DO[w]) c.AUX = 1;
    if (MODAL[w]) c.MODAL = 1;
    if (NEG[w]) c.NEG = 1;
    if (DET[w]) c.DET = 1;
    if (PRON[w]) c.PRON = 1;
    if (PRONO[w]) c.PRONO = 1;
    if (PREP[w]) c.PREP = 1;
    if (PART[w]) c.PART = 1;
    if (CC[w]) c.CC = 1;
    if (SUB[w]) c.SC = 1;
    if (REL[w]) c.REL = 1;
    if (WH[w]) c.WH = 1;
    if (ADVS[w]) c.ADV = 1;
    var hardClosed = c.DET || c.PRON || c.PRONO || c.CC || c.SC || c.AUX || c.MODAL || c.NEG || (c.PREP && !c.PART && !c.ADV);
    if (hardClosed && !/^(like|long|close|round|last|light|well|even|near|past|mind|will|may|can|might|saw)$/.test(w)) return c;
    /* open class */
    if (isCap(t.w) && i > 0 && !toks[i-1].punct && !hardClosed) c.PROPER = 1;
    var lem = lemmas(w);
    for (var k = 0; k < lem.length; k++){
      var L = lem[k][0], f = lem[k][1];
      var e = dict(L), p = posOf(e), vb = isVerbBase(L, dict) || SPECIAL[w];
      if (f === "base"){
        if (vb){ c.VERB = 1; t.forms.base = 1; }
        if (p.noun) c.NOUN = 1;
        if (p.adjective) c.ADJ = 1;
        if (p.adverb) c.ADV = 1;
      } else if (f === "3sg"){ c.VERB = 1; t.forms["3sg"] = 1; }
      else if (f === "s"){
        if (vb){ c.VERB = 1; t.forms["3sg"] = 1; }
        if (p.noun || (e && !p.verb) || (!e && !vb)){ c.NOUN = 1; t.plural = true; }
      } else if (f === "ed"){
        if (vb || !e){ c.VERB = 1; t.forms.past = 1; t.forms.pp = 1; }
        if (p.adjective) c.ADJ = 1;
      } else if (f === "past"){ c.VERB = 1; t.forms.past = 1; }
      else if (f === "pp"){ c.VERB = 1; t.forms.pp = 1; }
      else if (f === "ing"){
        if (vb || !e){ c.VERB = 1; t.forms.ing = 1; }
        if (p.noun) c.NOUN = 1;
        if (p.adjective) c.ADJ = 1;
      } else if (f === "er" || f === "est"){
        if (p.adjective || p.adverb){ c.ADJ = 1; t.degree = f; }
      } else if (f === "ly"){ if (p.adjective || p.adverb) c.ADV = 1; }
    }
    var self = dict(w), sp = posOf(self);
    if (sp.noun) c.NOUN = 1; if (sp.adjective) c.ADJ = 1; if (sp.adverb) c.ADV = 1; if (sp.verb){ c.VERB = 1; t.forms.base = 1; }
    if (/ly$/.test(w) && w.length > 4 && !sp.noun) c.ADV = 1;
    if (/(ness|tion|sion|ment|ity|ship|hood|ism|ist|ance|ence|dom|ure|ology)$/.test(w)) c.NOUN = 1;
    if (/(ful|ous|ive|able|ible|ical|less|ish|ent|ant|ary|ory|ic|al)$/.test(w) && w.length > 5 && !sp.noun) c.ADJ = 1;
    if (!c.NOUN && !c.VERB && !c.ADJ && !c.ADV && !hardClosed && !c.PREP && !c.PART) c.NOUN = 1;
    return c;
  }

  function nounish(t){ return t && !t.punct && (t.c.NOUN || t.c.ADJ || t.c.DET || t.c.NUM || t.c.POSS || t.c.PROPER || t.c.PRON || t.c.PRONO); }
  function verbish(t){ return t && (t.c.VERB || t.c.AUX || t.c.MODAL); }

  function tag(toks, dict){
    toks.forEach(function(t, i){ t.c = candidates(t, i, toks, dict); });
    var prev = null, sawVerb = false, sawSubj = false, invertAux = false;
    for (var i = 0; i < toks.length; i++){
      var t = toks[i], c = t.c, next = toks[i+1], nn = toks[i+2];
      var pt = prev ? prev.tag : null;
      var eff = pt, q = i - 1;
      while (q >= 0 && (toks[q].tag === "ADV" || toks[q].tag === "NEG")) q--;
      if (q >= 0) eff = toks[q].tag;
      var afterAux = eff === "AUX" || eff === "MODAL" || eff === "TO" || pt === "NEG";
      var afterDet = pt === "DET" || pt === "ADJ" || pt === "NUM" || pt === "POSS";
      var afterPrep = pt === "PREP";
      var afterSubj = pt === "PRON" || pt === "NOUN" || pt === "THERE" || pt === "PROPER";
      var nextNoun = nounish(next), nextVerb = verbish(next);
      var tg = null, w = t.l;
      if (c.PUNCT) tg = "PUNCT";
      else if (c.NUM) tg = "NUM";
      else if (c.POSS) tg = "POSS";
      else if (w === "to") tg = (next && next.c.VERB && !(next.c.NOUN && !next.c.VERB) && !next.c.DET && !(next.c.NOUN && nn && verbish(nn))) ? "TO" : "PREP";
      else if (w === "there") tg = (next && next.c.AUX && !sawVerb) ? "THERE" : "ADV";
      else if (w === "'s"){ t.l = (next && (next.forms.pp || next.l === "been" || next.l === "got")) ? "has" : "is"; tg = "AUX"; }
      else if (w === "'d"){ var hadIt = next && (next.forms.pp || next.l === "been") && !(next.forms.base); t.l = hadIt ? "had" : "would"; tg = hadIt ? "AUX" : "MODAL"; }
      else if (w === "that"){
        if (next && (next.c.DET === undefined) && nounish(next) && !next.c.PRON && !next.c.AUX && !verbish(next)) tg = "DET";
        else if (pt === "NOUN" || pt === "PRONO" || pt === "PROPER") tg = (nextVerb || (next && next.c.PRON)) ? "REL" : "DET";
        else if (pt === "VERB" || pt === "AUX" || pt === "ADJ" || pt === "ADV" || (pt === "PUNCT" && sawVerb)) tg = clauseFollows(toks, i + 1) ? "SC" : (nextNoun ? "DET" : "PRON");
        else tg = (nextNoun && !next.c.PRON) ? "DET" : "PRON";
      }
      else if (w === "so"){ tg = (pt === "PUNCT" || i === 0) && clauseFollows(toks, i + 1) ? "CC" : (next && next.l === "that" ? "SC" : "ADV"); }
      else if (w === "yet" || w === "still"){ tg = (pt === "PUNCT" || i === 0) && clauseFollows(toks, i + 1) ? "CC" : "ADV"; }
      else if (w === "as"){ tg = (next && next.l === "well") ? "ADV" : clauseFollows(toks, i + 1) ? "SC" : "PREP"; }
      else if (w === "than"){ tg = clauseFollows(toks, i + 1) ? "SC" : "PREP"; }
      else if (c.SC && c.PREP){ tg = clauseFollows(toks, i + 1) ? "SC" : (next && !next.punct ? "PREP" : "ADV"); }
      else if (c.SC && (w === "once" || w === "while" || w === "when" || w === "where")){
        if (w === "when" || w === "where"){
          if (i === 0 || (pt === "PUNCT" && !sawVerb)) tg = clauseFollows(toks, i + 1) ? "SC" : "WH";
          else if (pt === "NOUN" && w === "where" || (pt === "NOUN" && w === "when")) tg = "REL";
          else if (pt === "VERB" || pt === "PREP" || pt === "AUX") tg = "WH";
          else tg = "SC";
        } else tg = clauseFollows(toks, i + 1) ? "SC" : "ADV";
      }
      else if (c.SC) tg = "SC";
      else if (c.WH && (w === "what" || w === "which" || w === "who" || w === "whom" || w === "whose" || w === "why" || w === "how")){
        if (w === "which" && nextNoun && !nextVerb && !(next && next.c.AUX)) tg = (pt === "NOUN" || pt === "PUNCT") && sawVerb ? "REL" : "DET";
        else if (w === "what" && nextNoun && !nextVerb && (pt === "VERB" || pt === "PREP" || pt === "AUX")) tg = "WH";
        else if ((w === "who" || w === "whom" || w === "whose" || w === "which") && (pt === "NOUN" || pt === "PROPER" || pt === "PRONO" || (pt === "PUNCT" && prev.l === "," && sawSubj))) tg = "REL";
        else if (w === "what" && pt !== "VERB" && pt !== "PREP" && pt !== "AUX" && nextNoun) tg = "DET";
        else tg = "WH";
      }
      else if (c.MODAL && !(w === "can" || w === "may" || w === "will" || w === "might")) tg = "MODAL";
      else if (c.MODAL) tg = (afterDet && c.NOUN) ? "NOUN" : "MODAL";
      else if (c.AUX) tg = "AUX";
      else if (c.NEG) tg = "NEG";
      else if (c.CC) tg = "CC";
      else if (c.DET && (c.PRONO || c.PRON) && /^(her|his|its|their|your|my|our)$/.test(w)) tg = (nextNoun && !next.c.PRON && !next.c.PRONO) ? "DET" : (c.PRONO ? "PRONO" : "PRON");
      else if (c.DET && c.PRON && /^(this|these|those)$/.test(w)) tg = nextNoun && !next.c.PRON ? "DET" : "PRON";
      else if (c.DET) tg = (nextNoun && !next.c.PRON && !next.c.PRONO) || !c.PRON ? "DET" : "PRON";
      else if (c.PRON && c.PRONO) tg = (pt === "VERB" || pt === "PREP" || pt === "AUX" || pt === "TO" || pt === "PART") ? "PRONO" : "PRON";
      else if (c.PRON) tg = "PRON";
      else if (c.PRONO) tg = "PRONO";
      else if (c.PART || (c.PREP && c.ADV)){
        /* particle / preposition / adverb */
        if (afterDet && c.NOUN) tg = "NOUN";
        else if ((afterAux || pt === "PRON" || pt === "NEG") && c.VERB && VERBS[w]) tg = "VERB";
        else if (nextNoun && !(next && next.c.PRON && !next.c.PRONO && !next.c.DET)) tg = "PREP";
        else if (pt === "VERB" || pt === "NOUN" || pt === "PRONO" || pt === "ADV" || pt === "AUX") tg = c.PART ? "PART" : "ADV";
        else tg = c.PART && !c.ADV ? "PART" : "ADV";
        if (w === "back" && afterDet) tg = "NOUN";
        if (w === "home" && (pt === "VERB" || pt === "PART")) tg = "ADV";
      }
      else if (c.PREP && c.VERB && w === "like") tg = (afterAux || pt === "PRON" || pt === "NOUN" || pt === "NEG" || pt === "PROPER") && !(pt === "NOUN" && nextNoun && !sawVerb) ? "VERB" : "PREP";
      else if (c.PREP && (w === "near" || w === "past" || w === "round" || w === "close")){ tg = afterDet ? (c.NOUN ? "NOUN" : "ADJ") : (afterAux && c.VERB ? "VERB" : "PREP"); }
      else if (c.PREP) tg = "PREP";
      else {
        var ingOrEd = t.forms.ing || t.forms.past || t.forms.pp;
        var adjNext = next && (next.c.NOUN || next.c.ADJ || next.c.PROPER) && !next.punct && !verbish(next);
        if (c.PROPER && !(c.VERB && afterAux)) tg = "PROPER";
        else if (afterAux && c.VERB) tg = "VERB";
        else if (invertAux && c.VERB && !afterDet && (pt === "PRON" || pt === "NOUN" || pt === "PROPER" || pt === "PRONO")) tg = "VERB";
        else if (t.degree && c.ADJ && !afterDet) tg = "ADJ";
        else if (afterAux && c.ADV && next && next.c.VERB) tg = "ADV";
        else if (afterAux && c.ADJ && !c.VERB) tg = "ADJ";
        else if (afterDet && c.ADJ && adjNext) tg = "ADJ";
        else if (afterDet && c.NOUN) tg = (c.ADJ && adjNext && next.c.NOUN) ? "ADJ" : "NOUN";
        else if (afterDet && c.VERB && ingOrEd && adjNext) tg = "ADJ";
        else if (afterDet && c.ADJ) tg = "ADJ";
        else if (afterDet) tg = "NOUN";
        else if (afterPrep && c.VERB && t.forms.ing && !c.NOUN) tg = "VERB";
        else if (afterPrep && c.ADJ && adjNext && !c.NOUN) tg = "ADJ";
        else if (afterPrep && (c.NOUN || c.ADJ)) tg = (c.ADJ && adjNext && next.c.NOUN) ? "ADJ" : (c.NOUN ? "NOUN" : "ADJ");
        else if (afterPrep) tg = c.ADV ? "ADV" : "NOUN";
        else if (afterSubj && !sawVerb && c.VERB) tg = "VERB";
        else if (afterSubj && !sawVerb && c.ADV && nextVerb) tg = "ADV";
        else if (sawVerb && c.ADV && (c.VERB || c.ADJ) && !afterAux && !(nextNoun && c.ADJ)) tg = "ADV";
        else if (c.ADV && !c.NOUN && !c.VERB && !c.ADJ) tg = "ADV";
        else if (c.ADV && /ly$/.test(w) && !c.NOUN) tg = "ADV";
        else if (c.ADJ && adjNext && next.c.NOUN && !(c.VERB && !sawVerb && afterSubj)) tg = "ADJ";
        else if (c.VERB && ingOrEd && !(c.ADJ && pt === "ADV") && !(sawVerb && c.NOUN && !t.forms.ing)) tg = "VERB";
        else if (c.NOUN && (!c.VERB || sawVerb || nextVerb || (next && next.c.AUX))) tg = "NOUN";
        else if (c.VERB) tg = "VERB";
        else if (c.ADJ) tg = "ADJ";
        else if (c.NOUN) tg = "NOUN";
        else tg = c.ADV ? "ADV" : "NOUN";
      }
      t.tag = tg;
      if ((tg === "AUX" || tg === "MODAL") && (i === 0 || pt === "WH" || pt === "PUNCT") && next && nounish(next) && !verbish(next)) invertAux = true;
      else if (tg === "VERB" || tg === "PUNCT" || tg === "PREP") invertAux = false;
      if (tg === "VERB" || tg === "AUX" || tg === "MODAL") sawVerb = true;
      if (tg === "NOUN" || tg === "PRON" || tg === "PROPER") sawSubj = true;
      if (tg === "PUNCT" && /^[,;:—–]$/.test(w) || tg === "CC" || tg === "SC" || tg === "REL"){ sawVerb = false; }
      if (tg === "PUNCT") sawSubj = sawSubj && w === ",";
      prev = t;
    }
    /* lemmas + verb forms */
    toks.forEach(function(t){
      var lem = lemmas(t.l);
      if (t.tag === "VERB" || t.tag === "AUX"){
        var pick = null, k;
        for (k = 0; k < lem.length && !pick; k++){ var L = lem[k][0]; if (SPECIAL[t.l] || VERBS[L] || IRR[L] || posOf(dict(L)).verb) pick = lem[k]; }
        for (k = 0; k < lem.length && !pick; k++){ if (dict(lem[k][0]) && lem[k][1] !== "base") pick = lem[k]; }
        for (k = 0; k < lem.length && !pick; k++){ if (lem[k][1] !== "base" && lem[k][1] !== "s") pick = lem[k]; }
        if (!pick) pick = lem[0];
        t.lemma = pick[0];
        var f = pick[1] === "s" ? "3sg" : pick[1];
        if (SPECIAL[t.l]) f = SPECIAL[t.l][1];
        t.form = f;
        if (f === "ed"){ t.forms.past = 1; t.forms.pp = 1; }
        else if (f) t.forms[f] = 1;
      } else if (t.tag === "NOUN" && t.plural){
        t.lemma = lem[0][0];
      } else t.lemma = t.l;
    });
    return toks;
  }
  function clauseFollows(toks, from){
    /* does a subject followed by a finite verb start here (before any punctuation / conjunction)? */
    var j = from, n = toks.length, pron = false, np = false;
    if (j < n && toks[j].c.ADV) j++;
    if (j < n && (toks[j].c.PRON && !toks[j].c.DET)){ pron = true; j++; }
    else {
      if (j < n && (toks[j].c.DET || toks[j].c.POSS || toks[j].c.NUM)){ np = true; j++; }
      var k = j;
      while (k < n && !toks[k].punct && (toks[k].c.ADJ || toks[k].c.NOUN || toks[k].c.PROPER || toks[k].c.POSS) && !(toks[k].c.AUX || toks[k].c.MODAL)){
        var f = toks[k].forms, inflected = f.past || f.pp || f.ing || f["3sg"];
        var nx = toks[k+1];
        /* an inflected verb-like word ends the noun phrase unless another noun follows it ("the broken clock") */
        if (inflected && !(nx && !nx.punct && (nx.c.NOUN || nx.c.PROPER) && !(nx.forms.past || nx.forms.pp || nx.forms.ing || nx.forms["3sg"]))) break;
        k++; np = true;
      }
      if (!np) return false;
      j = k;
      /* the last word of the noun phrase is the noun; a verb must come after it */
    }
    while (j < n && (toks[j].c.ADV || toks[j].c.NEG)) j++;
    if (j >= n || toks[j].punct) return false;
    var c = toks[j].c, t = toks[j];
    if (c.AUX || c.MODAL) return true;
    if (!c.VERB) return false;
    if (t.forms.ing && !t.forms.base && !t.forms.past && !t.forms["3sg"]) return false;
    if (pron) return true;
    /* after a full noun phrase, an ambiguous noun/verb word counts as a verb only if it is inflected */
    if (t.forms.past || t.forms.pp || t.forms.ing || t.forms["3sg"]) return true;
    return !c.NOUN;
  }

  /* ---------- clause splitting ---------- */
  function hasVerb(toks){ return toks.some(function(t){ return t.tag === "VERB" || t.tag === "AUX" || t.tag === "MODAL"; }); }
  function hasFinite(toks){ return toks.some(function(t){ return t.tag === "AUX" || t.tag === "MODAL" || (t.tag === "VERB" && !t.forms.ing && !(t.forms.pp && !t.forms.past)); }); }
  function startsWithVerb(toks, from){
    for (var j = from; j < toks.length; j++){
      if (toks[j].tag === "ADV" || toks[j].tag === "NEG") continue;
      return toks[j].tag === "VERB" || toks[j].tag === "AUX" || toks[j].tag === "MODAL";
    }
    return false;
  }
  function lastNP(toks){
    for (var j = toks.length - 1; j >= 0; j--){
      var tg = toks[j].tag;
      if (tg === "NOUN" || tg === "PRONO" || tg === "PROPER" || tg === "PRON"){
        var s = j; while (s > 0 && /^(ADJ|DET|NUM|NOUN|POSS|PROPER)$/.test(toks[s-1].tag)) s--;
        return text(toks.slice(s, j + 1));
      }
      if (tg === "PUNCT") continue;
      return null;
    }
    return null;
  }
  function text(toks, expand){
    var s = "", openQ = false;
    toks.forEach(function(t, i){
      var glue = t.glued && /^'/.test(t.w) && !expand;
      var closing = t.punct && (/^[,.;:!?)\]”’%]$/.test(t.w) || (t.w === '"' && openQ));
      var prevOpen = i && toks[i-1].punct && (/^[(\[“‘$]$/.test(toks[i-1].w) || (toks[i-1].w === '"' && openQ));
      if (i && !glue && !closing && !prevOpen) s += " ";
      s += (expand && t.glued) ? t.l : t.w;
      if (t.w === '"') openQ = !openQ;
    });
    return s.trim();
  }
  function splitClauses(toks){
    var clauses = [], cur = [], kind = "main", label = "", conj = null, lastToks = [];
    function flush(){
      if (cur.some(function(t){ return !t.punct; })){ clauses.push({ toks: cur, kind: kind, label: label, conj: conj }); lastToks = cur; }
      cur = []; kind = "main"; label = ""; conj = null;
    }
    var i = 0;
    while (i < toks.length){
      var t = toks[i], next = toks[i+1], w = t.l;
      /* two/three-word subordinators */
      var two = next ? w + " " + next.l : "", three = next && toks[i+2] ? two + " " + toks[i+2].l : "";
      if (SUB2[three] && !t.punct){ flush(); kind = "sub"; label = SUB2[three]; cur.push(t, next, toks[i+2]); toks[i].tag = "SC"; i += 3; continue; }
      if (SUB2[two] && !t.punct){ flush(); kind = "sub"; label = SUB2[two]; cur.push(t, next); toks[i].tag = "SC"; i += 2; continue; }
      if (t.tag === "PUNCT" && /^[;:—–]$/.test(w)){ flush(); i++; continue; }
      if (t.tag === "PUNCT" && (w === "," || /^["“”]$/.test(w))){
        if (w === "," && next && (next.tag === "CC" || next.tag === "SC" || next.tag === "REL" || (next.tag === "VERB" && next.forms.ing && !next.forms.base))){ flush(); i++; continue; }
        if (w === "," && (kind !== "main" || hasVerb(cur))){ flush(); i++; continue; }
        if (w === "," && !hasVerb(cur) && cur.length && cur[0].tag === "PREP"){ flush(); i++; continue; }
        if (w !== ","){ i++; continue; }
        cur.push(t); i++; continue;
      }
      if (t.tag === "CC" && cur.some(function(x){ return !x.punct; }) && hasVerb(cur) && (clauseFollows(toks, i + 1) || startsWithVerb(toks, i + 1))){
        flush(); conj = w; label = w === "but" || w === "yet" ? "contrast" : w === "so" ? "result" : w === "or" || w === "nor" ? "alternative" : "addition";
        cur.push(t); i++; continue;
      }
      if (t.tag === "SC"){
        var lead = null;
        if (cur.length && cur[cur.length-1].tag === "ADV" && /^(long|just|right|shortly|soon|immediately|even|only|ever|partly|especially|simply|mainly|largely|almost)$/.test(cur[cur.length-1].l)) lead = cur.pop();
        if (cur.some(function(x){ return !x.punct; })) flush();
        kind = "sub"; label = SUB[w] || "sub"; if (lead) cur.push(lead); cur.push(t); i++; continue;
      }
      /* "I think [that] she is coming": a reported clause without "that" */
      if (t.tag === "VERB" && REPORT[t.lemma] && next && !next.punct && next.tag !== "SC" && next.tag !== "REL" && next.tag !== "TO" && next.tag !== "PREP" && (next.tag === "PRON" || next.tag === "DET" || next.tag === "PROPER" || next.tag === "THERE") && !cur.some(function(x){ return /^(whoever|whatever|whichever)$/.test(x.l); }) && clauseFollows(toks, i + 1)){
        cur.push(t); flush(); kind = "sub"; label = "what is " + inflect(t.lemma, "pp"); i++; continue;
      }
      if (t.tag === "REL"){
        var head = lastNP(cur.some(function(x){ return !x.punct; }) ? cur : lastToks);
        if (cur.some(function(x){ return !x.punct; })){ flush(); }
        kind = "rel"; label = head ? head : ""; cur.push(t); i++; continue;
      }
      if (t.tag === "WH" && cur.length && (hasVerb(cur) || cur[cur.length-1].tag === "PREP") && clauseFollows(toks, i + 1)){
        flush(); kind = "wh"; label = w; cur.push(t); i++; continue;
      }
      cur.push(t); i++;
    }
    flush();
    /* an interrupting relative clause: "The man, who …, gave …" → rejoin the two halves */
    for (var k = 0; k + 2 < clauses.length; k++){
      var a = clauses[k], r = clauses[k+1], b = clauses[k+2];
      if (r.kind === "rel" && !hasVerb(a.toks) && startsWithVerb(b.toks, 0) && a.kind === "main"){
        a.toks = a.toks.concat(b.toks); a.interrupted = true;
        clauses.splice(k + 2, 1);
      }
    }
    return clauses;
  }

  /* ---------- noun phrases ---------- */
  function readNP(toks, i){
    /* returns end index (exclusive) of a noun phrase starting at i, or i if none */
    var j = i, n = toks.length;
    if (j < n && (toks[j].tag === "PRON" || toks[j].tag === "PRONO")){ j++; return ofChain(toks, j); }
    if (j < n && (toks[j].tag === "DET" || toks[j].tag === "POSS" || toks[j].tag === "NUM")) j++;
    while (j < n && (toks[j].tag === "ADJ" || toks[j].tag === "NUM" || toks[j].tag === "POSS" || (toks[j].tag === "ADV" && /ly$|^very$|^quite$|^rather$|^too$|^so$/.test(toks[j].l) && toks[j+1] && toks[j+1].tag === "ADJ"))) j++;
    var nouns = 0;
    while (j < n && (toks[j].tag === "NOUN" || toks[j].tag === "PROPER")){ j++; nouns++; }
    if (!nouns){
      /* adjective used as a noun phrase? ("the poor") — accept DET + ADJ */
      if (j > i && toks[j-1].tag === "ADJ") return ofChain(toks, j);
      return i;
    }
    return ofChain(toks, j);
  }
  function ofChain(toks, j){
    if (j < toks.length && toks[j].tag === "PREP" && toks[j].l === "of"){
      var e = readNP(toks, j + 1);
      if (e > j + 1) return e;
    }
    return j;
  }

  /* ---------- clause analysis ---------- */
  function analyseClause(cl, dict, prevClause){
    var toks = cl.toks, n = toks.length;
    var start = 0, subToks = [];
    while (start < n && (toks[start].tag === "PUNCT" || toks[start].tag === "CC" || toks[start].tag === "SC" || (toks[start].tag === "REL" && cl.kind === "rel") || (toks[start].tag === "WH" && cl.kind === "wh") || (toks[start].tag === "ADV" && toks[start+1] && toks[start+1].tag === "SC"))){
      if (toks[start].tag === "SC" || (toks[start].tag === "ADV" && toks[start+1] && toks[start+1].tag === "SC")) subToks.push(toks[start]);
      start++;
    }
    var wh = null;
    if (cl.kind === "main" && start < n && toks[start].tag === "WH"){ wh = toks[start]; start++; }
    var rel = cl.kind === "rel" ? toks.filter(function(t){ return t.tag === "REL"; })[0] : null;
    var res = { text: text(toks), kind: cl.kind, label: cl.label, conj: cl.conj, sub: subToks.length ? text(subToks) : null, subject: null, verb: null, object: null, extras: [], tense: null, negative: false,
                span: [toks[0].i, toks[n-1].i], pos: null };   /* span / pos: token indices, for the simplifier */

    /* verb group */
    var v0 = -1;
    for (var i = start; i < n; i++){
      var tg = toks[i].tag;
      if (tg === "AUX" || tg === "MODAL" || tg === "VERB"){ v0 = i; break; }
    }
    if (v0 < 0){ res.fragment = true; res.phrase = text(toks.slice(start)); return res; }
    var sg = scanGroup(toks, v0), v1 = sg.v1, mainIdx = sg.mainIdx, after;
    /* "Whoever finds the ring must return it": the first verb belongs to a clause that is itself the subject */
    if (cl.kind === "main" && /^(whoever|whatever|whichever|what)$/.test(toks[start].l) && !inverted0(toks, v0, start)){
      var eS = readNP(toks, v1 + 1), mS = eS;
      while (mS < n && (toks[mS].tag === "ADV" || toks[mS].tag === "NEG")) mS++;
      if (mS > v1 + 1 || eS === v1 + 1){
        if (mS < n && (toks[mS].tag === "MODAL" || toks[mS].tag === "AUX" || (toks[mS].tag === "VERB" && (toks[mS].forms.past || toks[mS].forms["3sg"]) && !toks[mS].forms.ing))){
          res.subjectClause = text(toks.slice(start, mS));
          v0 = mS; sg = scanGroup(toks, v0); v1 = sg.v1; mainIdx = sg.mainIdx;
        }
      }
    }
    /* questions: "Where did you put…", "Can you hear…", "Is she ready?" */
    var inverted = false;
    if (toks[v0].tag !== "VERB" && v0 === start && v1 === v0){
      var npEndQ = readNP(toks, v0 + 1);
      if (npEndQ > v0 + 1){
        var q0 = npEndQ;
        while (q0 < n && (toks[q0].tag === "ADV" || toks[q0].tag === "NEG")) q0++;
        if (q0 < n && (toks[q0].tag === "VERB" || toks[q0].tag === "AUX")){
          var q1 = q0, seenQ = toks[q0].tag === "VERB"; mainIdx = seenQ ? q0 : -1;
          for (var qq = q0 + 1; qq < n; qq++){
            var tq = toks[qq].tag;
            if (tq === "ADV" || tq === "NEG") continue;
            if (tq === "AUX" && !seenQ){ q1 = qq; continue; }
            if (tq === "VERB" && !seenQ){ q1 = qq; seenQ = true; mainIdx = qq; continue; }
            if (tq === "TO" && toks[qq+1] && toks[qq+1].tag === "VERB" && seenQ){ q1 = qq + 1; mainIdx = qq + 1; qq++; continue; }
            break;
          }
          inverted = { subj: toks.slice(v0 + 1, npEndQ), aux: toks[v0], q0: q0, q1: q1, npEnd: npEndQ };
        } else if (q0 >= n || /^(PUNCT|ADJ|PREP|DET|NOUN|ADV)$/.test(toks[q0].tag)){
          inverted = { subj: toks.slice(v0 + 1, npEndQ), aux: toks[v0], q0: -1, q1: v0, npEnd: npEndQ };
        }
      }
    }
    var group;
    if (inverted){
      group = [inverted.aux].concat(inverted.q0 >= 0 ? toks.slice(inverted.q0, inverted.q1 + 1) : []);
      v1 = inverted.q1; after = inverted.q0 >= 0 ? v1 + 1 : inverted.npEnd;
      res.question = true;
    } else group = toks.slice(v0, v1 + 1);
    if (wh){ res.question = true; res.wh = wh.w; }
    if (res.subjectClause){ res.subject = res.subjectClause; }
    res.negative = group.some(function(t){ return t.tag === "NEG"; });
    var main = mainIdx >= 0 ? toks[mainIdx] : null;
    if (!main){ for (var k = group.length - 1; k >= 0; k--){ if (group[k].tag === "VERB" || group[k].tag === "AUX"){ main = group[k]; break; } } }
    var firstMain = null;
    for (var k2 = 0; k2 < group.length; k2++){ if (group[k2].tag === "VERB"){ firstMain = group[k2]; break; } }
    if (!firstMain) firstMain = main;

    /* particle / phrasal verb */
    var particle = null, prepVerb = null;
    if (!inverted) after = v1 + 1;
    while (after < n && (toks[after].tag === "ADV" && !TIME_ADV[toks[after].l])) after++;
    if (main && toks[after] && toks[after].tag === "PART" && dict(main.lemma + " " + toks[after].l)) particle = toks[after];
    else if (main && toks[after] && toks[after].tag === "PREP" && dict(main.lemma + " " + toks[after].l) && !(MOTION[main.lemma] && LOCPREP[toks[after].l]) && !(toks[after].l === "of" || toks[after].l === "to" && !/^(belong|refer|object|listen|see|get|come|lead|turn|attend|amount)$/.test(main.lemma))) prepVerb = toks[after];
    if (main && !particle && !prepVerb){
      var e0 = readNP(toks, after);
      if (e0 > after && toks[e0] && toks[e0].tag === "PART" && !(toks[e0+1] && nounish(toks[e0+1]) && toks[e0+1].tag !== "PRON") && dict(main.lemma + " " + toks[e0].l)){ particle = toks[e0]; res.splitParticle = true; }
    }
    res.particle = particle ? particle.l : prepVerb ? prepVerb.l : null;
    res.verb = text(group, true) + (particle && !res.splitParticle ? " " + particle.w : "") + (prepVerb ? " " + prepVerb.w : "");
    if (res.splitParticle) res.verb += " … " + particle.w;
    res.verbLemma = main ? main.lemma + (res.particle ? " " + res.particle : "") : null;

    /* subject */
    var s1 = v0 - 1;
    while (s1 >= start && (toks[s1].tag === "ADV" || toks[s1].tag === "NEG" || toks[s1].tag === "PUNCT")) s1--;
    var s0 = s1;
    if (s0 >= start && (toks[s0].tag === "PRON" || toks[s0].tag === "PRONO")) s0--;
    else {
      while (s0 >= start && /^(DET|ADJ|NOUN|NUM|THERE|POSS|PROPER)$/.test(toks[s0].tag)) s0--;
      if (s0 >= start && toks[s0].tag === "PREP" && toks[s0].l === "of" && s0 - 1 >= start && /^(NOUN|PROPER)$/.test(toks[s0-1].tag)){
        s0--; while (s0 >= start && /^(DET|ADJ|NOUN|NUM|POSS|PROPER)$/.test(toks[s0].tag)) s0--;
      }
    }
    s0++;
    if (s0 > start){
      var opener = toks.slice(start, s0).filter(function(t){ return !t.punct; });
      if (opener.length) res.opener = text(opener);
    }
    var subjToks = s1 >= s0 ? toks.slice(s0, s1 + 1) : [];
    if (inverted){ subjToks = inverted.subj; res.opener = null; }
    if (res.subjectClause){ subjToks = []; res.opener = null; }
    if (subjToks.length && subjToks[0].tag === "THERE"){ res.existential = true; subjToks = subjToks.slice(1); }
    if (res.subjectClause) res.subject = res.subjectClause;
    else if (subjToks.length) res.subject = text(subjToks);
    else if (cl.kind === "rel" && rel){ res.subject = rel.w; res.relHead = cl.label; }
    else if (cl.kind === "wh" && toks[start-1] && toks[start-1].tag === "WH" && v0 === start){ res.subject = toks[start-1].w; }
    else if (main && firstMain && firstMain.tag === "VERB" && (firstMain.form === "base") && v0 === start && cl.kind === "main" && !cl.conj && !prevClause){ res.subject = "(you)"; res.imperative = true; }
    else if (main && firstMain && firstMain.tag === "VERB" && firstMain.form === "base" && v0 === start && cl.kind === "main" && (!prevClause || prevClause.imperative)){ res.subject = "(you)"; res.imperative = true; }
    else if (prevClause && prevClause.subject && v0 === start){
      res.subject = prevClause.subject; res.inherited = true;
      if (toks[v0].tag === "VERB" && toks[v0].forms.ing && !toks[v0].forms.base && !cl.conj) res.participial = true;
    }

    /* what follows the verb */
    var p = after + (particle && !res.splitParticle ? 1 : 0) + (prepVerb ? 1 : 0);
    var pieces = [];
    while (p < n){
      var t = toks[p];
      if (t.tag === "PUNCT"){ p++; continue; }
      if (t.tag === "ADV" || t.tag === "NEG"){ pieces.push({ kind: "adv", toks: [t] }); p++; continue; }
      if (t.tag === "PART"){ if (particle === t){ p++; continue; } pieces.push({ kind: "adv", toks: [t] }); p++; continue; }
      if (t.tag === "PREP" && !(prepVerb === t)){
        var e = readNP(toks, p + 1);
        if (e === p + 1 && toks[p+1] && toks[p+1].tag === "VERB" && toks[p+1].forms.ing){ e = p + 2; var e1 = readNP(toks, e); if (e1 > e) e = e1; }
        if (e === p + 1){ pieces.push({ kind: "adv", toks: [t] }); p++; continue; }
        pieces.push({ kind: "pp", prep: t.l, toks: toks.slice(p, e) }); p = e; continue;
      }
      if (t.tag === "TO" && toks[p+1] && toks[p+1].tag === "VERB"){
        var e2 = p + 2; while (e2 < n && !toks[e2].punct && toks[e2].tag !== "CC" && toks[e2].tag !== "SC") e2++;
        pieces.push({ kind: "inf", toks: toks.slice(p, e2) }); p = e2; continue;
      }
      if (t.tag === "ADJ"){
        var e3 = p + 1; while (e3 < n && (toks[e3].tag === "ADJ" || (toks[e3].tag === "CC" && toks[e3+1] && toks[e3+1].tag === "ADJ") || (toks[e3].tag === "ADV" && toks[e3+1] && toks[e3+1].tag === "ADJ"))) e3++;
        var npEnd = readNP(toks, p);
        if (npEnd > e3){ pieces.push({ kind: "np", toks: toks.slice(p, npEnd) }); p = npEnd; continue; }
        pieces.push({ kind: "adj", toks: toks.slice(p, e3) }); p = e3; continue;
      }
      var e4 = readNP(toks, p);
      if (e4 > p){ pieces.push({ kind: "np", toks: toks.slice(p, e4) }); p = e4; continue; }
      if (t.tag === "VERB" && t.forms.ing){
        var e5 = p + 1; while (e5 < n && !toks[e5].punct && toks[e5].tag !== "CC") e5++;
        pieces.push({ kind: "vp", toks: toks.slice(p, e5) }); p = e5; continue;
      }
      var e6 = p + 1; while (e6 < n && !toks[e6].punct) e6++;
      pieces.push({ kind: "rest", toks: toks.slice(p, e6) }); p = e6;
    }
    var copula = main && COPULA[main.lemma] && !particle && !prepVerb && main === firstMain;
    pieces.forEach(function(x){
      if (x.kind !== "np" || copula) return;
      var last = x.toks[x.toks.length-1];
      if (TIME_NOUN[last.lemma || last.l] && (x.toks.length === 1 || /^(every|each|last|next|this|that|one|all|the|some|many|a|an|few|several|two|three|four|five|ten|twenty)$/.test(x.toks[0].l) || x.toks[0].tag === "NUM")){ x.kind = "when"; }
    });
    var nps = pieces.filter(function(x){ return x.kind === "np"; });
    if (copula){
      var comp = pieces.filter(function(x){ return x.kind === "np" || x.kind === "adj"; })[0];
      if (comp){ res.complement = text(comp.toks); comp.used = true; }
      if (res.existential && nps[0]){ res.subject = text(nps[0].toks); res.complement = null; nps[0].used = true; }
    } else if (nps.length){
      if (nps.length >= 2 && main && DITRANS[main.lemma] && !res.particle){ res.indirect = text(nps[0].toks); res.object = text(nps[1].toks); nps[0].used = nps[1].used = true; }
      else { res.object = text(nps[0].toks); nps[0].used = true; }
    }
    if (!res.object && !res.complement && pieces.length && pieces[0].kind === "inf"){ res.object = text(pieces[0].toks); pieces[0].used = true; }
    /* passive */
    var mi = group.indexOf(main);
    var beBefore = group.some(function(t, i){ return BE[t.l] && i < mi; });
    var passive = !!(beBefore && main && main.tag === "VERB" && main.forms.pp && main.lemma !== "be");
    if (passive && main.forms.ing) passive = false;
    if (passive && posOf(dict(main.l)).adjective && !isVerbBase(main.lemma, dict)) passive = false;
    res.passive = passive;
    res.pos = { subj: subjToks.length ? [subjToks[0].i, subjToks[subjToks.length-1].i] : null, verb: [group[0].i, group[group.length-1].i], main: main ? main.i : -1, agent: null };
    pieces.forEach(function(x){
      if (x.used) return;
      if (x.kind === "pp"){
        if (passive && x.prep === "by"){ res.agent = text(x.toks.slice(1)); res.pos.agent = [x.toks[0].i, x.toks[x.toks.length-1].i]; return; }
        res.extras.push({ label: ppLabel(x, dict), text: text(x.toks) });
      } else if (x.kind === "adv"){
        var a = x.toks[0];
        if (a.tag === "NEG") return;
        res.extras.push({ label: TIME_ADV[a.l] ? "when" : (/ly$/.test(a.l) ? "how" : (/^(here|there|home|away|back|upstairs|downstairs|outside|inside|abroad|everywhere|somewhere|nowhere|anywhere)$/.test(a.l) ? "where" : "detail")), text: a.w });
      } else if (x.kind === "inf"){ res.extras.push({ label: "in order to / what", text: text(x.toks) }); }
      else if (x.kind === "vp"){ res.extras.push({ label: "doing", text: text(x.toks) }); }
      else if (x.kind === "adj"){ res.extras.push({ label: "how / what", text: text(x.toks) }); }
      else if (x.kind === "np"){ res.extras.push({ label: "also", text: text(x.toks) }); }
      else if (x.kind === "when"){ res.extras.push({ label: "when", text: text(x.toks) }); }
      else res.extras.push({ label: "also", text: text(x.toks) });
    });
    if (res.opener && !inverted) res.extras.unshift({ label: /^(in|on|at|after|before|during|by|until|since|from|through|over|under|behind|beyond|near|across|along|inside|outside|within|throughout|for|with|without|despite|toward|towards|into|onto|between|among|around|beside|below|above|beneath|of)\b/i.test(res.opener) ? "setting" : "opener", text: res.opener });
    res.tense = tense(group, main, firstMain, res, toks);
    return res;
  }
  function inverted0(toks, v0, start){ return toks[v0].tag !== "VERB" && v0 === start; }
  function scanGroup(toks, v0){
    var n = toks.length, v1 = v0, seenMain = toks[v0].tag === "VERB", mainIdx = toks[v0].tag === "VERB" ? v0 : -1;
    for (var j = v0 + 1; j < n; j++){
      var tj = toks[j].tag;
      if (tj === "ADV" || tj === "NEG") continue;
      if (tj === "AUX" || tj === "MODAL"){ if (seenMain && !(toks[j-1].tag === "TO")) break; v1 = j; if (tj === "AUX" && j > v0) mainIdx = -1; continue; }
      if (tj === "TO" && toks[j+1] && toks[j+1].tag === "VERB" && seenMain && mainIdx >= 0 && (CATEN[toks[mainIdx].lemma] || /^(seem|appear|want|need|try|begin|start|continue|hope|expect|decide|manage|fail|use|go|have|ought|tend|happen|wish|love|like|hate|learn|forget|remember|intend|plan|agree|refuse|promise|offer)$/.test(toks[mainIdx].lemma))){ v1 = j; continue; }
      if (tj === "VERB"){
        if (seenMain){
          var prevT = toks[j-1];
          if (prevT.tag === "TO" && v1 === j - 1){ v1 = j; mainIdx = j; continue; }
          if (toks[j].forms.ing && mainIdx >= 0 && CATEN[toks[mainIdx].lemma]){ v1 = j; mainIdx = j; continue; }
          break;
        }
        v1 = j; seenMain = true; mainIdx = j; continue;
      }
      break;
    }
    return { v1: v1, mainIdx: mainIdx };
  }
  function ppLabel(x, dict){
    var prep = x.prep, obj = x.toks.slice(1), head = null;
    for (var i = obj.length - 1; i >= 0; i--){ if (/^(NOUN|PRONO|PRON|PROPER)$/.test(obj[i].tag)){ head = obj[i]; break; } }
    var h = head ? (head.lemma || head.l) : "";
    var person = head && (PERSON[h] || head.tag === "PROPER");
    if (!person && head && head.tag === "NOUN"){
      var e = dict(h);
      if (e && e.m.some(function(m){ return /^(a|an|the|any) (person|man|woman|boy|girl|child|member|relative|friend|worker|official|female|male)\b|\b(one|someone|somebody|a person) who\b/i.test(m.d || ""); })) person = true;
    }
    if (TIME_NOUN[h] || /^\d{3,4}$/.test(h) || obj.some(function(t){ return TIME_NOUN[t.l]; })) return "when";
    if (prep === "to" || prep === "for") return person ? "to / for whom" : (prep === "for" ? "for what" : "where to");
    if (prep === "with") return person ? "with whom" : "with what";
    if (prep === "by") return person ? "by whom" : "how";
    if (prep === "about" || prep === "of" || prep === "concerning" || prep === "regarding") return "about what";
    if (prep === "like" || prep === "as") return "like what";
    if (prep === "without" || prep === "despite" || prep === "except") return "detail";
    if (/^(after|before|during|until|till|since|throughout)$/.test(prep)) return "when";
    if (LOCPREP[prep] || /^(above|below|beneath|beside|inside|outside|between|among|around|beyond|upon|off|out|within)$/.test(prep)) return "where";
    return "detail";
  }
  function tense(group, main, firstMain, res, toks){
    if (!main) return null;
    var lead = firstMain || main;
    var li = group.indexOf(lead);
    var modal = group.filter(function(t){ return t.tag === "MODAL"; })[0];
    var haveBefore = group.some(function(t, i){ return (HAVE[t.l]) && i < li && t !== lead; });
    var beBefore = group.some(function(t, i){ return BE[t.l] && i < li && t !== lead; });
    var doBefore = group.some(function(t, i){ return DO[t.l] && i < li && t !== lead; });
    var first = group[0].l;
    var ing = !!lead.forms.ing, pp = !!lead.forms.pp, past = !!lead.forms.past, base = !!lead.forms.base, s3 = !!lead.forms["3sg"];
    var name, note;
    var pv = res.passive ? ", passive voice" : "";
    if (res.imperative){ name = "imperative"; note = "an instruction, request or wish"; }
    else if (first === "having" && pp){ name = "perfect participle (having + -ed)"; note = "done before the main action of the sentence"; }
    else if (modal){
      var m = modal.l;
      var perf = haveBefore && pp, cont = beBefore && ing;
      if (m === "will" || m === "shall"){
        name = perf ? "future perfect" : cont ? "future continuous" : "future";
        note = perf ? "will already be finished by a later point" : cont ? "will be going on at a future moment" : "something that is going to happen";
      } else {
        var mean = { would: "imagined, polite, or a repeated past action", could: "ability or possibility", should: "advice, duty or expectation", might: "a possibility", may: "possibility or permission", must: "necessity or a firm conclusion", can: "ability or permission", ought: "duty or expectation" };
        name = "modal “" + m + "”" + (perf ? " + perfect" : cont ? " + continuous" : "");
        note = (mean[m] || "a modal shade of meaning") + (perf ? " — looking back at something that did not, or may not, happen" : "");
      }
    } else if (haveBefore && beBefore && ing){
      var pastP = /^(had)$/.test(first);
      name = pastP ? "past perfect continuous" : "present perfect continuous";
      note = pastP ? "had been going on for a while before another past moment" : "started in the past and is still going on";
    } else if (haveBefore && pp){
      var pastQ = first === "had";
      name = pastQ ? "past perfect" : "present perfect";
      note = pastQ ? "finished before another moment in the past" : "happened before now and still matters now";
    } else if (beBefore && ing){
      var pastR = /^(was|were)$/.test(first);
      name = pastR ? "past continuous" : "present continuous";
      note = pastR ? "was in progress at that past moment" : "is happening now or around now";
    } else if (beBefore && pp && res.passive){
      var pastS = /^(was|were)$/.test(first);
      name = pastS ? "past simple" : "present simple";
      note = pastS ? "a finished past event" : "a general fact or regular event";
    } else if (doBefore){
      name = first === "did" ? "past simple" : "present simple";
      note = first === "did" ? "a finished past event" : "a general fact, habit or present state";
    } else if (lead.lemma === "be" && lead.tag === "AUX" && lead === main){
      name = /^(was|were)$/.test(lead.l) ? "past simple" : "present simple";
      note = /^(was|were)$/.test(lead.l) ? "a state in the past" : "a state now";
    } else if (lead.lemma === "have" && lead.tag === "AUX" && lead === main){
      name = lead.l === "had" ? "past simple" : "present simple";
      note = lead.l === "had" ? "possession in the past" : "possession now";
    } else if (past && !(pp && !past)){ name = "past simple"; note = "a finished past event"; }
    else if (ing){ name = "participle (-ing)"; note = "an action going on alongside the main one"; }
    else if (pp && !past){ name = "participle (-ed)"; note = "describes the subject as affected by this action"; }
    else { name = "present simple"; note = s3 ? "a general fact, habit or present state" : "a general fact, habit or present state"; }
    var gi = toks.indexOf(lead);
    if (lead.lemma === "use" && lead.forms.past && toks[gi+1] && toks[gi+1].l === "to"){ name = "past habit (“used to”)"; note = "happened regularly in the past, but not any more"; }
    if (lead.lemma === "go" && lead.forms.ing && beBefore && toks[gi+1] && toks[gi+1].l === "to" && toks[gi+2] && toks[gi+2].tag === "VERB"){ name = "future (“going to”)"; note = "a plan, or something about to happen"; }
    return { name: name + pv, note: note, form: text(group) };
  }

  /* ---------- multi-word expressions ---------- */
  function findExpressions(toks, dict, rank){
    var found = [], used = {};
    var words = toks.filter(function(t){ return !t.punct; });
    for (var n = 5; n >= 2; n--){
      for (var i = 0; i + n <= words.length; i++){
        var span = words.slice(i, i + n);
        if (span.some(function(t){ return used[t.i]; })) continue;
        if (span.some(function(t){ return t.tag === "PUNCT" || t.tag === "TO"; })) continue;
        var lits = [];
        function tryKey(k){ if (lits.indexOf(k) < 0) lits.push(k); }
        tryKey(span.map(function(t){ return t.l; }).join(" "));
        if (span[0].lemma && span[0].lemma !== span[0].l) tryKey([span[0].lemma].concat(span.slice(1).map(function(t){ return t.l; })).join(" "));
        tryKey(span.map(function(t){ return t.lemma || t.l; }).join(" "));
        var hit = null, key = null;
        for (var k = 0; k < lits.length; k++){ var e = dict(lits[k]); if (e){ hit = e; key = lits[k]; break; } }
        if (!hit) continue;
        var kind = expressionKind(key, hit, span, rank);
        if (!kind) continue;
        span.forEach(function(t){ used[t.i] = true; });
        found.push({ phrase: key, text: text(span), kind: kind, entry: hit, start: span[0].i, end: span[span.length-1].i });
      }
    }
    /* split phrasal verbs: verb + object + particle */
    for (var j = 0; j < words.length; j++){
      var v = words[j];
      if (v.tag !== "VERB" || used[v.i]) continue;
      var e0 = readNP(toks, v.i + 1);
      if (e0 <= v.i + 1) continue;
      var pt = toks[e0];
      if (pt && pt.tag === "PART" && !used[pt.i] && !(toks[e0+1] && nounish(toks[e0+1]) && toks[e0+1].tag !== "PRON")){
        var e2 = dict(v.lemma + " " + pt.l);
        if (e2 && e2.m[0].p === "verb"){
          used[v.i] = used[pt.i] = true;
          found.push({ phrase: v.lemma + " " + pt.l, text: v.w + " … " + pt.w, kind: "phrasal verb", entry: e2, start: v.i, end: pt.i, split: true });
        }
      }
    }
    found.sort(function(a, b){ return a.start - b.start; });
    return found;
  }
  function ADJ_LIKE(x){ return /(y|ly|ful|ous|ive|al|ic|less|ish|ent|ant|ed|ing|er|est)$/.test(x) && !DET[x] && !PREP[x]; }
  function expressionKind(key, entry, span, rank){
    var p = entry.m[0].p, w = key.split(" "), last = w[w.length-1];
    var firstVerb = span[0].tag === "VERB";
    if (p === "verb"){
      if (!firstVerb) return null;
      if (w.length === 2 && (PART[last] || PREP[last])){
        /* a motion verb followed by a place is usually just verb + preposition / direction */
        if (MOTION[w[0]] && LOCPREP[last] && span[1].tag === "PREP") return null;
        if (MOTION[w[0]] && span[1].tag === "PART" && span[1].next && span[1].next.tag === "PREP") return null;
        return "phrasal verb";
      }
      if (w.length >= 3 && (PART[last] || PREP[last]) && !w.some(function(x){ return DET[x]; })) return "phrasal verb";
      return "idiom";
    }
    if (p === "phrase") return "idiom";
    if (p === "adverb" || p === "adjective"){
      if (span.some(function(t){ return t.tag === "VERB"; })) return null;
      /* a plain "preposition + the + everyday noun" is more often literal ("on the table") */
      if (w.length <= 3 && PREP[w[0]] && !w.some(function(x){ return ADJ_LIKE(x); }) && rank(last) <= 3000 && span[span.length-1].tag === "NOUN") return "possible idiom";
      return "expression";
    }
    if (p === "noun"){
      if (span.some(function(t){ return t.tag === "VERB" || t.tag === "AUX"; })) return null;
      if (w.some(function(x){ return PREP[x] || DET[x]; })) return "idiom";
      if (span.every(function(t){ return t.tag === "NOUN" || t.tag === "ADJ" || t.tag === "PROPER"; })){
        /* only flag compounds that contain a less common word */
        if (w.every(function(x){ return rank(x) <= 3000; })) return null;
        return "compound term";
      }
      return null;
    }
    return null;
  }

  /* ---------- plain rewrite ---------- */
  function cleanDef(d, pos){
    d = (d || "").replace(/^\(([^)]*)\)\s*/g, "").replace(/\s*\([^)]*\)/g, "").replace(/[;:].*$/, "").replace(/,.*$/, "").replace(/\s+/g, " ").trim();
    d = d.replace(/\.$/, "").replace(/^(the act of|the state of being|the quality of being|the state of|the quality of)\s+/i, "");
    if (pos === "verb" || !pos) d = d.replace(/^to\s+/i, "");
    return d;
  }
  /* a definition that reads like another part of speech is not this word's meaning: a noun
     explained as "having important effects" is the adjective's sense wearing the noun's label */
  var SHAPE = {
    noun: /^(having|being|relating|pertaining|characterized|consisting|marked by|lacking|full of|able to|capable of|not )/i,
    verb: /^(a |an |the |someone |something |one who )/i,
    adjective: /^(a |an |the |someone who|something that|one who)/i,
    adverb: /^(a |an |the )/i
  };
  function bestSense(entry, pos, rank){
    if (!entry) return null;
    var senses = entry.m.filter(function(m){ return !pos || !m.p || m.p === pos; });
    if (!senses.length) senses = entry.m;
    var scored = senses.map(function(m, i){
      var d = cleanDef(m.d, m.p || pos), words = d.split(" ");
      var hard = words.filter(function(x){ return rank(x.toLowerCase().replace(/[^a-z]/g, "")) > 5000; }).length;
      var odd = pos && SHAPE[pos] && SHAPE[pos].test(d) ? 9 : 0;
      /* the entry lists its senses roughly by how common they are, so a later one has to be
         clearly plainer to win; the weight is small because the order is only roughly right */
      return { m: m, d: d, score: words.length + hard * 3 + (m.p && pos && m.p !== pos ? 8 : 0) + i * 1.2 + odd };
    }).sort(function(a, b){ return a.score - b.score; });
    return scored[0];
  }
  /* the curated meaning, if word parts are loaded; only its first clause, so the gloss stays short */
  function CURATED(word){
    var B = typeof window !== "undefined" && window.llMorph && window.llMorph.BASES;
    var d = B && Object.prototype.hasOwnProperty.call(B, word) ? B[word] : null;
    return d ? String(d).split(";")[0].trim() : null;
  }
  function inflectPhrase(phrase, form){
    var ws = phrase.split(" ");
    var v = ws[0].toLowerCase();
    if (/^[a-z]+$/.test(v)) ws[0] = inflect(v, form);
    return ws.join(" ");
  }
  var GENERIC = set("get make take go have do be put set give come see keep let run turn hold bring pass work play call use move live look need want think know say tell find leave feel show mean become begin start stop try ask seem help change stand");
  function plainWord(t, dict, rank){
    if (!/^(NOUN|VERB|ADJ|ADV)$/.test(t.tag)) return null;
    if (t.poss) return null;
    var w = t.l, lem = t.lemma || w;
    if (rank(w) <= 7000 || rank(lem) <= 7000 || w.length < 4) return null;
    var entry = dict(lem) || dict(w);
    if (!entry) return null;
    var pos = { NOUN: "noun", VERB: "verb", ADJ: "adjective", ADV: "adverb" }[t.tag];
    var senses = entry.m.filter(function(m){ return !m.p || m.p === pos; });
    if (!senses.length) return null;
    var cur = Math.min(rank(w), rank(lem));
    /* a one-word synonym that is clearly more common */
    var bestSyn = null, bestRank = cur;
    senses.forEach(function(m){
      (m.s || []).forEach(function(s){
        if (s.indexOf(" ") >= 0 || s === lem || GENERIC[s]) return;
        if (t.tag === "ADV" && /ly$/.test(w) && !/ly$/.test(s)) return;
        var r = rank(s);
        if (r < bestRank && r <= 4000){ bestRank = r; bestSyn = s; }
      });
    });
    if (bestSyn){
      if (t.tag === "VERB" && t.form && t.form !== "base") bestSyn = inflect(bestSyn, t.form);
      if (t.tag === "NOUN" && t.plural) bestSyn = plural(bestSyn);
      if (t.tag === "ADJ" && t.degree) bestSyn = t.degree === "er" ? "more " + bestSyn : "most " + bestSyn;
      return bestSyn;
    }
    var best = bestSense({ m: senses }, pos, rank);
    if (!best || !best.d) return null;
    var d = best.d, dw = d.replace(/^(a|an|the|any|some|one)\s+/i, "").split(" ");
    if (dw.length > 4) return null;
    if (t.tag === "VERB" && t.form && t.form !== "base") d = inflectPhrase(d, t.form);
    if (t.tag === "NOUN" && t.plural){
      if (/^(a|an|the|any|some|one)\s/i.test(d)) return null;
      if (dw.length === 1) d = plural(d);
    }
    return d;
  }
  /* the plain wording of an idiom / phrasal verb (t = its first token): a short synonym of the
     best sense when there is one, otherwise that sense's definition */
  function exprText(e, t, toks, dict, rank){
    var sense = bestSense(e.entry, e.entry.m[0].p, rank);
    var rep = sense ? sense.d : e.text;
    /* prefer a plain one-word synonym of that sense */
    var syn = null; ((sense && sense.m.s) || []).forEach(function(s){ if (s.indexOf(" ") < 0 && rank(s) <= 3000 && !GENERIC[s] && !syn) syn = s; });
    if (syn && (!sense || sense.d.split(" ").length > 2)) rep = syn;
    if (e.entry.m[0].p === "verb" && t.tag === "VERB" && t.form && t.form !== "base") rep = inflectPhrase(rep, t.form);
    var endTok = toks.filter(function(x){ return x.i === e.end; })[0];
    var nextTok = toks[toks.indexOf(endTok) + 1];
    /* avoid "…insisting on on the clock" */
    if (nextTok && !nextTok.punct && new RegExp("\\s" + nextTok.l + "$").test(rep)) rep = rep.replace(new RegExp("\\s" + nextTok.l + "$"), "");
    return { text: rep, synonym: !!syn && rep === syn };
  }
  function plainRewrite(toks, exprs, dict, rank){
    var out = [], i = 0, exprAt = {};
    exprs.forEach(function(e){ if (!e.split && e.kind !== "compound term" && e.kind !== "possible idiom") exprAt[e.start] = e; });
    while (i < toks.length){
      var t = toks[i], e = exprAt[t.i];
      if (e){
        var rep = exprText(e, t, toks, dict, rank).text;
        out.push({ w: rep, cap: isCap(t.w) && i === 0 });
        while (i < toks.length && toks[i].i <= e.end) i++;
        continue;
      }
      if (t.punct){ out.push({ w: t.w, punct: true }); i++; continue; }
      var rep2 = plainWord(t, dict, rank);
      if (rep2 !== null) out.push({ w: rep2, cap: isCap(t.w) && i === 0 });
      else out.push({ w: t.glued ? t.l : t.w, cap: false, poss: !!t.poss });
      i++;
    }
    /* "a" + "any member of…" → "any member of…"; "his" + "a male grandchild" → "his male grandchild" */
    for (var q = 1; q < out.length; q++){
      var prevW = out[q-1].w.toLowerCase(), curW = out[q].w;
      if (out[q].punct || out[q-1].punct) continue;
      if (/^(a|an|the|any|some|one)\s/i.test(curW) && (DET[prevW] || out[q-1].poss)){
        if (/^(a|an|the)$/.test(prevW) && /^(any|some|one|the)\s/i.test(curW)){ out.splice(q-1, 1); q--; continue; }
        out[q].w = curW.replace(/^(a|an|the|any|some|one)\s+/i, "");
      }
    }
    var s = "", openQ = false;
    out.forEach(function(x, k){
      var closing = x.punct && (/^[,.;:!?)\]”’]$/.test(x.w) || (x.w === '"' && openQ));
      var prevOpen = k && out[k-1].punct && (/^[(\[“‘]$/.test(out[k-1].w) || (out[k-1].w === '"' && openQ));
      if (k && !closing && !prevOpen) s += " ";
      s += x.cap ? cap(x.w) : x.w;
      if (x.w === '"') openQ = !openQ;
    });
    return cap(s.replace(/\bi\b/g, "I").trim());
  }


  /* the 10 000 most common English words (Google web corpus, via first20hours/google-10000-english,
     swear words removed) — used to judge which words need glossing or replacing */
  var EASY_WORDS = "the of and to a in for is on that by this with i you it not or be are from at as your all have new more an was we will home can us about if page my has search free but our one other do no information time they site he up may what which their news out use any there see only so his when contact here business who web also now help get pm view online c e first am been would how were me s services some these click its like service x than find price date back top people had list name just over state year day into email two health n world re next used go b work last most products music buy data make them should product system post her city t add policy number such please available copyright support message after best software then jan good video well d where info rights public books high school through m each links she review years order very privacy book items company r read group need many user said de does set under general research university january mail full map reviews program life know games way days management p part could great united hotel real f item international center ebay must store travel comments made development report off member details line terms before hotels did send right type because local those using results office education national car design take posted internet address community within states area want phone dvd shipping reserved subject between forum family l long based w code show o even black check special prices website index being women much sign file link open today technology south case project same pages uk version section own found sports house related security both g county american photo game members power while care network down computer systems three total place end following download h him without per access think north resources current posts big media law control water history pictures size art personal since including guide shop directory board location change white text small rating rate government children during usa return students v shopping account times sites level digital profile previous form events love old john main call hours image department title description non k y insurance another why shall property class cd still money quality every listing content country private little visit save tools low reply customer december compare movies include college value article york man card jobs provide j food source author different press u learn sale around print course job canada process room stock training too credit point join science men categories advanced west sales look english left team estate box conditions select windows photos thread week category note live large gallery table register however june october november market library really action start series model features air industry plan human provided tv yes required second hot accessories cost movie forums march la september better say questions july yahoo going medical test friend come dec server pc study application cart staff articles san feedback again play looking issues april never users complete street topic comment financial things working against standard tax person below mobile less got blog party payment equipment login student let programs offers legal above recent park stores side act problem red give memory performance social q august quote language story sell options experience rates create key body young america important field few east paper single ii age activities club example girls additional password z latest something road gift question changes night ca hard texas oct pay four poker status browse issue range building seller court february always result audio light write war nov offer blue groups al easy given files event release analysis request fax china making picture needs possible might professional yet month major star areas future space committee hand sun cards problems london washington meeting rss become interest id child keep enter california share similar garden schools million added reference companies listed baby learning energy run delivery net popular term film stories put computers journal reports co try welcome central images president notice original head radio until cell color self council away includes track australia discussion archive once others entertainment agreement format least society months log safety friends sure faq trade edition cars messages marketing tell further updated association able having provides david fun already green studies close common drive specific several gold feb living sep collection called short arts lot ask display limited powered solutions means director daily beach past natural whether due et electronics five upon period planning database says official weather mar land average done technical window france pro region island record direct microsoft conference environment records st district calendar costs style url front statement update parts aug ever downloads early miles sound resource present applications either ago document word works material bill apr written talk federal hosting rules final tickets thing centre requirements via cheap kids finance true minutes else mark third rock gifts europe reading topics bad individual tips plus auto cover usually edit together videos percent fast function fact unit getting global tech meet far economic en player projects lyrics often subscribe submit germany amount watch included feel though bank risk thanks everything deals various words linux jul production commercial james weight town heart advertising received choose treatment newsletter archives points knowledge magazine error camera jun girl currently construction toys registered clear golf receive domain methods chapter makes protection policies loan wide beauty manager india position taken sort listings models michael known half cases step engineering florida simple quick none wireless license paul friday lake whole annual published later basic sony shows corporate google church method purchase customers active response practice hardware figure materials fire holiday chat enough designed along among death writing speed html countries loss face brand discount higher effects created remember standards oil bit yellow political increase advertise kingdom base near environmental thought stuff french storage oh japan doing loans shoes entry stay nature orders availability africa summary turn mean growth notes agency king monday european activity copy although drug pics western income force cash employment overall bay river commission ad package contents seen players engine port album regional stop supplies started administration bar institute views plans double dog build screen exchange types soon sponsored lines electronic continue across benefits needed season apply someone held ny anything printer condition effective believe organization effect asked eur mind sunday selection casino pdf lost tour menu volume cross anyone mortgage hope silver corporation wish inside solution mature role rather weeks addition came supply nothing certain usr executive running lower necessary union jewelry according dc clothing mon com particular fine names robert homepage hour gas skills six bush islands advice career military rental decision leave british pre huge sat woman facilities zip bid kind sellers middle move cable opportunities taking values division coming tuesday object appropriate machine logo length actually nice score statistics client ok returns capital follow sample investment sent shown saturday christmas england culture band flash ms lead george choice went starting registration fri thursday courses consumer hi airport foreign artist outside furniture levels channel letter mode phones ideas wednesday structure fund summer allow degree contract button releases wed homes super male matter custom virginia almost took located multiple asian distribution editor inn industrial cause potential song cnet ltd los hp focus late fall featured idea rooms female responsible inc communications win associated thomas primary cancer numbers reason tool browser spring foundation answer voice eg friendly schedule documents communication purpose feature bed comes police everyone independent ip approach cameras brown physical operating hill maps medicine deal hold ratings chicago forms glass happy tue smith wanted developed thank safe unique survey prior telephone sport ready feed animal sources mexico population pa regular secure navigation operations therefore simply evidence station christian round paypal favorite understand option master valley recently probably thu rentals sea built publications blood cut worldwide improve connection publisher hall larger anti networks earth parents nokia impact transfer introduction kitchen strong tel carolina wedding properties hospital ground overview ship accommodation owners disease tx excellent paid italy perfect hair opportunity kit classic basis command cities william express award distance tree peter assessment ensure thus wall ie involved el extra especially interface partners budget rated guides success maximum ma operation existing quite selected boy amazon patients restaurants beautiful warning wine locations horse vote forward flowers stars significant lists technologies owner retail animals useful directly manufacturer ways est son providing rule mac housing takes iii gmt bring catalog searches max trying mother authority considered told xml traffic programme joined input strategy feet agent valid bin modern senior ireland teaching door grand testing trial charge units instead canadian cool normal wrote enterprise ships entire educational md leading metal positive fl fitness chinese opinion mb asia football abstract uses output funds mr greater likely develop employees artists alternative processing responsibility resolution java guest seems publication pass relations trust van contains session multi photography republic fees components vacation century academic assistance completed skin graphics indian prev ads mary il expected ring grade dating pacific mountain organizations pop filter mailing vehicle longer consider int northern behind panel floor german buying match proposed default require iraq boys outdoor deep morning otherwise allows rest protein plant reported hit transportation mm pool mini politics partner disclaimer authors boards faculty parties fish membership mission eye string sense modified pack released stage internal goods recommended born unless richard detailed japanese race approved background target except character usb maintenance ability maybe functions ed moving brands places php pretty trademarks phentermine spain southern yourself etc winter battery youth pressure submitted boston debt keywords medium television interested core break purposes throughout sets dance wood msn itself defined papers playing awards fee studio reader virtual device established answers rent las remote dark programming external apple le regarding instructions min offered theory enjoy remove aid surface minimum visual host variety teachers isbn martin manual block subjects agents increased repair fair civil steel understanding songs fixed wrong beginning hands associates finally az updates desktop classes paris ohio gets sector capacity requires jersey un fat fully father electric saw instruments quotes officer driver businesses dead respect unknown specified restaurant mike trip pst worth mi procedures poor teacher eyes relationship workers farm georgia peace traditional campus tom showing creative coast benefit progress funding devices lord grant sub agree fiction hear sometimes watches careers beyond goes families led museum themselves fan transport interesting blogs wife evaluation accepted former implementation ten hits zone complex th cat galleries references die presented jack flat flow agencies literature respective parent spanish michigan columbia setting dr scale stand economy highest helpful monthly critical frame musical definition secretary angeles networking path australian employee chief gives kb bottom magazines packages detail francisco laws changed pet heard begin individuals colorado royal clean switch russian largest african guy titles relevant guidelines justice connect bible dev cup basket applied weekly vol installation described demand pp suite vegas na square chris attention advance skip diet army auction gear lee os difference allowed correct charles nation selling lots piece sheet firm seven older illinois regulations elements species jump cells module resort facility random pricing dvds certificate minister motion looks fashion directions visitors documentation monitor trading forest calls whose coverage couple giving chance vision ball ending clients actions listen discuss accept automotive goal successful sold wind communities clinical situation sciences markets lowest highly publishing appear emergency developing lives currency leather determine temperature palm announcements patient actual historical stone bob commerce ringtones perhaps persons difficult scientific satellite fit tests village accounts amateur ex met pain xbox particularly factors coffee www settings buyer cultural steve easily oral ford poster edge functional root au fi closed holidays ice pink zealand balance monitoring graduate replies shot nc architecture initial label thinking scott llc sec recommend canon league waste minute bus provider optional dictionary cold accounting manufacturing sections chair fishing effort phase fields bag fantasy po letters motor va professor context install shirt apparel generally continued foot mass crime count breast techniques ibm rd johnson sc quickly dollars websites religion claim driving permission surgery patch heat wild measures generation kansas miss chemical doctor task reduce brought himself nor component enable exercise bug santa mid guarantee leader diamond israel se processes soft servers alone meetings seconds jones arizona keyword interests flight congress fuel username walk produced italian paperback classifieds wait supported pocket saint rose freedom argument competition creating jim drugs joint premium providers fresh characters attorney upgrade di factor growing thousands km stream apartments pick hearing eastern auctions therapy entries dates generated signed upper administrative serious prime samsung limit began louis steps errors shops del efforts informed ga ac thoughts creek ft worked quantity urban practices sorted reporting essential myself tours platform load affiliate labor immediately admin nursing defense machines designated tags heavy covered recovery joe guys integrated configuration merchant comprehensive expert universal protect drop solid cds presentation languages became orange compliance vehicles prevent theme rich im campaign marine improvement vs guitar finding pennsylvania examples ipod saying spirit ar claims challenge motorola acceptance strategies mo seem affairs touch intended towards sa goals hire election suggest branch charges serve affiliates reasons magic mount smart talking gave ones latin multimedia xp avoid certified manage corner rank computing oregon element birth virus abuse interactive requests separate quarter procedure leadership tables define racing religious facts breakfast kong column plants faith chain developer identify avenue missing died approximately domestic sitemap recommendations moved houston reach comparison mental viewed moment extended sequence inch attack sorry centers opening damage lab reserve recipes cvs gamma plastic produce snow placed truth counter failure follows eu weekend dollar camp ontario automatically des minnesota films bridge native fill williams movement printing baseball owned approval draft chart played contacts cc jesus readers clubs lcd wa jackson equal adventure matching offering shirts profit leaders posters institutions assistant variable ave dj advertisement expect parking headlines yesterday compared determined wholesale workshop russia gone codes kinds extension seattle statements golden completely teams fort cm wi lighting senate forces funny brother gene turned portable tried electrical applicable disc returned pattern ct boat named theatre laser earlier manufacturers sponsor classical icon warranty dedicated indiana direction harry basketball objects ends delete evening assembly nuclear taxes mouse signal criminal issued brain sexual wisconsin powerful dream obtained false da cast flower felt personnel passed supplied identified falls pic soul aids opinions promote stated stats hawaii professionals appears carry flag decided nj covers hr em advantage hello designs maintain tourism priority newsletters adults clips savings iv graphic atom payments rw estimated binding brief ended winning eight anonymous iron straight script served wants miscellaneous prepared void dining alert integration atlanta dakota tag interview mix framework disk installed queen vhs credits clearly fix handle sweet desk criteria pubmed dave massachusetts diego hong vice associate ne truck behavior enlarge ray frequently revenue measure changing votes du duty looked discussions bear gain festival laboratory ocean flights experts signs lack depth iowa whatever logged laptop vintage train exactly dry explore maryland spa concept nearly eligible checkout reality forgot handling origin knew gaming feeds billion destination scotland faster intelligence dallas bought con ups nations route followed specifications broken tripadvisor frank alaska zoom blow battle residential anime speak decisions industries protocol query clip partnership editorial nt expression es equity provisions speech wire principles suggestions rural shared sounds replacement tape strategic judge spam economics acid bytes cent forced compatible fight apartment height null zero speaker filed gb netherlands obtain bc consulting recreation offices designer remain managed pr failed marriage roll korea banks fr participants secret bath aa kelly leads negative austin favorites toronto theater springs missouri andrew var perform healthy translation estimates font assets injury mt joseph ministry drivers lawyer figures married protected proposal sharing philadelphia portal waiting birthday beta fail gratis banking officials brian toward won slightly assist conduct contained lingerie legislation calling parameters jazz serving bags profiles miami comics matters houses doc postal relationships tennessee wear controls breaking combined ultimate wales representative frequency introduced minor finish departments residents noted displayed mom reduced physics rare spent performed extreme samples davis daniel bars reviewed row oz forecast removed helps singles administrator cycle amounts contain accuracy dual rise usd sleep mg bird pharmacy brazil creation static scene hunter addresses lady crystal famous writer chairman violence fans oklahoma speakers drink academy dynamic gender eat permanent agriculture dell cleaning constitutes portfolio practical delivered collectibles infrastructure exclusive seat concerns vendor originally intel utilities philosophy regulation officers reduction aim bids referred supports nutrition recording regions junior toll les cape ann rings meaning tip secondary wonderful mine ladies henry ticket announced guess agreed prevention whom ski soccer math import posting presence instant mentioned automatic healthcare viewing maintained ch increasing majority connected christ dan dogs sd directors aspects austria ahead moon participation scheme utility preview fly manner matrix containing combination devel amendment despite strength guaranteed turkey libraries proper distributed degrees singapore enterprises delta fear seeking inches phoenix rs convention shares principal daughter standing comfort colors wars cisco ordering kept alpha appeal cruise bonus certification previously hey bookmark buildings specials beat disney household batteries adobe smoking bbc becomes drives arms alabama tea improved trees avg achieve positions dress subscription dealer contemporary sky utah nearby rom carried happen exposure panasonic hide permalink signature gambling refer miller provision outdoors clothes caused luxury babes frames certainly indeed newspaper toy circuit layer printed slow removal easier src liability trademark hip printers faqs nine adding kentucky mostly eric spot taylor trackback prints spend factory interior revised grow americans optical promotion relative amazing clock dot hiv identity suites conversion feeling hidden reasonable victoria serial relief revision broadband influence ratio pda importance rain onto dsl planet webmaster copies recipe zum permit seeing proof dna diff tennis bass prescription bedroom empty instance hole pets ride licensed orlando specifically tim bureau maine sql represent conservation pair ideal specs recorded don pieces finished parks dinner lawyers sydney stress cream ss runs trends yeah discover ap patterns boxes louisiana hills javascript fourth nm advisor mn marketplace nd evil aware wilson shape evolution irish certificates objectives stations suggested gps op remains acc greatest firms concerned euro operator structures generic encyclopedia usage cap ink charts continuing mixed census interracial peak tn competitive exist wheel transit suppliers salt compact poetry lights tracking angel bell keeping preparation attempt receiving matches accordance width noise engines forget array discussed accurate stephen elizabeth climate reservations pin playstation alcohol greek instruction managing annotation sister raw differences walking explain smaller newest establish gnu happened expressed jeff extent sharp lesbians ben lane paragraph kill mathematics aol compensation ce export managers aircraft modules sweden conflict conducted versions employer occur percentage knows mississippi describe concern backup requested citizens connecticut heritage personals immediate holding trouble spread coach kevin agricultural expand supporting audience assigned jordan collections ages participate plug specialist cook affect virgin experienced investigation raised hat institution directed dealers searching sporting helping perl affected lib bike totally plate expenses indicate blonde ab proceedings transmission anderson utc characteristics der lose organic seek experiences albums cheats extremely verzeichnis contracts guests hosted diseases concerning developers equivalent chemistry tony neighborhood nevada kits thailand variables agenda anyway continues tracks advisory cam curriculum logic template prince circle soil grants anywhere psychology responses atlantic wet circumstances edward investor identification ram leaving wildlife appliances matt elementary cooking speaking sponsors fox unlimited respond sizes plain exit entered iran arm keys launch wave checking costa belgium printable holy acts guidance mesh trail enforcement symbol crafts highway buddy hardcover observed dean setup poll booking glossary fiscal celebrity styles denver unix filled bond channels ericsson appendix notify blues chocolate pub portion scope hampshire supplier cables cotton bluetooth controlled requirement authorities biology dental killed border ancient debate representatives starts pregnancy causes arkansas biography leisure attractions learned transactions notebook explorer historic attached opened tm husband disabled authorized crazy upcoming britain concert retirement scores financing efficiency sp comedy adopted efficient weblog linear commitment specialty bears jean hop carrier edited constant visa mouth jewish meter linked portland interviews concepts nh gun reflect pure deliver wonder lessons fruit begins qualified reform lens alerts treated discovery draw mysql classified relating assume confidence alliance fm confirm warm neither lewis howard offline leaves engineer lifestyle consistent replace clearance connections inventory converter organisation babe checks reached becoming safari objective indicated sugar crew legs sam stick securities allen pdt relation enabled genre slide montana volunteer tested rear democratic enhance switzerland exact bound parameter adapter processor node formal dimensions contribute lock hockey storm micro colleges laptops mile showed challenges editors mens threads bowl supreme brothers recognition presents ref tank submission dolls estimate encourage navy kid regulatory inspection consumers cancel limits territory transaction manchester weapons paint delay pilot outlet contributions continuous db czech resulting cambridge initiative novel pan execution disability increases ultra winner idaho contractor ph episode examination potter dish plays bulletin ia pt indicates modify oxford adam truly epinions painting committed extensive affordable universe candidate databases patent slot psp outstanding ha eating perspective planned watching lodge messenger mirror tournament consideration ds discounts sterling sessions kernel stocks buyers journals gray catalogue ea jennifer antonio charged broad taiwan und chosen demo greece lg swiss sarah clark hate terminal publishers nights behalf caribbean liquid rice nebraska loop salary reservation foods gourmet guard properly orleans saving nfl remaining empire resume twenty newly raise prepare avatar gary depending illegal expansion vary hundreds rome arab lincoln helped premier tomorrow purchased milk decide consent drama visiting performing downtown keyboard contest collected nw bands boot suitable ff absolutely millions lunch audit push chamber guinea findings muscle featuring iso implement clicking scheduled polls typical tower yours sum misc calculator significantly chicken temporary attend shower alan sending jason tonight dear sufficient holdem shell province catholic oak vat awareness vancouver governor beer seemed contribution measurement swimming spyware formula constitution packaging solar jose catch jane pakistan ps reliable consultation northwest sir doubt earn finder unable periods classroom tasks democracy attacks kim wallpaper merchandise const resistance doors symptoms resorts biggest memorial visitor twin forth insert baltimore gateway ky dont alumni drawing candidates charlotte ordered biological fighting transition happens preferences spy romance instrument bruce split themes powers heaven br bits pregnant twice classification focused egypt physician hollywood bargain wikipedia cellular norway vermont asking blocks normally lo spiritual hunting diabetes suit ml shift chip res sit bodies photographs cutting wow simon writers marks flexible loved mapping numerous relatively birds satisfaction represents char indexed pittsburgh superior preferred saved paying cartoon shots intellectual moore granted choices carbon spending comfortable magnetic interaction listening effectively registry crisis outlook massive denmark employed bright treat header cs poverty formed piano echo que grid sheets patrick experimental puerto revolution consolidation displays plasma allowing earnings voip mystery landscape dependent mechanical journey delaware bidding consultants risks banner applicant charter fig barbara cooperation counties acquisition ports implemented sf directories recognized dreams blogger notification kg licensing stands teach occurred textbooks rapid pull hairy diversity cleveland ut reverse deposit seminar investments latina nasa wheels specify accessibility dutch sensitive templates formats tab depends boots holds router concrete si editing poland folder womens css completion upload pulse universities technique contractors voting courts notices subscriptions calculate mc detroit alexander broadcast converted metro toshiba anniversary improvements strip specification pearl accident nick accessible accessory resident plot qty possibly airline typically representation regard pump exists arrangements smooth conferences uniprotkb strike consumption birmingham flashing lp narrow afternoon threat surveys sitting putting consultant controller ownership committees legislative researchers vietnam trailer anne castle gardens missed malaysia unsubscribe antique labels willing bio molecular acting heads stored exam logos residence attorneys antiques density hundred ryan operators strange sustainable philippines statistical beds mention innovation pcs employers grey parallel honda amended operate bills bold bathroom stable opera definitions von doctors lesson cinema asset ag scan elections drinking reaction blank enhanced entitled severe generate stainless newspapers hospitals vi deluxe humor aged monitors exception lived duration bulk successfully indonesia pursuant sci fabric edt visits primarily tight domains capabilities pmid contrast recommendation flying recruitment sin berlin cute organized ba para siemens adoption improving cr expensive meant capture pounds buffalo organisations plane pg explained seed programmes desire expertise mechanism camping ee jewellery meets welfare peer caught eventually marked driven measured medline bottle agreements considering innovative marshall massage rubber conclusion closing tampa thousand meat legend grace susan ing ks adams python monster alex bang villa bone columns disorders bugs collaboration hamilton detection ftp cookies inner formation tutorial med engineers entity cruises gate holder proposals moderator sw tutorials settlement portugal lawrence roman duties valuable tone collectables ethics forever dragon busy captain fantastic imagine brings heating leg neck hd wing governments purchasing scripts abc stereo appointed taste dealing commit tiny operational rail airlines liberal livecam jay trips gap sides tube turns corresponding descriptions cache belt jacket determination animation oracle er matthew lease productions aviation hobbies proud excess disaster console commands jr telecommunications instructor giant achieved injuries shipped seats approaches biz alarm voltage anthony nintendo usual loading stamps appeared franklin angle rob vinyl highlights mining designers melbourne ongoing worst imaging betting scientists liberty wyoming blackjack argentina era convert possibility analyst commissioner dangerous garage exciting reliability thongs gcc unfortunately respectively volunteers attachment ringtone finland morgan derived pleasure honor asp oriented eagle desktops pants columbus nurse prayer appointment workshops hurricane quiet luck postage producer represented mortgages dial responsibilities cheese comic carefully jet productivity investors crown par underground diagnosis maker crack principle picks vacations gang semester calculated applies casinos appearance smoke apache filters incorporated nv craft cake notebooks apart fellow blind lounge mad algorithm semi coins andy gross strongly cafe valentine hilton ken proteins horror su exp familiar capable douglas debian till involving pen investing christopher admission epson shoe elected carrying victory sand madison terrorism joy editions cpu mainly ethnic ran parliament actor finds seal situations fifth allocated citizen vertical corrections structural municipal describes prize sr occurs jon absolute disabilities consists anytime substance prohibited addressed lies pipe soldiers nr guardian lecture simulation layout initiatives ill concentration classics lbs lay interpretation horses lol dirty deck wayne donate taught bankruptcy mp worker optimization alive temple substances prove discovered wings breaks genetic restrictions participating waters promise thin exhibition prefer ridge cabinet modem harris mph bringing sick dose evaluate tiffany tropical collect bet composition toyota streets nationwide vector definitely shaved turning buffer purple existence commentary larry limousines developments def immigration destinations lets mutual pipeline necessarily syntax li attribute prison skill chairs nl everyday apparently surrounding mountains moves popularity inquiry ethernet checked exhibit throw trend sierra visible cats desert postposted ya oldest rhode nba coordinator obviously mercury steven handbook greg navigate worse summit victims epa spaces fundamental burning escape coupons somewhat receiver substantial tr progressive cialis bb boats glance scottish championship arcade richmond sacramento impossible ron russell tells obvious fiber depression graph covering platinum judgment bedrooms talks filing foster modeling passing awarded testimonials trials tissue nz memorabilia clinton masters bonds cartridge alberta explanation folk org commons cincinnati subsection fraud electricity permitted spectrum arrival okay pottery emphasis roger aspect workplace awesome mexican confirmed counts priced wallpapers hist crash lift desired inter closer assumes heights shadow riding infection firefox lisa expense grove eligibility venture clinic korean healing princess mall entering packet spray studios involvement dad buttons placement observations vbulletin funded thompson winners extend roads subsequent pat dublin rolling fell motorcycle yard disclosure establishment memories nelson te arrived creates faces tourist av mayor murder sean adequate senator yield presentations grades cartoons pour digest reg lodging tion dust hence wiki entirely replaced radar rescue undergraduate losses combat reducing stopped occupation lakes donations associations citysearch closely radiation diary seriously kings shooting kent adds nsw ear flags pci baker launched elsewhere pollution conservative guestbook shock effectiveness walls abroad ebony tie ward drawn arthur ian visited roof walker demonstrate atmosphere suggests kiss beast ra operated experiment targets overseas purchases dodge counsel federation pizza invited yards assignment chemicals gordon mod farmers rc queries bmw rush ukraine absence nearest cluster vendors mpeg whereas yoga serves woods surprise lamp rico partial shoppers phil everybody couples nashville ranking jokes cst http ceo simpson twiki sublime counseling palace acceptable satisfied glad wins measurements verify globe trusted copper milwaukee rack medication warehouse shareware ec rep dicke kerry receipt supposed ordinary nobody ghost violation configure stability mit applying southwest boss pride institutional expectations independence knowing reporter metabolism keith champion cloudy linda ross personally chile anna plenty solo sentence throat ignore maria uniform excellence wealth tall rm somewhere vacuum dancing attributes recognize brass writes plaza pdas outcomes survival quest publish sri screening toe thumbnail trans jonathan whenever nova lifetime api pioneer booty forgotten acrobat plates acres venue athletic thermal essays vital telling fairly coastal config cf charity intelligent edinburgh vt excel modes obligation campbell wake stupid harbor hungary traveler urw segment realize regardless lan enemy puzzle rising aluminum wells wishlist opens insight sms restricted republican secrets lucky latter merchants thick trailers repeat syndrome philips attendance penalty drum glasses enables nec iraqi builder vista jessica chips terry flood foto ease arguments amsterdam arena adventures pupils stewart announcement tabs outcome appreciate expanded casual grown polish lovely extras gm centres jerry clause smile lands ri troops indoor bulgaria armed broker charger regularly believed pine cooling tend gulf rt rick trucks cp mechanisms divorce laura shopper tokyo partly nikon customize tradition candy pills tiger donald folks sensor exposed telecom hunt angels deputy indicators sealed thai emissions physicians loaded fred complaint scenes experiments afghanistan dd boost spanking scholarship governance mill founded supplements chronic icons moral den catering aud finger keeps pound locate camcorder pl trained burn implementing roses labs ourselves bread tobacco wooden motors tough roberts incident gonna dynamics lie crm rf conversation decrease chest pension billy revenues emerging worship capability ak fe craig herself producing churches precision damages reserves contributed solve shorts reproduction minority td diverse amp ingredients sb ah johnny sole franchise recorder complaints facing sm nancy promotions tones passion rehabilitation maintaining sight laid clay defence patches weak refund usc towns environments trembl divided blvd reception amd wise emails cyprus wv odds correctly insider seminars consequences makers hearts geography appearing integrity worry ns discrimination eve carter legacy marc pleased danger vitamin widely processed phrase genuine raising implications functionality paradise hybrid reads roles intermediate emotional sons leaf pad glory platforms ja bigger billing diesel versus combine overnight geographic exceed bs rod saudi fault cuba hrs preliminary districts introduce silk promotional kate chevrolet babies bi karen compiled romantic revealed specialists generator albert examine jimmy graham suspension bristol margaret compaq sad correction wolf slowly authentication communicate rugby supplement showtimes cal portions infant promoting sectors samuel fluid grounds fits kick regards meal ta hurt machinery bandwidth unlike equation baskets probability pot dimension wright img barry proven schedules admissions cached warren slip studied reviewer involves quarterly rpm profits devil grass comply marie florist illustrated cherry continental alternate deutsch achievement limitations kenya webcam cuts funeral nutten earrings enjoyed automated chapters pee charlie quebec passenger convenient dennis mars francis tvs sized manga noticed socket silent literary egg mhz signals caps orientation pill theft childhood swing symbols lat meta humans analog facial choosing talent dated flexibility seeker wisdom shoot boundary mint packard offset payday philip elite gi spin holders believes swedish poems deadline jurisdiction robot displaying witness collins equipped stages encouraged sur winds powder broadway acquired assess wash cartridges stones entrance gnome roots declaration losing attempts gadgets noble glasgow automation impacts rev gospel advantages shore loves induced ll knight preparing loose aims recipient linking extensions appeals cl earned illness islamic athletics southeast ieee ho alternatives pending parker determining lebanon corp personalized kennedy gt sh conditioning teenage soap ae triple cooper nyc vincent jam secured unusual answered partnerships destruction slots increasingly migration disorder routine toolbar basically rocks conventional titans applicants wearing axis sought genes mounted habitat firewall median guns scanner herein occupational animated judicial rio hs adjustment hero integer treatments bachelor attitude camcorders engaged falling basics montreal carpet rv struct lenses binary genetics attended difficulty punk collective coalition pi dropped enrollment duke walter ai pace besides wage producers ot collector arc hosts interfaces advertisers moments atlas strings dawn representing observation feels torture carl deleted coat mitchell mrs rica restoration convenience returning ralph opposition container yr defendant warner confirmation app embedded inkjet supervisor wizard corps actors liver peripherals liable brochure morris bestsellers petition eminem recall antenna picked assumed departure minneapolis belief killing bikini memphis shoulder decor lookup texts harvard brokers roy ion diameter ottawa doll ic podcast seasons peru interactions refine bidder singer evans herald literacy fails aging nike intervention fed plugin attraction diving invite modification alice latinas suppose customized reed involve moderate terror younger thirty mice opposite understood rapidly dealtime ban temp intro mercedes zus assurance clerk happening vast mills outline amendments tramadol holland receives jeans metropolitan compilation verification fonts ent odd wrap refers mood favor veterans quiz mx sigma gr attractive xhtml occasion recordings jefferson victim demands sleeping careful ext beam gardening obligations arrive orchestra sunset tracked moreover minimal polyphonic lottery tops framed aside outsourcing licence adjustable allocation michelle essay discipline amy ts demonstrated dialogue identifying alphabetical camps declared dispatched aaron handheld trace disposal shut florists packs ge installing switches romania voluntary ncaa thou consult phd greatly blogging mask cycling midnight ng commonly pe photographer inform turkish coal cry messaging pentium quantum murray intent tt zoo largely pleasant announce constructed additions requiring spoke aka arrow engagement sampling rough weird tee refinance lion inspired holes weddings blade suddenly oxygen cookie meals canyon goto meters merely calendars arrangement conclusions passes bibliography pointer compatibility stretch durham furthermore permits cooperative muslim xl neil sleeve netscape cleaner cricket beef feeding stroke township rankings measuring cad hats robin robinson jacksonville strap headquarters sharon crowd tcp transfers surf olympic transformation remained attachments dv dir entities customs administrators personality rainbow hook roulette decline gloves israeli medicare cord skiing cloud facilitate subscriber valve val hewlett explains proceed flickr feelings knife jamaica priorities shelf bookstore timing liked parenting adopt denied fotos incredible britney freeware donation outer crop deaths rivers commonwealth pharmaceutical manhattan tales katrina workforce islam nodes tu fy thumbs seeds cited lite ghz hub targeted organizational skype realized twelve founder decade gamecube rr dispute portuguese tired titten adverse everywhere excerpt eng steam discharge ef drinks ace voices acute halloween climbing stood sing tons perfume carol honest albany hazardous restore stack methodology somebody sue ep housewares reputation resistant democrats recycling hang gbp curve creator amber qualifications museums coding slideshow tracker variation passage transferred trunk hiking lb pierre jelsoft headset photograph oakland colombia waves camel distributor lamps underlying hood wrestling suicide archived photoshop jp chi bt arabia gathering projection juice chase mathematical logical sauce fame extract specialized diagnostic panama indianapolis af payable corporations courtesy criticism automobile confidential rfc statutory accommodations athens northeast downloaded judges sl seo retired isp remarks detected decades paintings walked arising nissan bracelet ins eggs juvenile injection yorkshire populations protective afraid acoustic railway cassette initially indicator pointed hb jpg causing mistake norton locked eliminate tc fusion mineral sunglasses ruby steering beads fortune preference canvas threshold parish claimed screens cemetery planner croatia flows stadium venezuela exploration mins fewer sequences coupon nurses ssl stem proxy astronomy lanka opt edwards drew contests flu translate announces mlb costume tagged berkeley voted killer bikes gates adjusted rap tune bishop pulled corn gp shaped compression seasonal establishing farmer counters puts constitutional grew perfectly tin slave instantly cultures norfolk coaching examined trek encoding litigation submissions oem heroes painted lycos ir zdnet broadcasting horizontal artwork cosmetic resulted portrait terrorist informational ethical carriers ecommerce mobility floral builders ties struggle schemes suffering neutral fisher rat spears prospective bedding ultimately joining heading equally artificial bearing spectacular coordination connector brad combo seniors worlds guilty affiliated activation naturally haven tablet jury dos tail subscribers charm lawn violent mitsubishi underwear basin soup potentially ranch constraints crossing inclusive dimensional cottage drunk considerable crimes resolved mozilla byte toner nose latex branches anymore oclc delhi holdings alien locator selecting processors pantyhose plc broke nepal zimbabwe difficulties juan complexity msg constantly browsing resolve barcelona presidential documentary cod territories melissa moscow thesis thru jews nylon palestinian discs rocky bargains frequent trim nigeria ceiling pixels ensuring hispanic cv cb legislature hospitality gen anybody procurement diamonds espn fleet untitled bunch totals marriott singing theoretical afford exercises starring referral nhl surveillance optimal quit distinct protocols lung highlight substitute inclusion hopefully brilliant turner sucking cents reuters ti fc gel todd spoken omega evaluated stayed civic assignments fw manuals doug sees termination watched saver thereof grill households gs redeem rogers grain aaa authentic regime wanna wishes bull montgomery architectural louisville depend differ macintosh movements ranging monica repairs breath amenities virtually cole mart candle hanging colored authorization tale verified lynn formerly projector bp situated comparative std seeks herbal loving strictly routing docs stanley psychological surprised retailer vitamins elegant gains renewal vid genealogy opposed deemed scoring expenditure brooklyn liverpool sisters critics connectivity spots oo algorithms hacker madrid similarly margin coin solely fake salon collaborative norman fda excluding turbo headed voters cure madonna commander arch ni murphy thinks thats suggestion hdtv soldier phillips asin aimed justin bomb harm interval mirrors spotlight tricks reset brush investigate thy expansys panels repeated assault connecting spare logistics deer kodak tongue bowling tri danish pal monkey proportion filename skirt florence invest honey um analyzes drawings significance scenario ye fs lovers atomic approx symposium arabic gauge essentials junction protecting nn faced mat rachel solving transmitted weekends screenshots produces oven ted intensive chains kingston sixth engage deviant noon switching quoted adapters correspondence farms imports supervision cheat bronze expenditures sandy separation testimony suspect celebrities macro sender mandatory boundaries crucial syndication gym celebration kde adjacent filtering tuition spouse exotic viewer signup threats luxembourg puzzles reaching vb damaged cams receptor laugh joel surgical destroy citation pitch autos yo premises perry proved offensive imperial dozen benjamin deployment teeth cloth studying colleagues stamp lotus salmon olympus separated proc cargo tan directive fx salem mate dl starter upgrades likes butter pepper weapon luggage burden chef tapes zones races isle stylish slim maple luke grocery offshore governing retailers depot kenneth comp alt pie blend harrison ls julie occasionally cbs attending emission pete spec finest realty janet bow penn recruiting apparent instructional phpbb autumn traveling probe midi permissions biotechnology toilet ranked jackets routes packed excited outreach helen mounting recover tied lopez balanced prescribed catherine timely talked debug delayed chuck reproduced hon dale explicit calculation villas ebook consolidated exclude peeing occasions brooks equations newton oils sept exceptional anxiety bingo whilst spatial respondents unto lt ceramic prompt precious minds annually considerations scanners atm xanax eq pays fingers sunny ebooks delivers je queensland necklace musicians leeds composite unavailable cedar arranged lang theaters advocacy raleigh stud fold essentially designing threaded uv qualify blair hopes assessments cms mason diagram burns pumps footwear sg vic beijing peoples victor mario pos attach licenses utils removing advised brunswick spider phys ranges pairs sensitivity trails preservation hudson isolated calgary interim assisted divine streaming approve chose compound intensity technological syndicate abortion dialog venues blast wellness calcium newport antivirus addressing pole discounted indians shield harvest membrane prague previews bangladesh constitute locally concluded pickup desperate mothers nascar iceland demonstration governmental manufactured candles graduation mega bend sailing variations moms sacred addiction morocco chrome tommy springfield refused brake exterior greeting ecology oliver congo glen botswana nav delays synthesis olive undefined unemployment cyber verizon scored enhancement newcastle clone velocity lambda relay composed tears performances oasis baseline cab angry fa societies silicon brazilian identical petroleum compete ist norwegian lover belong honolulu beatles lips retention exchanges pond rolls thomson barnes soundtrack wondering malta daddy lc ferry rabbit profession seating dam cnn separately physiology lil collecting das exports omaha tire participant scholarships recreational dominican chad electron loads friendship heather passport motel unions treasury warrant sys solaris frozen occupied josh royalty scales rally observer sunshine strain drag ceremony somehow arrested expanding provincial investigations icq ripe yamaha rely medications hebrew gained rochester dying laundry stuck solomon placing stops homework adjust assessed advertiser enabling encryption filling downloadable sophisticated imposed silence scsi focuses soviet possession cu laboratories treaty vocal trainer organ stronger volumes advances vegetables lemon toxic dns thumbnails darkness pty ws nuts nail bizrate vienna implied span stanford sox stockings joke respondent packing statute rejected satisfy destroyed shelter chapel gamespot manufacture layers wordpress guided vulnerability accountability celebrate accredited appliance compressed bahamas powell mixture bench univ tub rider scheduling radius perspectives mortality logging hampton christians borders therapeutic pads butts inns bobby impressive sheep accordingly architect railroad lectures challenging wines nursery harder cups ash microwave cheapest accidents travesti relocation stuart contributors salvador ali salad np monroe tender violations foam temperatures paste clouds competitions discretion tft tanzania preserve jvc poem unsigned staying cosmetics easter theories repository praise jeremy venice concentrations estonia christianity veteran streams landing signing executed katie negotiations realistic dt cgi showcase integral asks relax namibia generating christina congressional synopsis hardly prairie reunion composer bean sword absent photographic sells ecuador hoping accessed spirits modifications coral pixel float colin bias imported paths bubble por acquire contrary millennium tribune vessel acids focusing viruses cheaper admitted dairy admit mem fancy equality samoa gc achieving tap stickers fisheries exceptions reactions leasing lauren beliefs ci macromedia companion squad analyze ashley scroll relate divisions swim wages additionally suffer forests fellowship nano invalid concerts martial males victorian retain execute tunnel genres cambodia patents copyrights yn chaos lithuania mastercard wheat chronicles obtaining beaver updating distribute readings decorative kijiji confused compiler enlargement eagles bases vii accused bee campaigns unity loud conjunction bride rats defines airports instances indigenous begun cfr brunette packets anchor socks validation parade corruption stat trigger incentives cholesterol gathered essex slovenia notified differential beaches folders dramatic surfaces terrible routers cruz pendant dresses baptist scientist starsmerchant hiring clocks arthritis bios females wallace nevertheless reflects taxation fever pmc cuisine surely practitioners transcript myspace theorem inflation thee nb ruth pray stylus compounds pope drums contracting arnold structured reasonably jeep chicks bare hung cattle mba radical graduates rover recommends controlling treasure reload distributors flame levitra tanks assuming monetary elderly pit arlington mono particles floating extraordinary tile indicating bolivia spell hottest stevens coordinate kuwait exclusively emily alleged limitation widescreen compile webster struck rx illustration plymouth warnings construct apps inquiries bridal annex mag gsm inspiration tribal curious affecting freight rebate meetup eclipse sudan ddr downloading rec shuttle aggregate stunning cycles affects forecasts detect actively ciao ampland knee prep pb complicated chem fastest butler shopzilla injured decorating payroll cookbook expressions ton courier uploaded shakespeare hints collapse americas connectors unlikely oe gif pros conflicts techno beverage tribute wired elvis immune latvia travelers forestry barriers cant jd rarely gpl infected offerings martha genesis barrier argue incorrect trains metals bicycle furnishings letting arise guatemala celtic thereby irc jamie particle perception minerals advise humidity bottles boxing wy dm bangkok renaissance pathology sara bra ordinance hughes photographers infections jeffrey chess operates brisbane configured survive oscar festivals menus joan possibilities duck reveal canal amino phi contributing herbs clinics mls cow manitoba analytical missions watson lying costumes strict dive saddam circulation drill offense bryan cet protest assumption jerusalem hobby tries transexuales invention nickname fiji technician inline executives enquiries washing audi staffing cognitive exploring trick enquiry closure raid ppc timber volt intense div playlist registrar showers supporters ruling steady dirt statutes withdrawal myers drops predicted wider saskatchewan jc cancellation plugins enrolled sensors screw ministers publicly hourly blame geneva freebsd veterinary acer prostores reseller dist handed suffered intake informal relevance incentive butterfly tucson mechanics heavily swingers fifty headers mistakes numerical ons geek uncle defining counting reflection sink accompanied assure invitation devoted princeton jacob sodium randy spirituality hormone meanwhile proprietary timothy childrens brick grip naval thumbzilla medieval porcelain avi bridges pichunter captured watt thehun decent casting dayton translated shortly cameron columnists pins carlos reno donna andreas warrior diploma cabin innocent scanning ide consensus polo valium copying rpg delivering cordless patricia horn eddie uganda fired journalism pd prot trivia adidas perth frog grammar intention syria disagree klein harvey tires logs undertaken tgp hazard retro leo statewide semiconductor gregory episodes boolean circular anger diy mainland illustrations suits chances interact snap happiness arg substantially bizarre glenn ur auckland olympics fruits identifier geo ribbon calculations doe jpeg conducting startup suzuki trinidad ati kissing wal handy swap exempt crops reduces accomplished calculators geometry impression abs slovakia flip guild correlation gorgeous capitol sim dishes rna barbados chrysler nervous refuse extends fragrance mcdonald replica plumbing brussels tribe neighbors trades superb buzz transparent nuke rid trinity charleston handled legends boom calm champions floors selections projectors inappropriate exhaust comparing shanghai speaks burton vocational davidson copied scotia farming gibson pharmacies fork troy ln roller introducing batch organize appreciated alter nicole latino ghana edges uc mixing handles skilled fitted albuquerque harmony distinguished asthma projected assumptions shareholders twins developmental rip zope regulated triangle amend anticipated oriental reward windsor zambia completing gmbh buf ld hydrogen webshots sprint comparable chick advocate sims confusion copyrighted tray inputs warranties genome documented thong medal paperbacks coaches vessels walks sol keyboards sage knives eco vulnerable arrange artistic bat honors booth indie reflected unified bones breed detector ignored polar fallen precise sussex respiratory notifications msgid transexual mainstream invoice evaluating lip subcommittee sap gather suse maternity backed alfred colonial mf carey motels forming embassy cave journalists danny rebecca slight proceeds indirect amongst wool foundations msgstr arrest volleyball mw adipex horizon nu deeply toolbox ict marina liabilities prizes bosnia browsers decreased patio dp tolerance surfing creativity lloyd describing optics pursue lightning overcome eyed ou quotations grab inspector attract brighton beans bookmarks ellis disable snake succeed leonard lending oops reminder xi searched behavioral riverside bathrooms plains sku ht raymond insights abilities initiated sullivan za midwest karaoke trap lonely fool ve nonprofit lancaster suspended hereby observe julia containers attitudes karl berry collar simultaneously racial integrate bermuda amanda sociology mobiles screenshot exhibitions kelkoo confident retrieved exhibits officially consortium dies terrace bacteria pts replied seafood novels rh rrp recipients ought delicious traditions fg jail safely finite kidney periodically fixes sends durable mazda allied throws moisture hungarian roster referring symantec spencer wichita nasdaq uruguay ooo hz transform timer tablets tuning gotten educators tyler futures vegetable verse highs humanities independently wanting custody scratch launches ipaq alignment henderson bk britannica comm ellen competitors nhs rocket aye bullet towers racks lace nasty visibility latitude consciousness ste tumor ugly deposits beverly mistress encounter trustees watts duncan reprints hart bernard resolutions ment accessing forty tubes attempted col midlands priest floyd ronald analysts queue dx sk trance locale nicholas biol yu bundle hammer invasion witnesses runner rows administered notion sq skins mailed oc fujitsu spelling arctic exams rewards beneath strengthen defend aj frederick medicaid treo infrared seventh gods une welsh belly aggressive tex advertisements quarters stolen cia sublimedirectory soonest haiti disturbed determines sculpture poly ears dod wp fist naturals neo motivation lenders pharmacology fitting fixtures bloggers mere agrees passengers quantities petersburg consistently powerpoint cons surplus elder sonic obituaries cheers dig taxi punishment appreciation subsequently om belarus nat zoning gravity providence thumb restriction incorporate backgrounds treasurer guitars essence flooring lightweight ethiopia tp mighty athletes humanity transcription jm holmes complications scholars dpi scripting gis remembered galaxy chester snapshot caring loc worn synthetic shaw vp segments testament expo dominant twist specifics itunes stomach partially buried cn newbie minimize darwin ranks wilderness debut generations tournaments bradley deny anatomy bali judy sponsorship headphones fraction trio proceeding cube defects volkswagen uncertainty breakdown milton marker reconstruction subsidiary strengths clarity rugs sandra adelaide encouraging furnished monaco settled folding emirates terrorists airfare comparisons beneficial distributions vaccine belize fate viewpicture promised volvo penny robust bookings threatened minolta republicans discusses gui porter gras jungle ver rn responded rim abstracts zen ivory alpine dis prediction pharmaceuticals andale fabulous remix alias thesaurus individually battlefield literally newer kay ecological spice oval implies cg soma ser cooler appraisal consisting maritime periodic submitting overhead ascii prospect shipment breeding citations geographical donor mozambique tension href benz trash shapes wifi tier fwd earl manor envelope diane homeland disclaimers championships excluded andrea breeds rapids disco sheffield bailey aus endif finishing emotions wellington incoming prospects lexmark cleaners bulgarian hwy eternal cashiers guam cite aboriginal remarkable rotation nam preventing productive boulevard eugene ix gdp pig metric compliant minus penalties bennett imagination hotmail refurbished joshua armenia varied grande closest activated actress mess conferencing assign armstrong politicians trackbacks lit accommodate tigers aurora una slides milan premiere lender villages shade chorus christine rhythm digit argued dietary symphony clarke sudden accepting precipitation marilyn lions findlaw ada pools tb lyric claire isolation speeds sustained matched approximate rope carroll rational programmer fighters chambers dump greetings inherited warming incomplete vocals chronicle fountain chubby grave legitimate biographies burner yrs foo investigator gba plaintiff finnish gentle bm prisoners deeper muslims hose mediterranean nightlife footage howto worthy reveals architects saints entrepreneur carries sig freelance duo excessive devon screensaver helena saves regarded valuation unexpected cigarette fog characteristic marion lobby egyptian tunisia metallica outlined consequently headline treating punch appointments str gotta cowboy narrative bahrain enormous karma consist betty queens academics pubs quantitative lucas screensavers subdivision tribes vip defeat clicks distinction honduras naughty hazards insured harper livestock mardi exemption tenant sustainability cabinets tattoo shake algebra shadows holly formatting silly nutritional yea mercy hartford freely marcus sunrise wrapping mild fur nicaragua weblogs timeline tar belongs rj readily affiliation soc fence infinite diana ensures relatives lindsay clan legally shame satisfactory revolutionary bracelets sync civilian telephony mesa fatal remedy realtors breathing briefly thickness adjustments graphical genius discussing aerospace fighter meaningful flesh retreat adapted barely wherever estates rug democrat borough maintains failing shortcuts ka retained voyeurweb pamela andrews marble extending jesse specifies hull logitech surrey briefing belkin dem accreditation wav blackberry highland meditation modular microphone macedonia combining brandon instrumental giants organizing shed balloon moderators winston memo ham solved tide kazakhstan hawaiian standings partition invisible gratuit consoles funk fbi qatar magnet translations porsche cayman jaguar reel sheer commodity posing kilometers rp bind thanksgiving rand hopkins urgent guarantees infants gothic cylinder witch buck indication eh congratulations tba cohen sie usgs puppy kathy acre graphs surround cigarettes revenge expires enemies lows controllers aqua chen emma consultancy finances accepts enjoying conventions eva patrol smell pest hc italiano coordinates rca fp carnival roughly sticker promises responding reef physically divide stakeholders hydrocodone gst consecutive cornell satin bon deserve attempting mailto promo jj representations chan worried tunes garbage competing combines mas beth bradford len phrases kai peninsula chelsea boring reynolds dom jill accurately speeches reaches schema considers sofa catalogs ministries vacancies quizzes parliamentary obj prefix lucia savannah barrel typing nerve dans planets deficit boulder pointing renew coupled viii myanmar metadata harold circuits floppy texture handbags jar ev somerset incurred acknowledge thoroughly antigua nottingham thunder tent caution identifies questionnaire qualification locks modelling namely miniature dept hack dare euros interstate pirates aerial hawk consequence rebel systematic perceived origins hired makeup textile lamb madagascar nathan tobago presenting cos troubleshooting uzbekistan indexes pac rl erp centuries gl magnitude ui richardson hindu dh fragrances vocabulary licking earthquake vpn fundraising fcc markers weights albania geological assessing lasting wicked eds introduces kills roommate webcams pushed webmasters ro df computational acdbentity participated junk handhelds wax lucy answering hans impressed slope reggae failures poet conspiracy surname theology nails evident whats rides rehab epic saturn organizer nut allergy sake twisted combinations preceding merit enzyme cumulative zshops planes edmonton tackle disks condo pokemon amplifier ambien arbitrary prominent retrieve lexington vernon sans worldcat titanium irs fairy builds contacted shaft lean bye cdt recorders occasional leslie casio deutsche ana postings innovations kitty postcards dude drain monte fires algeria blessed luis reviewing cardiff cornwall favors potato panic explicitly sticks leone transsexual ez citizenship excuse reforms basement onion strand pf sandwich uw lawsuit alto informative girlfriend bloomberg cheque hierarchy influenced banners reject eau abandoned bd circles italic beats merry mil scuba gore complement cult dash passive mauritius valued cage checklist requesting courage verde lauderdale scenarios gazette hitachi divx extraction batman elevation hearings coleman hugh lap utilization beverages calibration jake eval efficiently anaheim ping textbook dried entertaining prerequisite luther frontier settle stopping refugees knights hypothesis palmer medicines flux derby sao peaceful altered pontiac regression doctrine scenic trainers muze enhancements renewable intersection passwords sewing consistency collectors conclude munich oman celebs gmc propose hh azerbaijan lighter rage adsl uh prix astrology advisors pavilion tactics trusts occurring supplemental travelling talented annie pillow induction derek precisely shorter harley spreading provinces relying finals paraguay steal parcel refined fd bo fifteen widespread incidence fears predict boutique acrylic rolled tuner avon incidents peterson rays asn shannon toddler enhancing flavor alike walt homeless horrible hungry metallic acne blocked interference warriors palestine listprice libs undo cadillac atmospheric malawi wm pk sagem knowledgestorm dana halo ppm curtis parental referenced strikes lesser publicity marathon ant proposition gays pressing gasoline apt dressed scout belfast exec dealt niagara inf eos warcraft charms catalyst trader bucks allowance vcr denial uri designation thrown prepaid raises gem duplicate electro criterion badge wrist civilization analyzed vietnamese heath tremendous ballot lexus varying remedies validity trustee maui weighted angola performs plastics realm corrected jenny helmet salaries postcard elephant yemen encountered tsunami scholar nickel internationally surrounded psi buses expedia geology pct wb creatures coating commented wallet cleared smilies vids accomplish boating drainage shakira corners broader vegetarian rouge yeast yale newfoundland sn qld pas clearing investigated dk ambassador coated intend stephanie contacting vegetation doom findarticles louise kenny specially owen routines hitting yukon beings bite issn aquatic reliance habits striking myth infectious podcasts singh gig gilbert sas ferrari continuity brook fu outputs phenomenon ensemble insulin assured biblical weed conscious accent mysimon eleven wives ambient utilize mileage oecd prostate adaptor auburn unlock hyundai pledge vampire angela relates nitrogen xerox dice merger softball referrals quad dock differently firewire mods nextel framing musician blocking rwanda sorts integrating vsnet limiting dispatch revisions papua restored hint armor riders chargers remark dozens varies msie reasoning wn liz rendered picking charitable guards annotated ccd sv convinced openings buys burlington replacing researcher watershed councils occupations acknowledged kruger pockets granny pork zu equilibrium viral inquire pipes characterized laden aruba cottages realtor merge privilege edgar develops qualifying chassis dubai estimation barn pushing llp fleece pediatric boc fare dg asus pierce allan dressing techrepublic sperm vg bald filme craps fuji frost leon institutes mold dame fo sally yacht tracy prefers drilling brochures herb tmp alot ate breach whale traveller appropriations suspected tomatoes benchmark beginners instructors highlighted bedford stationery idle mustang unauthorized clusters antibody competent momentum fin wiring io pastor mud calvin uni shark contributor demonstrates phases grateful emerald gradually laughing grows cliff desirable tract ul ballet ol journalist abraham js bumper afterwards webpage religions garlic hostels shine senegal explosion pn banned wendy briefs signatures diffs cove mumbai ozone disciplines casa mu daughters conversations radios tariff nvidia opponent pasta simplified muscles serum wrapped swift motherboard runtime inbox focal bibliographic eden distant incl champagne ala decimal hq deviation superintendent propecia dip nbc samba hostel housewives employ mongolia penguin magical influences inspections irrigation miracle manually reprint reid wt hydraulic centered robertson flex yearly penetration wound belle rosa conviction hash omissions writings hamburg lazy mv mpg retrieval qualities cindy fathers carb charging cas marvel lined cio dow prototype importantly rb petite apparatus upc terrain dui pens explaining yen strips gossip rangers nomination empirical mh rotary worm dependence discrete beginner boxed lid sexuality polyester cubic deaf commitments suggesting sapphire kinase skirts mats remainder crawford labeled privileges televisions specializing marking commodities pvc serbia sheriff griffin declined guyana spies blah mime neighbor motorcycles elect highways thinkpad concentrate intimate reproductive preston deadly feof bunny chevy molecules rounds longest refrigerator tions intervals sentences dentists usda exclusion workstation holocaust keen flyer peas dosage receivers urls disposition variance navigator investigators cameroon baking marijuana adaptive computed needle baths enb gg cathedral brakes og nirvana ko fairfield owns til invision sticky destiny generous madness emacs climb blowing fascinating landscapes heated lafayette jackie wto computation hay cardiovascular ww sparc cardiac salvation dover adrian predictions accompanying vatican brutal learners gd selective arbitration configuring token editorials zinc sacrifice seekers guru isa removable convergence yields gibraltar levy suited numeric anthropology skating kinda aberdeen emperor grad malpractice dylan bras belts blacks educated rebates reporters burke proudly pix necessity rendering mic inserted pulling basename kyle obesity curves suburban touring clara vertex bw hepatitis nationally tomato andorra waterproof expired mj travels flush waiver pale specialties hayes humanitarian invitations functioning delight survivor garcia cingular economies alexandria bacterial moses counted undertake declare continuously johns valves gaps impaired achievements donors tear jewel teddy lf convertible ata teaches ventures nil bufing stranger tragedy julian nest pam dryer painful velvet tribunal ruled nato pensions prayers funky secretariat nowhere cop paragraphs gale joins adolescent nominations wesley dim lately cancelled scary mattress mpegs brunei likewise banana introductory slovak cakes stan reservoir occurrence idol mixer remind wc worcester sbjct demographic charming mai tooth disciplinary annoying respected stays disclose affair drove washer upset restrict springer beside mines portraits rebound logan mentor interpreted evaluations fought baghdad elimination metres hypothetical immigrants complimentary helicopter pencil freeze hk performer abu titled commissions sphere powerseller moss ratios concord graduated endorsed ty surprising walnut lance ladder italia unnecessary dramatically liberia sherman cork maximize cj hansen senators workout mali yugoslavia bleeding characterization colon likelihood lanes purse fundamentals contamination mtv endangered compromise optimize stating dome caroline leu expiration namespace align peripheral bless engaging negotiation crest opponents triumph nominated confidentiality electoral changelog welding deferred alternatively heel alloy condos plots polished yang gently greensboro tulsa locking casey controversial draws fridge blanket bloom qc simpsons lou elliott recovered fraser justify upgrading blades pgp loops surge frontpage trauma aw tahoe advert possess demanding defensive sip flashers subaru forbidden tf vanilla programmers pj monitored installations deutschland picnic souls arrivals spank cw practitioner motivated wr dumb smithsonian hollow vault securely examining fioricet groove revelation rg pursuit delegation wires bl dictionaries mails backing greenhouse sleeps vc blake transparency dee travis wx endless figured orbit currencies niger bacon survivors positioning heater colony cannon circus promoted forbes mae moldova mel descending paxil spine trout enclosed feat temporarily ntsc cooked thriller transmit apnic fatty gerald pressed frequencies scanned reflections hunger mariah sic municipality usps joyce detective surgeon cement experiencing fireplace endorsement bg planners disputes textiles missile intranet closes seq psychiatry persistent deborah conf marco assists summaries glow gabriel auditor wma aquarium violin prophet cir bracket looksmart isaac oxide oaks magnificent erik colleague naples promptly modems adaptation hu harmful paintball prozac sexually enclosure acm dividend newark kw paso glucose phantom norm playback supervisors westminster turtle ips distances absorption treasures dsc warned neural ware fossil mia hometown badly transcripts apollo wan disappointed persian continually communist collectible handmade greene entrepreneurs robots grenada creations jade scoop acquisitions foul keno gtk earning mailman sanyo nested biodiversity excitement somalia movers verbal blink presently seas carlo workflow mysterious novelty bryant tiles voyuer librarian subsidiaries switched stockholm tamil garmin ru pose fuzzy indonesian grams therapist richards mrna budgets toolkit promising relaxation goat render carmen ira sen thereafter hardwood erotica temporal sail forge commissioners dense dts brave forwarding qt awful nightmare airplane reductions southampton istanbul impose organisms sega telescope viewers asbestos portsmouth cdna meyer enters pod savage advancement wu harassment willow resumes bolt gage throwing existed generators lu wagon barbie dat soa knock urge smtp generates potatoes thorough replication inexpensive kurt receptors peers roland optimum neon interventions quilt huntington creature ours mounts syracuse internship lone refresh aluminium snowboard beastality webcast michel evanescence subtle coordinated notre shipments maldives stripes firmware antarctica cope shepherd lm canberra cradle chancellor mambo lime kirk flour controversy legendary bool sympathy choir avoiding beautifully blond expects cho jumping fabrics antibodies polymer hygiene wit poultry virtue burst examinations surgeons bouquet immunology promotes mandate wiley departmental bbs spas ind corpus johnston terminology gentleman fibre reproduce convicted shades jets indices roommates adware qui intl threatening spokesman zoloft activists frankfurt prisoner daisy halifax encourages ultram cursor assembled earliest donated stuffed restructuring insects terminals crude morrison maiden simulations cz sufficiently examines viking myrtle bored cleanup yarn knit conditional mug crossword bother budapest conceptual knitting attacked hl bhutan liechtenstein mating compute redhead arrives translator automobiles tractor allah continent ob unwrap fares longitude resist challenged telecharger hoped pike safer insertion instrumentation ids hugo wagner constraint groundwater touched strengthening cologne gzip wishing ranger smallest insulation newman marsh ricky ctrl scared theta infringement bent laos subjective monsters asylum lightbox robbie stake cocktail outlets swaziland varieties arbor mediawiki configurations poison";
  var RANK = {};
  EASY_WORDS.split(" ").forEach(function(w, i){ RANK[w] = i + 1; });
  function rank(w){ return RANK[w] || Infinity; }

  /* ---------- figurative language and register ----------
     How the sentence is written, not only what it says: similes, metaphors, personification,
     hyperbole and the idioms the explainer already found, plus one word for its register with
     the evidence for it. start / end are character offsets into the sentence, so the card can
     mark the span inside its quote. */

  /* vivid everyday nouns — the right-hand side of a metaphor ("her words were daggers") */
  var VIVID = set("storm sun moon star wolf lion tiger fox bear snake serpent ghost shadow machine engine ocean sea river stream fire flame ice stone rock wall mountain cliff angel devil monster giant beast book mirror window door bridge anchor chain thread needle dagger knife sword blade arrow bullet hammer nail rope net cage prison fortress castle tower island desert forest garden flower rose thorn weed seed root branch leaf tree oak cloud rain thunder lightning wind breeze frost snow hail fog mist dawn dusk night candle lamp lantern furnace oven kettle clock coin gold silver iron steel glass crystal diamond pearl velvet silk paper dust ash smoke steam honey sugar salt poison medicine wound scar knot maze puzzle mask puppet doll clown king queen soldier prisoner saint bird hawk eagle dove crow owl sheep lamb pig dog cat horse mouse rat fish shark whale bee ant spider butterfly worm sunshine whirlwind volcano earthquake avalanche tide harbour harbor lighthouse compass");
  /* things only people do — a thing that does one of them is personified */
  var HUMAN_ACT = set("whisper sigh smile laugh cry weep dance sing sleep wake grieve beg refuse argue mutter groan kiss embrace wait watch listen remember forget decide want");
  /* the left-hand side of "a sea of troubles" */
  var ABSTRACT = set("trouble sorrow grief joy fear hope despair doubt love hatred anger rage peace time life death memory pain pleasure guilt shame pride courage faith wisdom knowledge freedom silence chaos confusion regret longing desire misery worry");
  var POSSDET = set("my your his her its our their");
  /* "as soon as", "as much as" and the like are joining words, not comparisons */
  var NOT_SIMILE = set("soon long far well much many more most often usual always possible early late quickly good");
  var ARCHAIC = set("thou thee thy thine ye hath doth dost hast saith ere whilst oft prithee nay forsooth methinks hither thither whence whither yonder betwixt nigh unto morrow");
  var NOT_ETH = set("teeth beneath underneath breath death wreath heath sheath bequeath seeth");
  var FILLERS = [/\bwell\s*,/i, /\byou know\b/i, /\bi mean\b/i, /\bkind of\b/i, /\bkinda\b/i, /\bsort of\b/i, /\bsorta\b/i, /\bgonna\b/i, /\bgotta\b/i, /\bwanna\b/i, /\byeah\b/i, /\byep\b/i, /\bnope\b/i, /\bokay\b/i, /\bhey\b/i, /\bhuh\b/i];
  var TAG_Q = /,\s*(?:[a-z]+n['’]t|is|are|was|were|do|does|did|will|would|can|could|should|shall|have|has|had)\s+(?:i|you|he|she|it|we|they)\s*\?/i;
  var HYPER = [
    /\b(?:a|one)\s+(?:hundred|thousand|million|billion)\s+times\b/gi,
    /\bforever\b/gi,
    /\bnever\s+in\s+(?:my|your|his|her|our|their)\s+(?:whole\s+)?life\b/gi,
    /\bthe\s+whole\s+world\b/gi,
    /\b(?:everyone|everybody|no\s+one|nobody)\s+ever\b/gi,
    /\btons\s+of\b/gi,
    /\bweigh(?:s|ed)?\s+a\s+ton\b/gi,
    /\bfor\s+ages\b/gi,
    /\bd(?:ied|ying)\s+of\s+(?:laughter|embarrassment|boredom|shame)\b/gi,
    /\bstarving\b/gi,
    /\bfreezing\s+to\s+death\b/gi,
    /\bthe\s+(?:best|worst)\b[^.!?]{0,40}?\bever\b/gi,
    /\b(?:very\s+very|so\s+so)\b/gi
  ];

  /* the nearest noun or pronoun before token i */
  function headBefore(toks, i){
    for (var j = i - 1; j >= 0; j--){
      if (toks[j].punct) continue;
      if (/^(NOUN|PROPER|PRON|PRONO)$/.test(toks[j].tag)) return toks[j];
    }
    return null;
  }
  /* the run of words after token i, up to punctuation or a joining word: [first, last] */
  function phraseAfter(toks, i){
    var a = i + 1, b = a;
    while (b < toks.length && !toks[b].punct && !/^(CC|SC|REL|WH)$/.test(toks[b].tag)) b++;
    return b > a ? [a, b - 1] : null;
  }
  function isAbstract(t){
    var l = t.lemma || t.l;
    return !!(ABSTRACT[l] || /(tion|sion|ness|ity|ment|ance|ence|hood|ship|ism)$/.test(l));
  }
  /* a person, a name, or something a person owns ("her words") */
  function personish(toks, t){
    var l = t.lemma || t.l;
    if (PERSON[l] || t.tag === "PROPER" || (t.c && t.c.PROPER)) return true;
    for (var j = t.i - 1; j >= 0 && j >= t.i - 3; j--){
      if (toks[j].punct) break;
      if (POSSDET[toks[j].l] || toks[j].poss) return true;
      if (!/^(DET|ADJ|NOUN|NUM)$/.test(toks[j].tag)) break;
    }
    return false;
  }
  /* the first token of the noun phrase that ends at t ("her words" from "words") */
  function npStart(toks, t){
    var j = t.i;
    while (j > 0 && !toks[j-1].punct && (/^(DET|ADJ|POSS|NUM)$/.test(toks[j-1].tag) || POSSDET[toks[j-1].l])) j--;
    return j;
  }
  /* "like" compares when it stands after something that has already happened, not when it is
     the clause's own verb ("I like tea", "she would like tea", "the children like sweets") */
  function likeIsPrep(toks, i){
    var prev = toks[i - 1], z;
    if (!prev || prev.punct) return true;
    if (/^(MODAL|TO|AUX|NEG|DET|ADJ|CC|SC)$/.test(prev.tag)) return false;
    if (prev.tag === "PRON" && PERSON[prev.l]) return false;
    for (z = 0; z < i; z++) if (/^(VERB|AUX|MODAL)$/.test(toks[z].tag) && toks[z].l !== "like") return true;
    return false;
  }
  /* a run of words that reads as a thing, not as another clause */
  function nominal(toks, ph){
    var last = toks[ph[1]];
    return /^(NOUN|PROPER|PRON|PRONO|NUM)$/.test(last.tag) && !/^(AUX|MODAL|TO)$/.test(toks[ph[0]].tag);
  }
  function clauseAt(clauses, i){
    for (var k = 0; k < clauses.length; k++){
      var c = clauses[k];
      if (c.span && i >= c.span[0] && i <= c.span[1]) return c;
    }
    return null;
  }
  function subjectOf(clauses, i){
    var c = clauseAt(clauses, i);
    return (c && c.subject) ? c.subject.toLowerCase() : "this";
  }

  function figurative(toks, clauses, exprs, src, rank){
    var out = [], seen = {};
    function add(kind, a, b, note){
      if (a < 0 || b >= toks.length || b < a) return;
      push(kind, toks[a].s, toks[b].e, note);
    }
    function push(kind, s, e, note){
      var key = kind + ":" + s + ":" + e;
      if (seen[key] || e <= s) return;
      seen[key] = 1;
      out.push({ kind: kind, text: src.slice(s, e), start: s, end: e, note: note });
    }
    function slice(a, b){ return src.slice(toks[a].s, toks[b].e); }

    toks.forEach(function(t, i){
      if (t.punct) return;
      /* simile: "like a …" — never the verb ("I like tea", "she would like tea"). The tagger
         sometimes reads a comparison as the verb of its clause, so a "like" that could be a
         preposition counts when the clause already has a verb and nothing before it is a
         subject pronoun or an auxiliary waiting for one */
      if (t.l === "like" && t.tag !== "NOUN" && t.c && t.c.PREP && likeIsPrep(toks, i)){
        var ph = phraseAfter(toks, i);
        if (ph && nominal(toks, ph)){
          var x = headBefore(toks, i);
          add("simile", i, ph[1], "compares " + (x ? x.w.toLowerCase() : subjectOf(clauses, i)) + " to " + slice(ph[0], ph[1]).toLowerCase());
        }
      }
      /* simile: "as cold as ice" — not "as many as 400", not "as soon as" */
      if (t.l === "as" && toks[i+1] && /^(ADJ|NOUN|ADV)$/.test(toks[i+1].tag) && !NOT_SIMILE[toks[i+1].l] && toks[i+2] && toks[i+2].l === "as"){
        var ph2 = phraseAfter(toks, i + 2);
        if (ph2 && /^(DET|NOUN|ADJ|PROPER|POSS)$/.test(toks[ph2[0]].tag) && !(toks[ph2[0]].c && toks[ph2[0]].c.NUM)){
          add("simile", i, ph2[1], "compares " + subjectOf(clauses, i) + " to " + slice(ph2[0], ph2[1]).toLowerCase());
        }
      }
      /* simile: "as if / as though …" */
      if (t.l === "as" && toks[i+1] && /^(if|though)$/.test(toks[i+1].l) && toks[i+2] && !toks[i+2].punct){
        var b3 = i + 2;
        while (b3 + 1 < toks.length && !toks[b3 + 1].punct) b3++;
        add("simile", i, b3, "compares " + subjectOf(clauses, i) + " to " + slice(i + 2, b3).toLowerCase());
      }
      /* metaphor: "X is / was a Y", with Y a vivid everyday thing */
      if ((t.tag === "AUX" || t.tag === "VERB") && BE[t.l]){
        var sj = headBefore(toks, i), j = i + 1;
        while (toks[j] && /^(DET|ADJ|POSS|ADV|NUM)$/.test(toks[j].tag)) j++;
        var y = toks[j];
        if (sj && y && y.tag === "NOUN" && VIVID[y.lemma || y.l] && (y.lemma || y.l) !== (sj.lemma || sj.l) && personish(toks, sj)){
          add("metaphor", npStart(toks, sj), j, "says one thing is another to suggest a likeness");
        }
      }
      /* metaphor: "a sea of troubles" — a vivid thing standing for an idea */
      if (t.l === "of" && t.tag === "PREP"){
        var xh = headBefore(toks, i), k = i + 1;
        while (toks[k] && /^(DET|ADJ|POSS|NUM)$/.test(toks[k].tag)) k++;
        var yh = toks[k];
        if (xh && yh && xh.tag === "NOUN" && yh.tag === "NOUN" && VIVID[xh.lemma || xh.l] && isAbstract(yh)){
          add("metaphor", npStart(toks, xh), k, "says one thing is another to suggest a likeness");
        }
      }
    });

    /* personification: a thing doing something only people do */
    clauses.forEach(function(c){
      if (!c || c.fragment || !c.pos || !c.pos.subj || c.pos.main < 0) return;
      var head = toks[c.pos.subj[1]], v = toks[c.pos.main];
      if (!head || !v || v.tag !== "VERB" || head.tag !== "NOUN") return;
      if (PERSON[head.lemma || head.l] || (head.c && head.c.PROPER)) return;
      if (!HUMAN_ACT[v.lemma || v.l]) return;
      add("personification", c.pos.subj[0], v.i, "gives a human action to a thing");
    });

    /* hyperbole: the stock exaggerations */
    HYPER.forEach(function(re){
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(src))) push("hyperbole", m.index, m.index + m[0].length, "exaggerates for effect");
    });

    /* the idioms the explainer already found, with their dictionary sense */
    exprs.forEach(function(e){
      if (e.kind !== "idiom" || e.split) return;
      var best = bestSense(e.entry, null, rank);
      add("idiom", e.start, e.end, best && best.d ? "an idiom — it means " + best.d : "a set phrase with a meaning of its own");
    });

    out.sort(function(a, b){ return a.start - b.start || a.end - b.end; });
    return out;
  }

  /* "a, b and c" */
  function andList(a){
    if (!a.length) return "";
    if (a.length === 1) return a[0];
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function registerOf(toks, clauses, figs, src){
    var words = toks.filter(function(t){ return !t.punct; }), low = src.toLowerCase(), found = [], i;
    /* archaic */
    var marks = [];
    words.forEach(function(t){
      if (ARCHAIC[t.l] && marks.indexOf("“" + t.l + "”") < 0) marks.push("“" + t.l + "”");
      if (/^[a-z]{3,}eth$/.test(t.l) && !NOT_ETH[t.l] && marks.indexOf("-eth verbs") < 0) marks.push("-eth verbs");
    });
    if (/['’]tis\b|\btwas\b/.test(low) && marks.indexOf("“’tis”") < 0) marks.push("“’tis”");
    if (words.some(function(t){ return t.l === "art"; }) && words.some(function(t){ return t.l === "thou"; })) marks.push("“art”");
    if (marks.length) return { kind: "archaic", note: "Archaic — " + andList(marks.slice(0, 3)) };

    /* spoken */
    var contractions = toks.filter(function(t){ return t.glued; }).length;
    var fillers = FILLERS.filter(function(re){ return re.test(src); }).length;
    var tag = TAG_Q.test(src);
    if (contractions && (fillers || tag)){
      found = [];
      if (contractions) found.push("contractions");
      if (fillers) found.push(fillers > 1 ? "everyday fillers" : "an everyday filler");
      if (tag) found.push("a question tag");
      return { kind: "spoken", note: "Spoken — " + andList(found) };
    }
    if (fillers >= 2) return { kind: "spoken", note: "Spoken — everyday fillers" };

    /* formal */
    if (!contractions){
      found = [];
      if (clauses.some(function(c){ return c && c.passive; })) found.push("a passive");
      var noms = words.filter(function(t){ return /(tion|sion|ment|ance|ence)$/.test(t.l) && t.l.length > 5; }).length;
      if (noms >= 2) found.push("nouns built from verbs");
      var latin = words.filter(function(t){ return t.l.length >= 8 && rank(t.l) > 5000 && rank(t.lemma || t.l) > 5000; }).length;
      if (latin >= 2) found.push("long Latin-based words");
      if (/\bone must\b|\bit is\b[^.!?]{0,40}\bthat\b|\bshall\b/.test(low)) found.push("“shall” or “one must”");
      if (found.length >= 2) return { kind: "formal", note: "Formal — " + andList(["no contractions"].concat(found)) };
    }

    /* literary */
    if (figs.length) return { kind: "literary", note: "Literary — " + figs[0].kind + " and a written turn of phrase" };
    var seps = toks.filter(function(t){ return t.punct && /^[;—–]$/.test(t.w); }).length;
    if (seps && clauses.filter(function(c){ return c && !c.fragment; }).length > 1) return { kind: "literary", note: "Literary — clauses joined by a semicolon or a dash" };

    return { kind: "neutral", note: "Neutral — everyday written English" };
  }

  /* ---------- simplify ----------
     A plainer version of one or more sentences, built as edits on the original text so that
     spelling, spacing, quotes and contractions stay exactly as written: wordy phrases and
     formal words from a small table, the idioms plainRewrite knows, rare words that have a
     clearly plainer synonym, a "was … by …" passive turned round, and a long sentence split at
     a joining word. Every edit carries its reason, and nothing inside quotation marks changes
     except a rare word. */

  /* wordy phrases, matched on the words as written; a leading ~ marks a verb that may be
     inflected ("made a decision" → "decided") */
  var WORDY = [
    ["in order to", "to"], ["in order that", "so that"], ["so as to", "to"],
    ["due to the fact that", "because"], ["owing to the fact that", "because"], ["on account of the fact that", "because"],
    ["in light of the fact that", "because"], ["in view of the fact that", "because"], ["for the reason that", "because"],
    ["by virtue of the fact that", "because"],
    ["despite the fact that", "although"], ["in spite of the fact that", "although"], ["regardless of the fact that", "although"],
    ["notwithstanding the fact that", "although"],
    ["as a consequence of", "because of"], ["as a result of", "because of"], ["on account of", "because of"], ["by virtue of", "because of"],
    ["by reason of", "because of"], ["in consequence of", "because of"], ["for the purpose of", "for"],
    ["at this point in time", "now"], ["at this moment in time", "now"], ["at the present time", "now"], ["at the present moment", "now"],
    ["at that point in time", "then"], ["in the near future", "soon"], ["in the not too distant future", "soon"], ["at an early date", "soon"],
    ["until such time as", "until"], ["in the event that", "if"], ["in the absence of", "without"],
    ["a large number of", "many"], ["a great number of", "many"], ["a considerable number of", "many"], ["a great many", "many"],
    ["a great deal of", "a lot of"], ["a small number of", "a few"], ["a sufficient number of", "enough"], ["a number of", "some"],
    ["the vast majority of", "most of"], ["the majority of", "most of"], ["a majority of", "most of"], ["in the majority of cases", "usually"],
    ["in most cases", "usually"], ["in many cases", "often"], ["in some cases", "sometimes"], ["in excess of", "more than"],
    ["prior to", "before"], ["in advance of", "before"], ["previous to", "before"], ["subsequent to", "after"], ["at the conclusion of", "at the end of"],
    ["in the course of", "during"], ["during the course of", "during"], ["for the duration of", "during"],
    ["with regard to", "about"], ["with regards to", "about"], ["in regard to", "about"], ["with respect to", "about"], ["in relation to", "about"],
    ["in reference to", "about"], ["in connection with", "about"], ["as regards", "about"], ["pertaining to", "about"],
    ["the question as to whether", "whether"], ["the question of whether", "whether"], ["as to whether", "whether"], ["whether or not", "whether"],
    ["in the vicinity of", "near"], ["in close proximity to", "near"], ["adjacent to", "next to"], ["by means of", "by"],
    ["on a daily basis", "every day"], ["on a weekly basis", "every week"], ["on a monthly basis", "every month"], ["on a regular basis", "regularly"],
    ["at all times", "always"], ["at no time", "never"], ["in a timely manner", "quickly"],
    ["with the exception of", "except"], ["each and every", "every"], ["any and all", "all"], ["first and foremost", "first"], ["in the first instance", "first"],
    ["one and the same", "the same"],
    ["is able to", "can"], ["are able to", "can"], ["am able to", "can"], ["was able to", "could"], ["were able to", "could"],
    ["is unable to", "cannot"], ["are unable to", "cannot"], ["am unable to", "cannot"], ["was unable to", "could not"], ["were unable to", "could not"],
    ["has the ability to", "can"], ["have the ability to", "can"], ["had the ability to", "could"],
    ["is of the opinion that", "thinks that"], ["are of the opinion that", "think that"], ["am of the opinion that", "think that"],
    ["was of the opinion that", "thought that"], ["were of the opinion that", "thought that"],
    ["is in possession of", "has"], ["are in possession of", "have"], ["was in possession of", "had"], ["were in possession of", "had"],
    ["~make a decision", "~decide"], ["~come to a decision", "~decide"], ["~reach a decision", "~decide"], ["~arrive at a decision", "~decide"],
    ["~come to the conclusion", "~conclude"], ["~reach the conclusion", "~conclude"], ["~arrive at the conclusion", "~conclude"], ["~reach a conclusion", "~conclude"],
    ["~come to an agreement", "~agree"], ["~reach an agreement", "~agree"],
    ["~take into consideration", "~consider"], ["~take into account", "~consider"], ["~give consideration to", "~consider"],
    ["~make an attempt", "~try"], ["~make an effort", "~try"], ["~make use of", "~use"], ["~make mention of", "~mention"], ["~make reference to", "~mention"],
    ["~make an inquiry", "~ask"], ["~make inquiries", "~ask"], ["~give rise to", "~cause"], ["~put an end to", "~end"], ["~bring to an end", "~end"], ["~come to an end", "~end"],
    ["~have a tendency to", "~tend to"], ["~have a discussion about", "~discuss"], ["~have a conversation with", "~talk with"],
    ["~conduct an investigation into", "~investigate"], ["~carry out an investigation into", "~investigate"]
  ].map(function(p){ return { from: p[0].replace(/^~/, "").split(" "), to: p[1].replace(/^~/, ""), verb: p[0].charAt(0) === "~" }; })
   .sort(function(a, b){ return b.from.length - a.from.length; });   /* longest match first */

  /* formal words with an everyday equivalent, by part of speech (verbs and nouns by lemma;
     a noun may give "one|many") */
  var FORMAL = {
    verb: { commence:"begin", utilise:"use", utilize:"use", endeavour:"try", endeavor:"try", terminate:"end", purchase:"buy", obtain:"get", acquire:"get",
      require:"need", demonstrate:"show", indicate:"show", ascertain:"find out", depart:"leave", assist:"help", attempt:"try", cease:"stop", conceal:"hide",
      comprehend:"understand", construct:"build", desire:"want", enquire:"ask", inquire:"ask", inform:"tell", modify:"change", notify:"tell",
      permit:"allow", possess:"have", reside:"live", retain:"keep", select:"choose", perceive:"see", recollect:"remember", ascend:"climb", descend:"go down",
      accompany:"go with", dispatch:"send", transmit:"send", summon:"call", assemble:"gather", converse:"talk", beseech:"beg", entreat:"beg",
      relinquish:"give up", vanquish:"defeat" },
    noun: { assistance:"help", residence:"home", individual:"person|people", remainder:"rest", commencement:"beginning", termination:"end",
      utilisation:"use", utilization:"use", endeavour:"effort", endeavor:"effort", objective:"goal", location:"place", magnitude:"size", velocity:"speed",
      component:"part", expenditure:"spending", alteration:"change", countenance:"face", physician:"doctor", apparel:"clothes|clothes", dwelling:"home",
      abode:"home", conflagration:"fire", sustenance:"food", beverage:"drink", automobile:"car", astonishment:"surprise", amazement:"surprise",
      melancholy:"sadness", felicity:"happiness", affliction:"suffering", perspiration:"sweat", recollection:"memory" },
    adj: { sufficient:"enough", numerous:"many", additional:"extra", initial:"first", subsequent:"later", prior:"earlier", insufficient:"not enough",
      adequate:"enough", inadequate:"not enough", enormous:"huge", immense:"huge", melancholy:"sad", weary:"tired", amiable:"friendly",
      extraordinary:"unusual", remarkable:"unusual", principal:"main", sole:"only", vacant:"empty", prodigious:"huge" },
    adv: { exceedingly:"very", tolerably:"fairly", remarkably:"very", approximately:"about", frequently:"often", consequently:"so", subsequently:"later",
      additionally:"also", furthermore:"also", moreover:"also", nevertheless:"still", nonetheless:"still", therefore:"so",
      hitherto:"until now", forthwith:"at once", henceforth:"from now on", hither:"here", thither:"there", nigh:"near", precisely:"exactly",
      lastly:"finally", alternatively:"instead", peculiarly:"particularly", alfresco:"outside" },
    link: { whilst:"while", amongst:"among", notwithstanding:"despite", regarding:"about", concerning:"about" }
  };
  var POSN = { NOUN: "noun", VERB: "verb", ADJ: "adjective", ADV: "adverb" };
  /* a table entry by word — "constructor" and friends must not find Object.prototype */
  function own(o, k){ return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  var NATION = /^(american|british|english|french|german|spanish|italian|russian|chinese|japanese|indian|irish|scottish|welsh|european|african|asian|christian|jewish|muslim|roman|greek|victorian|dutch|swiss|swedish|polish|turkish|arab|persian|latin)$/;
  var ABBR = set("mr mrs ms dr st prof sr jr vs etc e.g i.e mt fig vol pp inc ltd a.m p.m u.s u.k no");
  /* everyday words the frequency list ranks high because they are also names */
  /* how far to go: light only trades the rarest words, plain is the default, very plain also
     splits, straightens and drops asides, and "for a ten-year-old" shortens what is left,
     expands abbreviations and glosses the words a child would not know */
  var LEVELS = {
    light: { swap: 7000, curated: 7000, wordy: false, passive: false, split: 0 },
    plain: { swap: 4000, curated: 0, wordy: true, passive: true, split: 22 },
    very:  { swap: 3000, curated: 0, wordy: true, passive: true, split: 16, hardSep: true, aside: true, connector: true },
    kid:   { swap: 3000, curated: 0, wordy: true, passive: true, split: 16, hardSep: true, aside: true, connector: true,
             abbr: true, numbers: true, adjectives: true, shorten: true, gloss: 5000 }
  };
  function levelOf(opts){
    var name = typeof opts === "string" ? opts : (opts && opts.level) || "plain";
    return own(LEVELS, name) ? name : "plain";
  }
  /* linking adverbs a plainer text says in one short word */
  var CONNECT = { however: "but", moreover: "also", nevertheless: "still", furthermore: "also", consequently: "so" };
  /* abbreviations written out */
  var ABBREV = [[/\be\.\s?g\./gi, "for example"], [/\bi\.\s?e\./gi, "that is"], [/\betc\./gi, "and so on"]];
  /* a closing subordinate clause that can stand as its own sentence */
  var CUT_SUB = { "although": "though", "though": "though", "whereas": "though", "because": "because" };
  /* numbers spelled out: they need no meaning in brackets */
  var NUMWORD = set("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen first second third fourth fifth sixth seventh eighth ninth tenth half quarter");
  /* where a definition can be cut without leaving a phrase half-said */
  var BREAK = /^(?:of|to|in|on|at|with|for|from|by|as|that|which|who|or|and|but|when|where|into|about|than|through|over|under|like|used|usually|without|upon)$/;
  /* a gloss cut to four words must not end on a joining word */
  var TRAIL = /\s+(?:or|and|of|by|to|in|on|with|for|from|as|at|that|which|the|a|an|is|are|be|being|into|about)$/;
  var NAMEY = set("harry smith mike jack tom bill bob frank pat dick sue ray rob art will grant sherry brandy ruby rose amber pearl daisy lily may june april august carol joy grace faith hope victor dean earl duke roman bush wood woods green brown black white gray grey young king knight cook baker carter mason taylor turner walker ward warren wells west york chase lane hill dale glen rich guy jay drew chuck jimmy tony mac");

  /* the input as sentences: [{ s, e }] over the text; abbreviations, initials and decimals
     do not end one, and a closing quote after the full stop stays with its sentence */
  function splitSentences(text){
    var out = [], re = /[.!?…]+[”’"')\]]*(?=\s|$)/g, m, last = 0;
    while ((m = re.exec(text))){
      var end = m.index + m[0].length;
      var before = text.slice(last, m.index), lastWord = (before.match(/(\S+)$/) || ["", ""])[1].toLowerCase().replace(/^[("“‘]+/, "");
      if (m[0].charAt(0) === "." && m[0].length === 1 && (ABBR[lastWord] || /^[a-z]$/.test(lastWord) || /^\d+$/.test(lastWord))) continue;
      var rest = text.slice(end).replace(/^\s+/, "");
      if (rest && !/^[“"‘'(\[A-ZÀ-Þ0-9]/.test(rest)) continue;
      if (/[A-Za-zÀ-ɏ0-9]/.test(text.slice(last, end))) out.push({ s: last, e: end });
      last = end;
    }
    if (/[A-Za-zÀ-ɏ0-9]/.test(text.slice(last))) out.push({ s: last, e: text.length });
    out.forEach(function(sp){
      var seg = text.slice(sp.s, sp.e);
      sp.s += seg.length - seg.replace(/^\s+/, "").length;
      sp.e -= seg.length - seg.replace(/\s+$/, "").length;
    });
    return out;
  }

  /* which tokens sit inside quotation marks */
  function markQuotes(toks){
    var closer = null;
    toks.forEach(function(t){
      if (t.punct){
        if (!closer && /^[“«‘]$/.test(t.w)) closer = { "“": "”", "«": "»", "‘": "’" }[t.w];
        else if (!closer && t.w === '"') closer = '"';
        else if (closer && t.w === closer) closer = null;
        return;
      }
      t.q = !!closer;
    });
  }
  /* does token i start a sentence, or quoted speech, or follow a colon / dash? */
  function initialAt(toks, i){
    var j = i - 1, seen = "";
    while (j >= 0 && toks[j].punct){ seen += toks[j].w; j--; }
    if (j < 0) return true;
    return /[“"‘«.!?:;—–(]/.test(seen);
  }
  /* an -ed verb is a past participle after have / be, otherwise the past tense */
  function verbForm(t, toks){
    var f = t.form || "base";
    if (f !== "ed") return f;
    var j = t.i - 1;
    while (j >= 0 && (toks[j].tag === "ADV" || toks[j].tag === "NEG")) j--;
    var p = toks[j];
    return (p && p.tag === "AUX" && (HAVE[p.l] || BE[p.l])) ? "pp" : "past";
  }
  function article(word){
    var w = word.toLowerCase();
    if (/^(hour|honest|honour|honor|heir)/.test(w)) return "an";
    if (/^[aeiou]/.test(w) && !/^(uni|use|usu|eu|one|ou)/.test(w)) return "an";
    return "a";
  }
  function decap(text, tok){
    var tg = tok.tag;
    if (/^(DET|PRON|PRONO|NUM|POSS)$/.test(tg) || (tg === "ADJ" && !NATION.test(tok.l))) return text.charAt(0).toLowerCase() + text.slice(1);
    return text;
  }
  /* a spelling variant or the same word family is not a simpler word */
  function sameFamily(a, b){
    if (a === b) return true;
    if (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4)) return true;
    if (Math.abs(a.length - b.length) > 2) return false;
    var d = 0, i = 0, j = 0;
    while (i < a.length && j < b.length){
      if (a.charAt(i) === b.charAt(j)){ i++; j++; continue; }
      d++; if (d > 2) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 2;
  }
  function simpleEdit(src, s, e, to, why){ return { s: s, e: e, parts: [{ text: to, from: src.slice(s, e), why: why }] }; }

  /* a formal word from the table, in the right part of speech and inflected back; a target that
     only fits some positions ("enough" after the verb, "very" before an adjective, "have" never
     in the passive) is used only there */
  function formalSwap(t, toks){
    var w = t.l, lem = t.lemma || w, v, next = toks[t.i + 1], to;
    if (t.tag === "VERB" && own(FORMAL.verb, lem)){
      var form = verbForm(t, toks);
      if (form === "pp" && /^(have|go|live|talk)\b/.test(FORMAL.verb[lem])){
        var p = t.i - 1;
        while (p >= 0 && (toks[p].tag === "ADV" || toks[p].tag === "NEG")) p--;
        if (p >= 0 && toks[p].tag === "AUX" && BE[toks[p].l]) return null;
      }
      return inflectPhrase(FORMAL.verb[lem], form);
    }
    if (t.tag === "NOUN" && (v = own(FORMAL.noun, lem) || own(FORMAL.noun, w))){
      var pair = v.split("|");
      if (!t.plural) return pair[0];
      return pair[1] || (pair[0].indexOf(" ") < 0 ? plural(pair[0]) : null);
    }
    if (t.tag === "ADJ" && own(FORMAL.adj, w) && !t.degree){
      to = FORMAL.adj[w];
      if (/enough$/.test(to) && next && nounish(next)) return null;
      return to;
    }
    if ((t.tag === "ADV" || (/ly$/.test(w) && t.tag !== "VERB")) && own(FORMAL.adv, w)){
      to = FORMAL.adv[w];
      if (/^(very|fairly)$/.test(to) && !(next && (next.tag === "ADJ" || next.tag === "ADV"))) return null;
      return to;
    }
    if (own(FORMAL.link, w) && t.tag !== "VERB" && t.tag !== "NOUN") return FORMAL.link[w];
    return null;
  }
  /* a rare noun or verb's plainer dictionary synonym. The bundled dictionary keeps three senses
     per word in no particular order, so a common word's rare sense looks as good as its main one
     ("firearm" → "piece"); the rule is therefore strict: one everyday word (rank 800–2500, four
     letters or more, not longer than the word, clearly more common) that the word's best sense
     lists, whose own best sense lists the word back, and which has at most two senses as that
     part of speech. A common word with several senses must list the synonym in more than one.
     Adjectives and adverbs are left to the table: their dictionary synonyms are too loose. */
  function dictSwap(t, toks, dict, rank, present, floor){
    if (!(t.tag === "NOUN" || t.tag === "VERB") || t.poss || (t.c && t.c.PROPER)) return null;
    var w = t.l, lem = t.lemma || w;
    if (w.length < 4 || /[^a-zà-ɏ]/.test(w)) return null;
    var wr = Math.min(rank(w), rank(lem));
    if (wr <= (floor || 4000)) return null;
    var entry = dict(lem) || dict(w);
    if (!entry) return null;
    var pos = POSN[t.tag], senses = entry.m.filter(function(m){ return m.p === pos; });
    if (!senses.length) return null;
    var best = bestSense({ m: senses }, pos, rank);
    if (!best) return null;
    var poly = senses.length >= 3 && wr < Infinity;
    var pick = null, pickRank = 2501;
    (best.m.s || []).forEach(function(s){
      if (!/^[a-z]{4,}$/.test(s) || s === lem || s === w || own(present, s) || sameFamily(s, lem) || s.length > lem.length + 2) return;
      var r = rank(s);
      if (r >= pickRank || r <= 800 || r * 2 > wr) return;
      if (poly && senses.filter(function(m){ return (m.s || []).indexOf(s) >= 0; }).length < 2) return;
      if (NAMEY[s]) return;
      var se = dict(s);
      /* a word that is only ever this part of speech, with one or two senses */
      if (!se || se.m.some(function(m){ return m.p !== pos; }) || se.m.length > 2) return;
      var sb = bestSense(se, pos, rank);
      if (!sb || sb.m.p !== pos || (sb.m.s || []).indexOf(lem) < 0) return;
      if (pos === "verb" && !isVerbBase(s, dict)) return;
      pickRank = r; pick = s;
    });
    if (!pick) return null;
    if (t.tag === "VERB") pick = inflect(pick, verbForm(t, toks));
    else if (t.plural) pick = plural(pick);
    return pick;
  }

  /* "The window was broken by the storm" → "The storm broke the window": only the plain
     was / were + participle + by pattern, with a known verb and no negation */
  function passiveEdit(c, toks, src, dict, used){
    if (!(c.passive && c.agent && c.subject && c.pos && c.pos.subj && c.pos.agent)) return null;
    if (c.negative || c.question || c.existential || c.imperative || c.inherited || c.subjectClause || c.kind === "rel" || c.kind === "wh") return null;
    if (!c.tense || c.tense.name !== "past simple, passive voice") return null;
    var s0 = c.pos.subj[0], s1 = c.pos.subj[1], v0 = c.pos.verb[0], v1 = c.pos.verb[1], mi = c.pos.main, b0 = c.pos.agent[0], b1 = c.pos.agent[1];
    if (s1 !== v0 - 1 || mi !== v1 || b0 <= mi) return null;
    var aux = toks[v0], main = toks[mi], j;
    if (aux.tag !== "AUX" || !(aux.l === "was" || aux.l === "were") || main.tag !== "VERB") return null;
    for (j = v0 + 1; j < mi; j++) if (toks[j].tag !== "ADV") return null;
    var lemma = main.lemma;
    if (!lemma || !(IRR[lemma] || VERBS[lemma] || posOf(dict(lemma)).verb)) return null;
    /* what follows the agent must be a plain adverbial or the end, not a list ("by the clerk, the undertaker and…");
       it stays where it is, outside the edit, so its own words can still be simplified */
    var after = toks[b1 + 1];
    if (after && !(after.punct && /^[.!?;:—–”"’)]$/.test(after.w)) && !/^(PREP|ADV|SC)$/.test(after.tag)) return null;
    for (j = s0; j <= b1; j++) if (used[j] || toks[j].q || toks[j].glued) return null;
    var subj = src.slice(toks[s0].s, toks[s1].e), agent = src.slice(toks[b0 + 1].s, toks[b1].e);
    var advs = mi > v0 + 1 ? src.slice(toks[v0 + 1].s, toks[mi - 1].e) + " " : "";
    var middle = b0 > mi + 1 ? " " + src.slice(toks[mi + 1].s, toks[b0 - 1].e) : "";   /* "was broken into pieces by…" */
    var OBJ = { i: "me", he: "him", she: "her", we: "us", they: "them" }, SUBJ = { me: "I", him: "he", her: "she", us: "we", them: "they" };
    if (s0 === s1 && OBJ[toks[s0].l]) subj = OBJ[toks[s0].l];
    if (b1 === b0 + 1 && SUBJ[toks[b1].l]) agent = SUBJ[toks[b1].l];
    if (initialAt(toks, s0)){ agent = cap(agent); subj = decap(subj, toks[s0]); }
    for (j = s0; j <= b1; j++) used[j] = true;
    return simpleEdit(src, toks[s0].s, toks[b1].e, agent + " " + advs + inflect(lemma, "past") + " " + subj + middle, "passive to active");
  }

  /* a clause with a subject whose lone base-form verb is not a mistagged noun: "my Christian
     name Philip" has a singular subject and no -s, so it is no clause */
  function agrees(c, toks){
    if (!c.pos || !c.subject) return false;
    if (!c.pos.subj) return !!c.inherited;          /* "…, but was not convinced" borrows its subject */
    var v0 = c.pos.verb[0], v = toks[v0];
    if (v0 !== c.pos.verb[1] || v.tag !== "VERB" || v.form !== "base") return true;
    var head = toks[c.pos.subj[1]];
    return !!(head.plural || /^(i|you|we|they|these|those|both|all|many|several|few|some|people)$/.test(head.l));
  }
  /* a sentence of more than 22 words is cut where two main clauses meet at "and", "but",
     "so", a semicolon or a dash; "But" and "So" may open the new sentence */
  function splitEdits(clauses, toks, src, used, edits, L){
    var words = toks.filter(function(t){ return !t.punct; }).length;
    if (words <= L.split && !L.hardSep) return;
    var dashes = toks.filter(function(t){ return t.punct && /^[—–]$/.test(t.w) && !used[t.i]; }).length;
    clauses.forEach(function(c, k){
      if (!k || c.fragment || c.kind !== "main" || !c.subject || c.inherited || c.inheritedNext || c.imperative || c.question || c.subjectClause) return;
      if (!c.tense || /participle/.test(c.tense.name)) return;
      var prev = null, j;
      for (j = k - 1; j >= 0 && !prev; j--) if (!clauses[j].fragment && clauses[j].kind === "main") prev = clauses[j];
      if (!prev || !prev.subject || !prev.tense || /participle/.test(prev.tense.name) || prev.imperative || prev.question) return;
      var first = c.span[0], t0 = toks[first], cc = null, sep = null, next;
      if (t0.tag === "CC" && /^(and|but|so)$/.test(t0.l)){ cc = t0; next = toks[first + 1]; }
      else if (first > 0 && toks[first - 1].punct && /^[;—–]$/.test(toks[first - 1].w)){ sep = toks[first - 1]; if (sep.w !== ";" && dashes !== 1) return; next = t0; }
      else return;
      /* a semicolon or a dash between two clauses always becomes a full stop in the plainer
         levels; a joining word waits until the sentence is long */
      if (words <= L.split && !(L.hardSep && sep)) return;
      if (!next || next.punct || next.q || (cc && (cc.q || used[cc.i])) || (sep && sep.q)) return;
      /* both halves must be real clauses whose verb agrees with its subject ("my Christian name
         Philip" is not one), and after a conjunction the new sentence must run straight into its
         subject ("and then nobody in the village could…"): a comma or a verb before it means a list */
      if (!agrees(c, toks) || !agrees(prev, toks)) return;
      if (cc){
        if (!c.pos.subj) return;
        for (j = next.i; j < c.pos.subj[0]; j++) if (toks[j].punct || /^(VERB|AUX|MODAL|CC|SC)$/.test(toks[j].tag)) return;
      }
      var before = toks.slice(0, cc ? cc.i : sep.i).filter(function(t){ return !t.punct; }).length;
      if (before < 3 || words - before < 3) return;
      var mark = cc || sep, pt = toks[mark.i - 1];
      if (!pt || (pt.punct && pt.w !== ",")) return;   /* not after a closing quote or other punctuation */
      var start = pt.punct ? pt.s : pt.e;
      if (cc && cc.l !== "and"){
        edits.push(simpleEdit(src, start, cc.e, ". " + cap(cc.w), "split long sentence"));
        used[cc.i] = true;
        return;
      }
      if (used[next.i]){
        /* the next word already has an edit: fold it in, capitalised */
        var at = -1;
        edits.forEach(function(ed, q){ if (ed.s === next.s) at = q; });
        if (at < 0) return;
        var ed = edits.splice(at, 1)[0];
        ed.parts[0].text = cap(ed.parts[0].text);
        edits.push({ s: start, e: ed.e, parts: [{ text: ".", from: src.slice(start, mark.e), why: "split long sentence" }, { text: " " }].concat(ed.parts) });
      } else {
        edits.push(simpleEdit(src, start, next.e, ". " + cap(next.w), "split long sentence"));
        used[next.i] = true;
      }
      used[mark.i] = true;
    });
  }

  function simplifySentence(src, dict, rank, L){
    var r = explain(src, dict, rank), toks = r.tokens, edits = [], used = {}, present = {}, tail = [], i, j, q;
    markQuotes(toks);
    toks.forEach(function(t){ if (!t.punct){ present[t.l] = 1; if (t.lemma) present[t.lemma] = 1; } });
    function free(a, b){ for (var q = a; q <= b; q++) if (used[q] || toks[q].q || toks[q].glued || toks[q].punct) return false; return true; }
    function take(a, b){ for (var q = a; q <= b; q++) used[q] = true; }
    /* the tokens whose text overlaps a stretch of the source */
    function spanToks(a, b){ return toks.filter(function(t){ return t.e > a && t.s < b; }); }
    /* an edit found by a plain search of the text (abbreviations, big numbers) */
    function rawEdit(re, make, why){
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(src))){
        var a = m.index, b = a + m[0].length, list = spanToks(a, b), ok = list.length > 0;
        list.forEach(function(t){ if (used[t.i] || t.q || t.glued) ok = false; });
        if (!ok) continue;
        var to = make(m, b);
        if (to === null) continue;
        edits.push(simpleEdit(src, a, b, to, why));
        list.forEach(function(t){ used[t.i] = true; });
      }
    }

    /* 1. abbreviations written out, and a number in the millions said in words */
    if (L.abbr) ABBREV.forEach(function(p){
      rawEdit(p[0], function(m, b){ return p[1] + (/^[\s”’")\]]*$/.test(src.slice(b)) ? "." : ""); }, "abbreviation");
    });
    if (L.numbers) rawEdit(/\b\d[\d,]*(?:\.\d+)?\b/g, function(m){
      var n = parseFloat(m[0].replace(/,/g, ""));
      if (!(n >= 1000000)) return null;
      var big = n >= 1e9, unit = big ? 1e9 : 1e6, v = n / unit;
      var d = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
      return (Math.abs(d * unit - n) < 0.5 ? "" : "about ") + d + " " + (big ? "billion" : "million");
    }, "shortened");

    /* 2. linking adverbs in one short word */
    if (L.connector) toks.forEach(function(t){
      if (t.punct || used[t.i] || t.q || t.glued) return;
      var to = own(CONNECT, t.l);
      if (!to || t.tag === "NOUN" || t.tag === "VERB") return;
      var end = t.e, last = t.i;
      if (initialAt(toks, t.i)){
        to = cap(to);
        var nx = toks[t.i + 1];
        if (nx && nx.punct && nx.w === ","){ end = nx.e; last = nx.i; }
      }
      edits.push(simpleEdit(src, t.s, end, to, "connector"));
      take(t.i, last);
    });

    /* 3. wordy phrases and idioms */
    if (L.wordy) for (i = 0; i < toks.length; i++){
      var t = toks[i];
      if (t.punct || used[t.i] || t.q || t.glued) continue;
      for (var k = 0; k < WORDY.length; k++){
        var p = WORDY[k], n = p.from.length, ok = i + n <= toks.length && free(i, i + n - 1);
        for (j = 0; j < n && ok; j++){
          var u = toks[i + j];
          if (j === 0 && p.verb) ok = u.tag === "VERB" && u.lemma === p.from[0];
          else ok = u.l === p.from[j];
        }
        if (!ok || (toks[i + n] && toks[i + n].glued)) continue;
        var to = p.verb ? inflectPhrase(p.to, verbForm(t, toks)) : p.to;
        if (isCap(t.w) && initialAt(toks, i)) to = cap(to);
        edits.push(simpleEdit(src, t.s, toks[i + n - 1].e, to, n > 1 ? "shorter phrase" : "rarer word"));
        take(i, i + n - 1);
        break;
      }
    }
    r.expressions.forEach(function(e){
      if (e.split || e.kind !== "idiom" || !free(e.start, e.end)) return;
      var t = toks[e.start], x = exprText(e, t, toks, dict, rank), rep = x.text, rw = rep.toLowerCase().split(" ");
      if (!x.synonym && (rw.length > 3 || rw.length >= e.end - e.start + 1)) return;
      if (rw.some(function(w){ return rank(w.replace(/[^a-z]/g, "")) > 3000; })) return;
      if (isCap(t.w) && initialAt(toks, e.start)) rep = cap(rep);
      edits.push(simpleEdit(src, t.s, toks[e.end].e, rep, "idiom"));
      take(e.start, e.end);
    });

    /* 4. an aside in brackets or between dashes: its own sentence when it has a verb, else gone */
    if (L.aside){
      var pairs = [], openAt = -1, dashAt = -1;
      for (i = 0; i < toks.length; i++){
        if (!toks[i].punct) continue;
        if (toks[i].w === "("){ openAt = i; continue; }
        if (toks[i].w === ")"){ if (openAt >= 0 && i > openAt + 1) pairs.push([openAt, i]); openAt = -1; continue; }
        if (/^[—–]$/.test(toks[i].w)){
          if (dashAt < 0) dashAt = i;
          else if (i > dashAt + 1){ pairs.push([dashAt, i]); dashAt = -1; }
        }
      }
      pairs.forEach(function(pr){
        var a = pr[0], b = pr[1], mid = [], ok = a > 0, x;
        for (x = a; x <= b; x++){
          if (used[x] || toks[x].q) ok = false;
          if (x > a && x < b && !toks[x].punct) mid.push(toks[x]);
        }
        if (!ok || !mid.length) return;
        /* "which nobody expected" describes the noun before it: it stays where it is */
        if (/^(REL|WH|SC|CC)$/.test(mid[0].tag) || REL[mid[0].l] || WH[mid[0].l] || SUB[mid[0].l] || CC[mid[0].l]) return;
        var from = src.slice(toks[a].s, toks[b].e), at = toks[a - 1].e;
        if (mid.some(function(m){ return m.tag === "VERB" || m.tag === "AUX" || m.tag === "MODAL"; })){
          var body = src.slice(toks[a + 1].s, toks[b - 1].e).replace(/^[\s,;:—–-]+/, "").replace(/[\s,;:—–-]+$/, "");
          if (!body) return;
          edits.push({ s: at, e: toks[b].e, parts: [{ text: "" }] });
          tail.push({ from: from, text: " " + cap(body) + "." });
        } else {
          edits.push(simpleEdit(src, at, toks[b].e, "", "aside removed"));
        }
        for (x = a; x <= b; x++) used[x] = true;
      });
    }

    /* 5. stacked adjectives: the commonest one carries the meaning */
    if (L.adjectives){
      i = 0;
      while (i < toks.length){
        if (toks[i].tag !== "ADJ"){ i++; continue; }
        var run = [toks[i]], at2 = i + 1;
        for (;;){
          var sk = at2;
          while (toks[sk] && ((toks[sk].punct && toks[sk].w === ",") || (toks[sk].tag === "CC" && toks[sk].l === "and"))) sk++;
          if (toks[sk] && toks[sk].tag === "ADJ"){ run.push(toks[sk]); at2 = sk + 1; continue; }
          break;
        }
        var head = toks[at2], a0 = run[0], aN = run[run.length - 1], okRun = run.length >= 2 && !!head && head.tag === "NOUN";
        for (q = a0.i; q <= aN.i && okRun; q++) if (used[q] || toks[q].q || toks[q].glued) okRun = false;
        if (okRun){
          var keep = a0;
          run.forEach(function(x){ if (Math.min(rank(x.l), rank(x.lemma || x.l)) < Math.min(rank(keep.l), rank(keep.lemma || keep.l))) keep = x; });
          var word = keep.w, from2 = a0.s, prev2 = toks[a0.i - 1];
          if (isCap(a0.w) && initialAt(toks, a0.i)) word = cap(word);
          if (prev2 && prev2.tag === "DET" && /^(a|an)$/.test(prev2.l) && !used[prev2.i] && article(word) !== prev2.l){
            var art2 = article(word);
            word = (isCap(prev2.w) ? cap(art2) : art2) + src.slice(prev2.e, a0.s) + word;
            from2 = prev2.s; used[prev2.i] = true;
          }
          edits.push(simpleEdit(src, from2, aN.e, word, "shortened"));
          for (q = a0.i; q <= aN.i; q++) used[q] = true;
        }
        i = at2 > i ? at2 : i + 1;
      }
    }

    /* 6. a passive turned round */
    if (L.passive) r.clauses.forEach(function(c){ var ed = passiveEdit(c, toks, src, dict, used); if (ed) edits.push(ed); });

    /* 7. rare and formal words (names, numbers and short words are left alone) */
    toks.forEach(function(t){
      if (t.punct || used[t.i] || t.glued || (toks[t.i + 1] && toks[t.i + 1].glued)) return;
      if (t.tag === "NUM" || t.tag === "PROPER" || t.tag === "POSS" || (t.c && t.c.NUM)) return;
      if (isCap(t.w) && !initialAt(toks, t.i)) return;
      /* the light touch trades only the words almost nobody meets */
      if (L.curated && Math.min(rank(t.l), rank(t.lemma || t.l)) <= L.curated) return;
      var to = formalSwap(t, toks) || dictSwap(t, toks, dict, rank, present, L.swap);
      if (!to || (to.indexOf(" ") < 0 && own(present, to.toLowerCase()))) return;
      if (isCap(t.w)) to = cap(to);
      var s = t.s, prev = toks[t.i - 1];
      if (prev && prev.tag === "DET" && /^(a|an)$/.test(prev.l) && !used[prev.i] && article(to) !== prev.l){
        var art = article(to);
        to = (isCap(prev.w) ? cap(art) : art) + src.slice(prev.e, t.s) + to;
        s = prev.s; used[prev.i] = true;
      }
      edits.push(simpleEdit(src, s, t.e, to, "rarer word"));
      used[t.i] = true;
    });

    /* 8. a long sentence split in two */
    if (L.split || L.hardSep) splitEdits(r.clauses, toks, src, used, edits, L);

    /* 9. a closing subordinate clause stands as its own sentence */
    if (L.shorten) (function(){
      var clauses = r.clauses, last = null, k, x;
      for (k = 0; k < clauses.length; k++) if (!clauses[k].fragment) last = clauses[k];
      var c = last;
      if (!c || c.kind !== "sub" || !c.subject || !c.pos || !c.pos.subj || c.inherited) return;
      var a = c.span[0], sc = toks[a];
      if (!sc || sc.tag !== "SC" || c.span[1] - a < 3) return;
      var word = own(CUT_SUB, sc.l);
      if (!word) return;
      var pre = toks[a - 1];
      if (!pre) return;
      var at, first = a;
      if (pre.punct && /^[,;]$/.test(pre.w)){ if (!toks[a - 2]) return; at = toks[a - 2].e; first = a - 1; }
      else if (pre.punct) return;
      else at = pre.e;
      for (x = first; x <= a; x++) if (used[x] || toks[x].q) return;
      var nx = toks[a + 1];
      if (!nx || nx.punct || used[nx.i] || nx.q) return;
      if (word === "because") edits.push(simpleEdit(src, at, sc.e, ". That is because", "shortened"));
      else {
        edits.push(simpleEdit(src, at, nx.e, ". " + cap(nx.w), "shortened"));
        used[nx.i] = true;
        var fin = toks[toks.length - 1];
        if (fin && fin.punct && fin.w === "." && !used[fin.i]){
          edits.push(simpleEdit(src, fin.s, fin.e, ", though.", "shortened"));
          used[fin.i] = true;
        }
      }
      for (x = first; x <= a; x++) used[x] = true;
    })();

    /* 10. what is left that a ten-year-old would not know keeps a short meaning in brackets */
    if (L.gloss){
      var glossed = {};
      toks.forEach(function(t){
        if (t.punct || used[t.i] || t.glued || (toks[t.i + 1] && toks[t.i + 1].glued)) return;
        if (!/^(NOUN|VERB|ADJ|ADV)$/.test(t.tag) || t.poss || (t.c && t.c.PROPER)) return;
        if ((t.c && t.c.NUM) || NUMWORD[t.l] || NUMWORD[t.lemma || t.l]) return;   /* "thirty" needs no meaning */
        if (isCap(t.w) && !initialAt(toks, t.i)) return;
        var lem = t.lemma || t.l;
        if (glossed[lem] || lem.length < 4 || NAMEY[t.l] || /[^a-zà-ɏ]/.test(t.l)) return;
        if (rank(lem) <= L.gloss) return;
        var entry = dict(lem) || dict(t.l), pos = POSN[t.tag];
        /* "was tired" reads as a description, not as the verb "tire": take the adjective the
           dictionary lists for the word as written */
        if (t.tag === "VERB" && verbForm(t, toks) === "pp"){
          var adj = dict(t.l);
          if (adj && adj.m.some(function(m){ return m.p === "adjective"; })){ entry = adj; pos = "adjective"; lem = t.l; }
        }
        /* morph.js carries a plain meaning for seven hundred everyday words, written because the
           dictionary's own first sense is so often an odd one ("predict: indicate by signs").
           It is only there once word parts have been loaded, so the dictionary still answers. */
        var curated = CURATED(lem);
        if (!entry && !curated) return;
        /* a gloss is read as the meaning, so it is only offered where it can be trusted: a
           curated plain meaning, or a word the dictionary gives exactly one sense of for this
           part of speech. Where it lists several and nothing says which is meant here, guessing
           puts "patience (= a card game)" in front of a child; saying nothing is better. */
        if (!curated){
          var fits = entry.m.filter(function(m){ return !m.p || m.p === pos; });
          if (fits.length !== 1) return;
        }
        var best = curated ? { d: curated, m: { p: pos } } : bestSense(entry, pos, rank);
        /* a sense of another part of speech is not this word's meaning here */
        if (!best || !best.d || !best.m || (best.m.p && best.m.p !== pos)) return;
        /* a gloss is read inline, so it has to be short — and a dictionary sense cut short stops
           meaning what it meant ("clergyman (= a member)", "laughing (= make the sound)"), so a
           sense is either short enough to be given whole or it is not given at all. The curated
           meanings are written to this length; the four that run long are cut at a joining word */
        var full = best.d.split(" "), cap = curated ? 10 : 6;
        if (full.length > cap) {
          if (!curated) return;
          var n = cap;
          if (!BREAK.test(full[n])){
            while (n > 1 && !BREAK.test(full[n - 1])) n--;
            if (n > 1) n--;
          }
          full = full.slice(0, n);
        }
        var d = full.join(" ").replace(/[\s,;:.]+$/, "");
        while (d && TRAIL.test(d)) d = d.replace(TRAIL, "");
        if (!d || sameFamily(d.toLowerCase(), lem)) return;
        /* one word explains nothing ("ancestors (= someone)") */
        if (d.split(" ").length < 2) return;
        /* and a gloss built out of the word it explains explains nothing
           ("photosynthesis (= synthesis of compounds)"); the word as written is checked too,
           since a lemma can come back clipped */
        var self = [lem, t.l];
        if (d.toLowerCase().split(/[^a-zà-ɏ]+/).some(function(x){
              if (x.length < 5) return false;
              return self.some(function(w){ return w.indexOf(x) >= 0 || x.indexOf(w) >= 0; });
            })) return;
        glossed[lem] = 1;
        edits.push(simpleEdit(src, t.s, t.e, t.w + " (= " + d + ")", "glossed"));
        used[t.i] = true;
      });
    }

    /* an aside with a verb follows the sentence it came from */
    if (tail.length){
      var parts = /[.!?…]["'”’)\]]*\s*$/.test(src) ? [] : [{ text: "." }];
      tail.forEach(function(x){ parts.push({ text: x.text, from: x.from, why: "shortened" }); });
      edits.push({ s: src.length, e: src.length, parts: parts });
    }

    /* apply the edits to the original text, recording where each change landed */
    edits.sort(function(a, b){ return a.s - b.s; });
    var out = "", pos = 0, changes = [];
    edits.forEach(function(ed){
      if (ed.s < pos) return;
      out += src.slice(pos, ed.s);
      ed.parts.forEach(function(pt){
        if (pt.why) changes.push({ from: pt.from, to: pt.text, start: out.length, end: out.length + pt.text.length, why: pt.why });
        out += pt.text;
      });
      pos = ed.e;
    });
    out += src.slice(pos);
    return { text: out, changes: changes };
  }

  /* the text, and how far to go: opts is a level name or { level } — light, plain (the
     default), very or kid */
  function simplify(text, dict, rank, opts){
    text = String(text || "");
    rank = rank || function(){ return Infinity; };
    var name = levelOf(opts), L = LEVELS[name];
    var spans = splitSentences(text), out = "", changes = [], pos = 0;
    spans.forEach(function(sp){
      out += text.slice(pos, sp.s);
      var r = simplifySentence(text.slice(sp.s, sp.e), dict, rank, L), base = out.length;
      r.changes.forEach(function(c){ c.start += base; c.end += base; changes.push(c); });
      out += r.text;
      pos = sp.e;
    });
    out += text.slice(pos);
    return { text: out, changes: changes, sentences: spans.length, level: name };
  }

  /* ---------- public ---------- */
  function explain(sentence, dict, rank){
    rank = rank || function(){ return Infinity; };
    var toks = tag(tokenize(sentence), dict);
    toks.forEach(function(t, i){ t.next = toks[i+1] || null; });
    var clauses = splitClauses(toks);
    var analysed = [], prev = null;
    clauses.forEach(function(cl){
      var a = analyseClause(cl, dict, prev);
      analysed.push(a);
      if (!a.fragment) prev = a;
    });
    for (var h = 0; h + 1 < analysed.length; h++){
      var c0 = analysed[h], c1 = analysed[h+1];
      if (!c0.fragment && !c0.subject && !c1.fragment && c1.subject && c0.tense && /participle/.test(c0.tense.name)){ c0.subject = c1.subject; c0.inheritedNext = true; }
    }
    var merged = [];
    for (var i = 0; i < analysed.length; i++){
      var a = analysed[i];
      if (a.fragment){
        var target = analysed[i+1] && !analysed[i+1].fragment ? analysed[i+1] : (merged.length ? merged[merged.length-1] : null);
        if (target){ target.extras.unshift({ label: a.phrase && /^(in|on|at|after|before|during|by|until|since|from|through|over|under|behind|beyond|near|across|along|inside|outside|within|throughout|for|with|without|despite|toward|towards|into|onto|between|among|around|beside|below|above|beneath|of)\b/i.test(a.phrase) ? "setting" : "aside", text: a.phrase }); continue; }
      }
      merged.push(a);
    }
    var exprs = findExpressions(toks, dict, rank);
    var plain = plainRewrite(toks, exprs, dict, rank);
    /* words worth glossing: not everyday, not names, not already covered by an expression */
    var covered = {};
    exprs.forEach(function(e){ if (e.kind !== "possible idiom") for (var k = e.start; k <= e.end; k++) covered[k] = 1; });
    var seen = {}, keywords = [];
    toks.forEach(function(t){
      if (!/^(NOUN|VERB|ADJ|ADV)$/.test(t.tag) || covered[t.i] || t.poss) return;
      var lem = t.lemma || t.l;
      if (seen[lem] || t.l.length < 3) return;
      if (rank(t.l) <= 2500 || rank(lem) <= 2500) return;
      seen[lem] = 1;
      keywords.push({ word: t.w, lemma: lem, pos: { NOUN: "noun", VERB: "verb", ADJ: "adjective", ADV: "adverb" }[t.tag] });
    });
    var src = String(sentence == null ? "" : sentence);
    var figs = figurative(toks, merged, exprs, src, rank);
    return { tokens: toks, clauses: merged, expressions: exprs, plain: plain, keywords: keywords.slice(0, 8),
             style: { figurative: figs, register: registerOf(toks, merged, figs, src) } };
  }

  window.llExplain = { explain: explain, rank: rank, tokenize: tokenize, tag: tag, inflect: inflect, lemmas: lemmas, cleanDef: cleanDef, bestSense: bestSense,
                       simplify: simplify, splitSentences: splitSentences };
})();
