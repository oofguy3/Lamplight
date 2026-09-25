/* lamplight — who speaks each line, a voice per character, and read aloud with ElevenLabs or natural (Kokoro) voices (see llAudiobook) */
/* ============================================================
   Lamplight — read aloud with several voices
   Works out who speaks each line on the device (the dialogue units
   Speak builds, speech-verb tags, pronouns and turn-taking), casts a
   device voice for every character (the "A voice per character"
   setting of the built-in engine), and registers two engines with Speak
   (app.js) that play clips: "eleven" — a narrator voice plus a voice per
   character from api.elevenlabs.io with the reader's own key — and
   "kokoro" ("Natural voices") — the Kokoro-82M model run on this device
   in workers/kokoro-worker.js after a one-time download. Both make their
   clips a little ahead of playback and keep every clip in IndexedDB so
   replaying costs nothing; the two differ only in where a clip comes from
   (SRC below).
   window.llAudiobook.attribute(units) and .castDevice(cast, voices, opts)
   are the pure steps; .deviceCast(units, ctx, opts) is what Speak's
   device engine calls.
   ============================================================ */
(function(){
  "use strict";
  var LL = window.__ll || {};
  var Store = LL.Store || { get: function(){ return null; }, set: function(){}, remove: function(){} };
  var Library = LL.Library, Marks = LL.Marks, Speak = LL.Speak, Side = LL.Side, state = LL.state;

  var API = "https://api.elevenlabs.io";
  var K_KEY = "ll_elevenkey", K_MODEL = "ll_eleven_model", K_NARR = "ll_eleven_narrator", K_VOICES = "ll_eleven_voices";
  var MODELS = ["eleven_multilingual_v2", "eleven_v3", "eleven_flash_v2_5"];
  var MAX_CLIP = 900;                   /* characters per request */
  var CONTEXT = 300;                    /* previous_text / next_text for continuity */
  var INFLIGHT = 2, AHEAD = 2;          /* requests at once, clips fetched ahead of playback */
  var VOICES_TTL = 24 * 60 * 60 * 1000;
  /* natural voices: the Kokoro model in the worker, where the browser keeps it, and the clips kept on the device */
  var K_KNARR = "ll_kokoro_narrator", KOKORO_MODEL = "kokoro-82m-q8", KOKORO_MB = 95;
  var KOKORO_CACHES = ["transformers-cache", "kokoro-voices"];    /* Cache Storage: the model files, the voice files */
  var AUDIO_CAP = 400 * 1024 * 1024;    /* clips kept in IndexedDB across all documents; the oldest go first */

  /* ============================================================
     1. Who speaks — offline heuristics (no network, no DOM)
     ============================================================ */
  var VERB_FORMS = ("say says said ask asks asked reply replies replied answer answers answered whisper whispers whispered " +
    "shout shouts shouted cry cries cried call calls called mutter mutters muttered murmur murmurs murmured exclaim exclaims exclaimed " +
    "add adds added continue continues continued laugh laughs laughed sigh sighs sighed snap snaps snapped growl growls growled " +
    "hiss hisses hissed breathe breathes breathed repeat repeats repeated insist insists insisted demand demands demanded " +
    "suggest suggests suggested observe observes observed remark remarks remarked protest protests protested agree agrees agreed " +
    "admit admits admitted announce announces announced begin begins began echo echoes echoed offer offers offered plead pleads pleaded " +
    "prompt prompts prompted urge urges urged warn warns warned wonder wonders wondered yell yells yelled scream screams screamed " +
    "sob sobs sobbed gasp gasps gasped grumble grumbles grumbled groan groans groaned moan moans moaned mumble mumbles mumbled " +
    "stammer stammers stammered tease teases teased spit spits spat retort retorts retorted interrupt interrupts interrupted " +
    "inquire inquires inquired declare declares declared explain explains explained argue argues argued confess confesses confessed " +
    "promise promises promised respond responds responded tell tells told order orders ordered think thinks thought muse muses mused")
    .split(" ").concat(["go on", "goes on", "went on", "cut in", "cuts in", "put in", "puts in", "chime in", "chimes in", "chimed in"]);
  VERB_FORMS.sort(function(a, b){ return b.length - a.length; });
  var VERB = "(?:" + VERB_FORMS.join("|") + ")";
  var TITLE = "(?:Mr|Mrs|Ms|Dr|Miss|Aunt|Uncle|Captain|Lord|Lady|Sir)\\.?\\s+";
  var WORD = "[A-Z][a-z\\u00C0-\\u024F'\\u2019-]+";
  var NAME = "((?:" + TITLE + ")?" + WORD + "(?:\\s+" + WORD + "){0,2})";
  var ADV = "(?:[a-z]+ly\\s+)?";
  var RX = {
    nameVerb: new RegExp(NAME + "\\s+" + ADV + "\\b(" + VERB + ")\\b", "g"),
    verbName: new RegExp("\\b(" + VERB + ")\\s+" + ADV + NAME, "g"),
    pronVerb: new RegExp("\\b(he|she|they|He|She|They|I)\\s+" + ADV + "\\b(" + VERB + ")\\b", "g"),
    verbPron: new RegExp("\\b(" + VERB + ")\\s+(he|she|they|I)\\b", "g"),
    /* narration that ends by introducing the quote: `Anna said, “` */
    tagEnd: new RegExp("\\b" + VERB + "\\s*[,:]?\\s*$"),
    /* a word broken across two lines of PDF text: "Ba-\nker" */
    softHyphen: /([a-z])-\s+(?=[a-z])/g,
    /* a quote that ends in a full stop (its closing mark may be there or, in a dialogue unit, left out) */
    fullStop: /[.…]["”’»]?$/,
    capital: /^\s*[A-Z]/,
    title: new RegExp("^" + TITLE),
    male: /\b(he|him|his|himself)\b/gi,
    female: /\b(she|her|hers|herself)\b/gi,
    sentenceEnd: /[.!?…]+["”’)]*(?:\s+|$)/g,
    letter: /[A-Za-zÀ-ɏ]/,
    abbrev: /(?:^|[\s"“(])(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Capt|Lt|Sgt)$/
  };
  /* sentence-initial words that look like names but are not */
  var STOP = {};
  ("The A An He She They I It But And Then When There This That What Who Yes No Oh Well Now So If In On At As Her His Their Our My Your Its " +
   "One Two Three Four Five Six Seven Eight Nine Ten Of To For With From By Or Nor Not All Some Any Each Every Both Either Neither Such Very Just Only Even " +
   "Still Yet Also Too Again Here Where Why How Which Whom Whose Whatever Whoever Once Twice Before After While Since Until Because Though Although Unless " +
   "Whether Perhaps Maybe Indeed Instead Meanwhile However Therefore Thus Otherwise Anyway Besides Finally First Last Next Nothing Something Anything " +
   "Everything Nobody Somebody Anybody Everybody None Never Always Sometimes Often Soon Later Today Tomorrow Yesterday Tonight Ah Ha Hey Hush Look Listen " +
   "Come Wait Stop Please Thank Thanks Sorry Good God Dear Right Okay Ok Sure Fine Great Hello Goodbye Hi Suddenly Slowly Quickly Quietly Softly Loudly Mr Mrs Ms Dr Miss")
    .split(" ").forEach(function(w){ STOP[w] = 1; });
  var SYNTH = { he: ["He", "male"], she: ["She", "female"], they: ["They", "unknown"], "other-1": ["Another voice", "unknown"], "unknown-1": ["Unknown speaker", "unknown"] };

  var STYLES = [
    { open: "“", close: "”", rx: /“/g },
    { open: '"', close: '"', rx: /"/g },
    { open: "‘", close: "’", rx: /‘/g },
    { open: "«", close: "»", rx: /«/g }
  ];
  /* the document's quote style: the most frequent kind of opening mark */
  function pickStyle(texts){
    var counts = [0, 0, 0, 0], i, j;
    for (i = 0; i < texts.length; i++) for (j = 0; j < 4; j++) counts[j] += (texts[i].match(STYLES[j].rx) || []).length;
    counts[1] = counts[1] / 2;
    var best = 0;
    for (j = 1; j < 4; j++) if (counts[j] > counts[best]) best = j;
    return counts[best] > 0 ? STYLES[best] : null;
  }
  /* quoted spans in a paragraph's text (units that came without dialogue flags); an unbalanced quote runs to the end */
  function findQuotes(text, style){
    var out = [], open = -1, i, c;
    for (i = 0; i < text.length; i++){
      c = text.charAt(i);
      if (open < 0){ if (c === style.open) open = i; }
      else if (c === style.close){
        /* a ’ between two letters is an apostrophe, not a closing quote */
        if (c === "’" && RX.letter.test(text.charAt(i - 1)) && RX.letter.test(text.charAt(i + 1))) continue;
        out.push({ s: open, e: i + 1 }); open = -1;
      }
    }
    if (open >= 0) out.push({ s: open, e: text.length });
    return out;
  }
  /* a full stop after "Mr" or "Dr" does not end the sentence */
  function abbreviated(text, m){ return m[0].charAt(0) === "." && RX.abbrev.test(text.slice(0, m.index)); }
  function sentenceHead(text){
    var m;
    RX.sentenceEnd.lastIndex = 0;
    while ((m = RX.sentenceEnd.exec(text))){
      if (!abbreviated(text, m)) return text.slice(0, m.index + m[0].length);
      if (!m[0].length) RX.sentenceEnd.lastIndex++;
    }
    return text.slice(0, 120);
  }
  function sentenceTail(text){
    var m, from = 0;
    RX.sentenceEnd.lastIndex = 0;
    while ((m = RX.sentenceEnd.exec(text))){
      if (!abbreviated(text, m)) from = m.index + m[0].length;
      if (!m[0].length) RX.sentenceEnd.lastIndex++;
    }
    return text.slice(from);
  }
  function cleanName(raw){
    var toks = raw.replace(RX.title, "").split(/\s+/).map(function(t){ return t.replace(/-$/, ""); });
    while (toks.length && STOP[toks[0]]) toks.shift();
    while (toks.length && STOP[toks[toks.length - 1]]) toks.pop();
    if (!toks.length) return null;
    var name = toks.join(" ");
    return { name: name, key: name.toLowerCase().replace(/’/g, "'") };
  }
  /* the speech tag nearest the quote in a piece of narration (NAME VERB, VERB NAME, PRONOUN VERB, VERB PRONOUN);
     side is "after" when the text follows the quote and "before" when it precedes it */
  function tagIn(text, side){
    if (!text) return null;
    text = text.replace(RX.softHyphen, "$1");
    var found = [], best = null, m, nm, i, j;
    function add(kind, m, tag, verbAt){ tag.src = text; found.push({ kind: kind, at: m.index, end: m.index + m[0].length, verbAt: verbAt, tag: tag }); }
    RX.nameVerb.lastIndex = 0;
    while ((m = RX.nameVerb.exec(text))){ nm = cleanName(m[1]); if (nm) add(0, m, nm, m.index + m[0].length - m[2].length); }
    RX.verbName.lastIndex = 0;
    while ((m = RX.verbName.exec(text))){ nm = cleanName(m[2]); if (nm) add(1, m, nm, m.index); }
    RX.pronVerb.lastIndex = 0;
    while ((m = RX.pronVerb.exec(text))) add(2, m, { pronoun: m[1].toLowerCase() }, m.index + m[0].length - m[2].length);
    RX.verbPron.lastIndex = 0;
    while ((m = RX.verbPron.exec(text))) add(3, m, { pronoun: m[2].toLowerCase() }, m.index);
    for (i = 0; i < found.length; i++){
      var f = found[i], skip = false;
      /* "she asked Anna": the subject before the verb speaks, the name after it is spoken to */
      if (f.kind === 1 || f.kind === 3) for (j = 0; j < found.length && !skip; j++) skip = (found[j].kind === 0 || found[j].kind === 2) && found[j].verbAt === f.verbAt;
      if (skip) continue;
      if (!best){ best = f; continue; }
      var nearer = side === "before" ? f.end > best.end : f.at < best.at;
      var same = side === "before" ? f.end === best.end : f.at === best.at;
      if (nearer || (same && f.kind < best.kind)) best = f;
    }
    return best ? best.tag : null;
  }
  function count(rx, text){ rx.lastIndex = 0; return (text.match(rx) || []).length; }

  /* units: [{ start, end, text, para?, page?, dialogue? }] in reading order (Speak's units). A unit built by
     Speak is either a quoted line (dialogue: true, the quote marks left out of its text) or narration; a
     list without dialogue flags (text that arrived some other way) has its quotes found in the text.
     Returns { units: [ [ {start, end, text, role} ... ] per unit ], roles: [ role per unit ],
               cast: [ {key, name, gender, lines, synthetic} ] } */
  function attribute(units){
    var n = units ? units.length : 0, segs = new Array(n), roles = new Array(n), i, j, k, u, p, q;
    if (!n) return { units: [], roles: [], cast: [] };
    var chars = {}, order = [], flagged = false;
    for (i = 0; i < n && !flagged; i++) flagged = !!(units[i] && units[i].dialogue !== undefined);
    function character(key, name){
      var c = chars[key];
      if (!c){ c = chars[key] = { key: key, name: name, gender: "unknown", m: 0, f: 0, lines: 0, synthetic: false }; order.push(key); }
      else if (name && name.length > c.name.length) c.name = name;
      return c;
    }
    function synthetic(key){
      if (!chars[key]){ var c = character(key, SYNTH[key][0]); c.gender = SYNTH[key][1]; c.synthetic = true; }
      return key;
    }

    /* paragraphs: runs of units with the same page and paragraph offset */
    var paras = [], cur = null;
    for (i = 0; i < n; i++){
      u = units[i] || {};
      var pk = (u.page || 0) + ":" + (u.para === undefined ? "u" + i : u.para);
      if (!cur || pk !== cur.pk){ cur = { pk: pk, units: [], base: [], text: "", quotes: [] }; paras.push(cur); }
      if (cur.text) cur.text += " ";
      cur.base.push(cur.text.length);
      cur.units.push(i);
      cur.text += String(u.text || "");
    }
    var style = flagged ? null : pickStyle(paras.map(function(x){ return x.text; }));

    /* pass 1: quotes, their explicit tags, and gender votes for named speakers */
    for (k = 0; k < paras.length && (flagged || style); k++){
      p = paras[k];
      if (flagged){
        /* a quote is a run of dialogue units with no narration between them */
        for (i = 0; i < p.units.length; i++){
          u = units[p.units[i]] || {};
          var ue = p.base[i] + String(u.text || "").length;
          if (!u.dialogue) continue;
          var lastQ = p.quotes[p.quotes.length - 1];
          if (lastQ && lastQ.until === i - 1){ lastQ.e = ue; lastQ.until = i; }
          else p.quotes.push({ s: p.base[i], e: ue, until: i });
        }
      } else p.quotes = findQuotes(p.text, style);
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        var after = sentenceHead(p.text.slice(q.e, i + 1 < p.quotes.length ? p.quotes[i + 1].s : p.text.length));
        var before = sentenceTail(p.text.slice(i > 0 ? p.quotes[i - 1].e : 0, q.s).slice(-80));
        var tb = tagIn(before, "before"), ta = null;
        if (tb && RX.tagEnd.test(before)) q.tag = tb;      /* "Anna said, “…”" introduces the quote */
        else {
          /* "“Hello.” He laughed." — after a full stop inside the quote a capitalised sentence is an action, not its tag */
          if (!(RX.fullStop.test(p.text.slice(q.s, q.e)) && RX.capital.test(after))) ta = tagIn(after, "after");
          q.tag = ta || tb;
        }
        if (q.tag && q.tag.key){
          var ch = character(q.tag.key, q.tag.name);
          ch.m += count(RX.male, q.tag.src); ch.f += count(RX.female, q.tag.src);
        }
      }
    }
    /* "Tom Baker" and "Tom" are one person */
    var alias = {};
    order.slice().forEach(function(key){
      var toks = key.split(" ");
      if (toks.length < 2) return;
      var target = chars[toks[0]] ? toks[0] : chars[toks[toks.length - 1]] ? toks[toks.length - 1] : null;
      if (!target || target === key) return;
      alias[key] = target;
      var a = chars[key], b = chars[target];
      b.m += a.m; b.f += a.f; if (a.name.length > b.name.length) b.name = a.name;
      delete chars[key]; order.splice(order.indexOf(key), 1);
    });
    function keyOf(key){ return alias[key] || key; }
    order.forEach(function(key){ var c = chars[key]; c.gender = c.m > c.f ? "male" : c.f > c.m ? "female" : "unknown"; });

    /* pass 2: who says each quote */
    var recent = [];
    function lastOfGender(g){
      for (var r = recent.length - 1, seen = 0; r >= 0 && seen < 8; r--, seen++){
        var c = chars[recent[r].key];
        if (c && c.gender === g) return c.key;
      }
      return null;
    }
    function resolvePronoun(pr){
      if (pr === "i") return "narrator";
      var g = pr === "he" ? "male" : pr === "she" ? "female" : "unknown";
      return lastOfGender(g) || synthetic(pr);
    }
    function turnTaking(para){
      var A = null, B = null, r;
      for (r = recent.length - 1; r >= 0 && recent[r].para >= para - 3; r--){
        if (A === null){ A = recent[r].key; continue; }
        if (recent[r].key !== A){ B = recent[r].key; break; }
      }
      if (B !== null) return B;
      if (A !== null) return synthetic(A === "other-1" ? "unknown-1" : "other-1");
      return synthetic("unknown-1");
    }
    for (k = 0; k < paras.length; k++){
      p = paras[k];
      if (!p.quotes.length) continue;
      /* one speaker per paragraph unless a tag says otherwise */
      var paraKey = null;
      for (i = 0; i < p.quotes.length && paraKey === null; i++) if (p.quotes[i].tag && p.quotes[i].tag.key) paraKey = keyOf(p.quotes[i].tag.key);
      for (i = 0; i < p.quotes.length && paraKey === null; i++) if (p.quotes[i].tag && p.quotes[i].tag.pronoun) paraKey = resolvePronoun(p.quotes[i].tag.pronoun);
      if (paraKey === null) paraKey = turnTaking(k);
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        q.key = q.tag && q.tag.key ? keyOf(q.tag.key) : q.tag && q.tag.pronoun ? resolvePronoun(q.tag.pronoun) : paraKey;
        if (chars[q.key]) chars[q.key].lines++;
        recent.push({ key: q.key, para: k });
      }
    }

    /* segments per unit: quoted spans carry their speaker, the rest is narration */
    for (k = 0; k < paras.length; k++){
      p = paras[k];
      var spans = [], pos = 0;
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        if (q.s > pos) spans.push({ s: pos, e: q.s, role: "narrator" });
        spans.push({ s: q.s, e: q.e, role: q.key });
        pos = q.e;
      }
      if (pos < p.text.length) spans.push({ s: pos, e: p.text.length, role: "narrator" });
      for (i = 0; i < p.units.length; i++){
        var ui = p.units[i], ub = p.base[i], list = [], role = "narrator";
        u = units[ui] || {};
        var utext = String(u.text || ""), ue2 = ub + utext.length, us = u.start || 0;
        for (j = 0; j < spans.length; j++){
          var a = Math.max(spans[j].s, ub), b = Math.min(spans[j].e, ue2);
          if (b <= a) continue;
          var text = utext.slice(a - ub, b - ub);
          if (!/\S/.test(text)) continue;
          var last = list[list.length - 1];
          if (last && last.role === spans[j].role){ last.end = us + (b - ub); last.text = utext.slice(last.start - us, b - ub); }
          else list.push({ start: us + (a - ub), end: us + (b - ub), text: text, role: spans[j].role });
          if (role === "narrator" && spans[j].role !== "narrator") role = spans[j].role;
        }
        if (!list.length) list.push({ start: us, end: u.end !== undefined ? u.end : us + utext.length, text: utext, role: "narrator" });
        segs[ui] = list; roles[ui] = role;
      }
    }
    var cast = order.map(function(key){ var c = chars[key]; return { key: c.key, name: c.name, gender: c.gender, lines: c.lines, synthetic: c.synthetic }; })
                    .filter(function(c){ return c.lines > 0; });
    return { units: segs, roles: roles, cast: cast };
  }

  /* ============================================================
     2. A device voice per character (pure) and the plan Speak's device engine uses
     ============================================================ */
  function nameOf(v){ return typeof v === "string" ? v : (v && v.name) || ""; }
  function uriOf(v){ return typeof v === "string" ? "" : (v && v.voiceURI) || ""; }
  function voiceId(v){ return typeof v === "string" ? v : (v && (v.voiceURI || v.name)) || ""; }
  function langOf(v){ return String((v && v.lang) || "").slice(0, 2).toLowerCase(); }
  /* a small table for a device that says nothing more about a voice than its name; Speak lends its own,
     fuller reading (and the reader's corrections) when it calls in */
  var F_NAMES = "samantha karen moira tessa fiona victoria allison ava susan zoe nicky kate serena aria jenny sonia libby michelle emma ana zira hazel female".split(" ");
  var M_NAMES = "daniel alex fred tom oliver arthur gordon rishi aaron evan nathan lee guy ryan christopher eric andrew brian thomas george david mark james male".split(" ");
  var F_CODES = ["x-tpc", "x-tpf", "x-sfg", "x-iog", "x-gba", "x-gbc", "x-fis"], M_CODES = ["x-tpd", "x-iom", "x-iob", "x-gbb", "x-gbd", "x-rjs"];
  function hasWord(s, w){ return new RegExp("(^|[^a-z])" + w + "([^a-z]|$)").test(s); }
  function tableGender(v){
    var s = (nameOf(v) + " " + uriOf(v)).toLowerCase(), i;
    for (i = 0; i < F_NAMES.length; i++) if (hasWord(s, F_NAMES[i])) return "f";
    for (i = 0; i < F_CODES.length; i++) if (s.indexOf(F_CODES[i]) >= 0) return "f";
    for (i = 0; i < M_NAMES.length; i++) if (hasWord(s, M_NAMES[i])) return "m";
    for (i = 0; i < M_CODES.length; i++) if (s.indexOf(M_CODES[i]) >= 0) return "m";
    return "";
  }
  var PITCHES = [0.8, 1.2, 0.9, 1.1, 0.7, 1.3];
  function unusedIn(list, used, id){
    for (var i = 0; list && i < list.length; i++) if (!used[id(list[i])]) return list[i];
    return null;
  }
  function leastUsed(list, used, id){
    var best = null, bestN = Infinity, i;
    for (i = 0; i < list.length; i++){ var nn = used[id(list[i])] || 0; if (nn < bestN){ bestN = nn; best = list[i]; } }
    return best;
  }
  /* cast: [{ key, gender, synthetic }] from attribute(); voices: the device's voices; opts: { lang, narrator (id),
     gender(v) → "f" | "m" | "", id(v), rec: { key → { voice, pitch } } the record kept per document }.
     Every named character without a voice in rec gets one: a distinct voice from its gender's pool (the
     document's language, or every voice when that leaves fewer than two; never the narrator) first, then any
     unused voice; when voices run out they are reused with another pitch, so the characters still sound
     different. Unattributed speakers (he / she / another voice) are left to the dialogue voice, and a
     character the reader set to "" (the dialogue voice) stays so. Deterministic; returns whether rec changed. */
  function castDevice(cast, voices, opts){
    opts = opts || {};
    var id = opts.id || voiceId, gender = opts.gender || tableGender, lang = String(opts.lang || "").slice(0, 2).toLowerCase();
    var rec = opts.rec || {}, narrator = opts.narrator || "", all = (voices || []).slice(), i, changed = false;
    var pool = all.filter(function(v){ return langOf(v) === lang; });
    if (pool.length < 2) pool = all.slice();
    var others = pool.filter(function(v){ return id(v) !== narrator; });
    if (others.length) pool = others;
    if (!pool.length) return false;
    var byG = { f: [], m: [], "": [] }, have = {};
    pool.forEach(function(v){ byG[gender(v) || ""].push(v); });
    all.forEach(function(v){ have[id(v)] = true; });
    var used = {};
    Object.keys(rec).forEach(function(k){ var r = rec[k]; if (r && r.voice) used[r.voice] = (used[r.voice] || 0) + 1; });
    for (i = 0; i < (cast || []).length; i++){
      var c = cast[i];
      if (!c || !c.key || c.synthetic) continue;
      var r = rec[c.key];
      if (r && (r.voice === "" || (r.voice && have[r.voice]))) continue;     /* kept, unless the voice has gone from the device */
      var want = c.gender === "male" ? "m" : c.gender === "female" ? "f" : "";
      var gp = want && byG[want].length ? byG[want] : null;
      /* an unused voice of the character's gender, else any unused voice, else the least-used one of its gender */
      var best = unusedIn(gp, used, id) || unusedIn(pool, used, id) || leastUsed(gp || pool, used, id);
      var bestN = used[id(best)] || 0, vg = gender(best) || "", pitch;
      if (bestN === 0) pitch = (want && vg !== want) ? (want === "m" ? 0.85 : 1.1) : 1;   /* a voice of the other (or no known) gender: nudged towards the character's */
      else pitch = PITCHES[(bestN - 1) % PITCHES.length];
      rec[c.key] = { voice: id(best), pitch: pitch };
      used[id(best)] = bestN + 1; changed = true;
    }
    return changed;
  }
  /* the plan for Speak's device engine: who speaks each unit and, for the named characters, which device voice
     and pitch. opts: { lang, narrator (voice), voices() → list, gender(v), id(v), find(id) → voice }. The
     record persists in the cast store beside the ElevenLabs cast; plan.voiceFor(i) → { voice, pitch } | null */
  var devPlan = null;
  function deviceCast(units, ctx, opts){
    opts = opts || {};
    var docId = (ctx && ctx.docId) || "", id = opts.id || voiceId;
    var a = attribute(units);
    return loadCast(docId).then(function(rec){
      if (!rec) rec = newCast(docId);
      function assign(cast){
        var narr = opts.narrator ? id(opts.narrator) : "";
        if (castDevice(cast, opts.voices ? opts.voices() : [], { lang: opts.lang, narrator: narr, gender: opts.gender, id: id, rec: rec.device })){ rec.updated = Date.now(); saveCast(rec); }
      }
      assign(a.cast);
      var plan = {
        docId: docId, n: units.length, roles: a.roles, cast: a.cast, rec: rec,
        voiceFor: function(i){
          var role = plan.roles[i];
          if (!role || role === "narrator") return null;
          var d = plan.rec.device[role];
          if (!d || !d.voice) return null;
          var v = opts.find ? opts.find(d.voice) : null;
          return v ? { voice: v, pitch: +d.pitch || 1 } : null;
        },
        /* PDF pages appended since: the whole list is read again (it is quick) */
        extend: function(us){ var b = attribute(us); plan.roles = b.roles; plan.cast = b.cast; plan.n = us.length; assign(b.cast); if (Side && Side.is && Side.is("cast")) refreshCast(); }
      };
      devPlan = plan;
      if (Side && Side.is && Side.is("cast")) refreshCast();
      return plan;
    });
  }

  /* ============================================================
     3. ElevenLabs: key, voices, cast and the plan of clips
     ============================================================ */
  function toast(msg){ if (Marks && Marks.toast) Marks.toast(msg); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function fmt(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function delay(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }
  function apiKey(){ return Store.get(K_KEY) || ""; }
  function model(){ var m = Store.get(K_MODEL); return MODELS.indexOf(m) >= 0 ? m : MODELS[0]; }
  function supported(){
    return !!(window.fetch && window.Promise && window.Audio && window.indexedDB && window.URL && URL.createObjectURL && window.atob);
  }
  function askForKey(){
    var k = prompt("Paste an ElevenLabs API key to read aloud with ElevenLabs voices.\n\nIt is stored only on this device and is sent only to api.elevenlabs.io while reading. Leave blank to remove it.", apiKey());
    if (k === null) return !!apiKey();          /* cancelled: nothing changes */
    k = k.trim();
    if (k) Store.set(K_KEY, k); else Store.remove(K_KEY);
    voiceCache = null; Store.remove(K_VOICES);  /* another account has other voices */
    syncSettings(true); refreshCast();
    return !!k;
  }
  function ready(){ return Promise.resolve(apiKey() ? true : askForKey()); }

  /* ---- errors from the API, made readable ---- */
  function parse(t){ try { return JSON.parse(t); } catch(_){ return null; } }
  function apiError(status, j, retryAfter){
    var d = j && j.detail, msg = "", code = "";
    if (typeof d === "string") msg = d;
    else if (d){ msg = d.message || ""; code = d.status || ""; }
    var text;
    /* the free tier reports used-up credits as 401 + quota_exceeded, so the code is read before the status */
    if (/quota_exceeded|payment/i.test(code) || status === 402) text = "ElevenLabs credits are used up";
    else if (status === 401 || /invalid_api_key|missing_permissions|unauthori[sz]ed/i.test(code)) text = "ElevenLabs rejected the key";
    else if (status === 429) text = "ElevenLabs is busy — try again in a moment";
    else text = "ElevenLabs: " + (msg || code || "error " + status).slice(0, 90);
    var err = new Error(text);
    err.status = status; err.code = code; err.retryAfter = retryAfter ? parseFloat(retryAfter) || 0 : 0;
    return err;
  }

  /* ---- voices: fetched once a day per key ---- */
  var voiceCache = null, voicesPromise = null, voicesStale = false;
  /* stale: the stored list even when it is older than a day */
  function storedVoices(stale){
    try {
      var o = JSON.parse(Store.get(K_VOICES) || "null");
      if (o && o.voices && o.voices.length && (stale || Date.now() - (o.t || 0) < VOICES_TTL)) return o.voices;
    } catch(_){}
    return null;
  }
  /* back online: the next call fetches a fresh list */
  if (typeof window.addEventListener === "function") window.addEventListener("online", function(){ if (voicesStale){ voicesStale = false; voiceCache = null; } });
  function voices(){
    if (voiceCache) return Promise.resolve(voiceCache);
    var st = storedVoices();
    if (st){ voiceCache = st; return Promise.resolve(st); }
    if (voicesPromise) return voicesPromise;
    if (!apiKey()) return Promise.reject(new Error("Add an ElevenLabs API key first"));
    voicesPromise = fetch(API + "/v2/voices?page_size=100", { headers: { "xi-api-key": apiKey() } }).then(function(r){
      if (r.ok) return r.json();
      return r.text().then(function(t){ throw apiError(r.status, parse(t), r.headers.get("Retry-After")); });
    }).then(function(j){
      var list = (j.voices || []).map(function(v){
        var lb = v.labels || {}, g = String(lb.gender || "").toLowerCase();
        return { id: v.voice_id, name: v.name || v.voice_id, gender: g === "male" || g === "female" ? g : "unknown",
                 narr: /narrat|audiobook/i.test([lb.use_case, lb.description, v.description].join(" ")) };
      });
      voicesPromise = null;
      if (!list.length) throw new Error("No ElevenLabs voices found");
      voiceCache = list; Store.set(K_VOICES, JSON.stringify({ t: Date.now(), voices: list }));
      return list;
    }, function(err){
      voicesPromise = null;
      /* an old list still names the narrator and the cast, so clips already on the device play offline */
      var old = storedVoices(true);
      if (old){ voiceCache = old; voicesStale = true; return old; }
      if (!(err && err.status)) err = new Error(navigator.onLine ? "Couldn’t reach ElevenLabs" : "ElevenLabs needs a connection");
      throw err;
    });
    return voicesPromise;
  }
  function defaultNarrator(list){
    for (var i = 0; i < list.length; i++) if (list[i].narr) return list[i].id;
    return list.length ? list[0].id : "";
  }
  function narratorId(list){
    var id = Store.get(K_NARR);
    if (id && list.some(function(v){ return v.id === id; })) return id;
    return defaultNarrator(list);
  }
  /* the narrator's name for the bar, from the list on the device */
  function narratorName(){
    var list = voiceCache || storedVoices(true);
    if (!list) return "ElevenLabs";
    var id = narratorId(list), i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return "ElevenLabs";
  }
  function voiceOptions(list, selected){
    var groups = { female: [], male: [], unknown: [] };
    list.forEach(function(v){ groups[v.gender].push('<option value="' + esc(v.id) + '"' + (v.id === selected ? ' selected' : '') + '>' + esc(v.name) + '</option>'); });
    return [["Female voices", groups.female], ["Male voices", groups.male], ["Other voices", groups.unknown]].map(function(g){
      return g[1].length ? '<optgroup label="' + g[0] + '">' + g[1].join("") + '</optgroup>' : "";
    }).join("");
  }

  /* ---- the cast of a document, kept in IndexedDB: { docId, voices: { key → ElevenLabs voice_id },
     device: { key → { voice, pitch } }, kokoro: { key → Kokoro voice name }, updated } ---- */
  function newCast(docId){ return { docId: docId, voices: {}, device: {}, kokoro: {}, updated: 0 }; }
  function loadCast(docId){
    if (!docId || !Library) return Promise.resolve(null);
    return Library.tx("cast", "readonly", function(st){ return st.get(docId); })
      .then(function(r){
        if (!(r && r.docId === docId)) return null;
        ["voices", "device", "kokoro"].forEach(function(k){ if (!r[k] || typeof r[k] !== "object") r[k] = {}; });
        return r;
      }).catch(function(){ return null; });
  }
  function saveCast(rec){
    if (!rec || !rec.docId || !Library) return;
    Library.tx("cast", "readwrite", function(st){ st.put(rec); }).catch(function(){});
  }
  /* new characters get a distinct voice from their gender's pool (not the narrator's), round-robin; list is
     [{ id, gender }] (ElevenLabs voices, or the Kokoro voices of the document's language) and map the record's
     { character key → voice id } to fill (rec.voices or rec.kokoro). Returns whether map changed. */
  function assignVoices(cast, list, narrator, map){
    var pools = { male: [], female: [], unknown: [] }, all = [], used = {}, changed = false, i, j;
    list.forEach(function(v){ if (v.id === narrator) return; all.push(v.id); pools[v.gender].push(v.id); });
    if (!all.length) all = list.map(function(v){ return v.id; });
    Object.keys(map).forEach(function(k){ used[map[k]] = (used[map[k]] || 0) + 1; });
    for (i = 0; i < cast.length; i++){
      var c = cast[i];
      if (map[c.key]) continue;
      var pool = pools[c.gender] && pools[c.gender].length ? pools[c.gender] : all, best = null, bestN = Infinity;
      for (j = 0; j < pool.length; j++){ var nn = used[pool[j]] || 0; if (nn < bestN){ bestN = nn; best = pool[j]; } }
      if (!best) best = narrator;
      map[c.key] = best; used[best] = (used[best] || 0) + 1; changed = true;
    }
    return changed;
  }

  /* ---- where clips come from: ElevenLabs requests, or the Kokoro worker on this device. A plan carries its
     source; the clip, prefetch, cache and playback code below reads the differences off it ---- */
  var SRC = {
    eleven: { name: "eleven", castKey: "voices", inflight: INFLIGHT, ahead: AHEAD, busy: "Fetching…", pack: true,
              model: model, list: function(){ return voices(); }, narrator: narratorId, pool: function(list){ return list; },
              options: voiceOptions, run: function(task){ return fetchClip(task, 0); } },
    /* one clip per segment (a unit's run of text in one voice): no packing, so the highlight is exact per unit;
       the worker makes one clip at a time, in the order asked, three ahead of playback */
    kokoro: { name: "kokoro", castKey: "kokoro", inflight: 1, ahead: 3, busy: "Generating…", pack: false,
              model: function(){ return KOKORO_MODEL; }, list: function(){ return Promise.resolve(KOKORO_VOICES); }, narrator: kokoroNarrator,
              pool: function(list, lang){ return kokoroPool(lang); }, options: kokoroOptions, run: kokoroClip }
  };

  /* ---- the plan: segments, cast and clips for the units being read ---- */
  var plan = null, prepSeq = 0, prepPromise = null;
  function planFor(src, units, ctx){
    var docId = (ctx && ctx.docId) || "", a = attribute(units), my = ++prepSeq;
    var prev = plan && plan.docId === docId && plan.src === src ? plan : null;
    if (!prev) plan = null;                       /* another document or source: its old plan must not play meanwhile */
    var p = Promise.all([src.list(), prev ? Promise.resolve(prev.rec) : loadCast(docId)]).then(function(r){
      if (my !== prepSeq) return prepPromise;     /* a newer prepare is under way: it is the one to wait for */
      var list = r[0], rec = r[1] || newCast(docId);
      var narrator = src.narrator(list);
      if (assignVoices(a.cast, src.pool(list, (ctx && ctx.lang) || ""), narrator, rec[src.castKey])){ rec.updated = Date.now(); saveCast(rec); }
      var sig = a.cast.map(function(c){ return c.key + ":" + c.lines; }).join("|") + "|" + narrator;
      plan = { src: src, docId: docId, title: (ctx && ctx.title) || "", units: units, segs: a.units, cast: a.cast, rec: rec, list: list, narrator: narrator, sig: sig, clips: null, firstClip: null };
      buildClips(); syncName();
      /* PDF pages appended to a plan: the panel is redrawn only when the cast changed */
      if (!prev || prev.sig !== sig) refreshCast();
    });
    prepPromise = p;
    return p;
  }
  function prepare(units, ctx){ return planFor(SRC.eleven, units, ctx); }
  function voiceFor(role){ return role === "narrator" ? plan.narrator : (plan.rec[plan.src.castKey][role] || plan.narrator); }
  /* a unit's segments as runs of one voice */
  function runsOf(i){
    var list = plan.segs[i] || [], out = [], k;
    for (k = 0; k < list.length; k++){
      var v = voiceFor(list[k].role), last = out[out.length - 1];
      if (last && last.voice === v) last.text += " " + list[k].text;
      else out.push({ voice: v, text: list[k].text });
    }
    if (!out.length) out.push({ voice: plan.narrator, text: String(plan.units[i].text || "") });
    return out;
  }
  /* consecutive runs of one voice packed into clips of at most MAX_CLIP characters; a unit is never
     split across clips (a unit with several voices gives one clip per run); clips stay inside a page.
     A source that does not pack (Kokoro) gets one clip per run. */
  function buildClips(){
    var units = plan.units, clips = [], first = new Array(units.length), cur = null, mdl = plan.src.model(), i, j;
    for (i = 0; i < units.length; i++){
      var runs = runsOf(i), page = units[i].page || 0;
      for (j = 0; j < runs.length; j++){
        var r = runs[j];
        if (!cur || j > 0 || !plan.src.pack || cur.voice !== r.voice || cur.page !== page || cur.text.length + 1 + r.text.length > MAX_CLIP){
          if (cur) clips.push(cur);
          cur = { voice: r.voice, model: mdl, doc: plan.docId, text: "", parts: [], first: i, last: i, page: page, index: clips.length, key: null };
        }
        if (cur.text) cur.text += " ";
        cur.parts.push({ unit: i, s: cur.text.length, e: cur.text.length + r.text.length });
        cur.text += r.text; cur.last = i;
        if (first[i] === undefined) first[i] = cur.index;
      }
    }
    if (cur) clips.push(cur);
    for (i = 0; i < clips.length; i++){
      clips[i].prev = i > 0 ? clips[i - 1].text.slice(-CONTEXT) : "";
      clips[i].next = i + 1 < clips.length ? clips[i + 1].text.slice(0, CONTEXT) : "";
    }
    plan.clips = clips; plan.firstClip = first;
    expectNext = null;
  }
  function isRunning(){ var e = Speak && Speak.activeEngine && Speak.activeEngine(); return !!e && (e === engine || e === kEngine); }
  function elevenRunning(){ return !!(Speak && Speak.activeEngine && Speak.activeEngine() === engine); }
  function kokoroRunning(){ return !!(Speak && Speak.activeEngine && Speak.activeEngine() === kEngine); }
  /* voices changed: new clips, and the sentence being read starts again with them (src: only a plan of that source) */
  function replan(src){
    if (!plan || (src && plan.src !== src)) return;
    cancelQueued();      /* prefetches for the old voices or model are no longer wanted */
    buildClips();
    if (isRunning() && Speak.isPlaying()) Speak.play();
  }

  /* ============================================================
     4. Fetching and caching clips
     ============================================================ */
  var imul = Math.imul || function(a, b){ return ((a * (b >>> 16)) << 16) + a * (b & 0xffff) | 0; };
  function fnv(str){   /* two 32-bit FNV-1a hashes, where SubtleCrypto is unavailable */
    var h1 = 0x811c9dc5, h2 = 0x050c5d1f, i, c;
    for (i = 0; i < str.length; i++){ c = str.charCodeAt(i); h1 = imul(h1 ^ c, 0x01000193) >>> 0; h2 = imul(h2 ^ c ^ (i & 0xff), 0x01000193) >>> 0; }
    return "f" + h1.toString(16) + "-" + h2.toString(16);
  }
  function sha256(str){
    var bytes = null;
    try { bytes = new TextEncoder().encode(str); } catch(_){}
    if (bytes && window.crypto && crypto.subtle && crypto.subtle.digest){
      return crypto.subtle.digest("SHA-256", bytes).then(function(h){
        return Array.prototype.map.call(new Uint8Array(h), function(b){ return (b < 16 ? "0" : "") + b.toString(16); }).join("");
      }).catch(function(){ return fnv(str); });
    }
    return Promise.resolve(fnv(str));
  }
  function clipKey(clip){
    if (clip.key) return Promise.resolve(clip.key);
    return sha256(clip.voice + "\n" + clip.model + "\n" + clip.text).then(function(h){ clip.key = clip.doc + ":" + h; return clip.key; });
  }
  function cached(k){
    if (!Library) return Promise.resolve(null);
    return Library.tx("audio", "readonly", function(st){ return st.get(k); })
      .then(function(r){ return r && r.key === k && r.blob ? r : null; }).catch(function(){ return null; });
  }
  function save(rec){ if (Library) Library.tx("audio", "readwrite", function(st){ st.put(rec); }).then(scheduleTrim, function(){}); }
  /* the clips kept on the device stay under AUDIO_CAP: after a put, once things are quiet, the oldest go first */
  var trimT = null;
  function scheduleTrim(){ clearTimeout(trimT); trimT = setTimeout(trimAudio, 2500); }
  function scanAudio(){
    var recs = [], total = 0;
    if (!Library) return Promise.resolve({ recs: recs, total: 0 });
    return Library.tx("audio", "readonly", function(st){
      var cur = st.openCursor();
      cur.onsuccess = function(){
        var c = cur.result; if (!c) return;
        var v = c.value || {}, n = v.size || (v.blob && v.blob.size) || 0;
        total += n; recs.push({ key: c.primaryKey, created: v.created || 0, size: n });
        c.continue();
      };
    }).then(function(){ return { recs: recs, total: total }; }).catch(function(){ return { recs: recs, total: total }; });
  }
  function audioTotal(){ return scanAudio().then(function(r){ return r.total; }); }
  function trimAudio(){
    trimT = null;
    return scanAudio().then(function(r){
      if (r.total <= AUDIO_CAP) return;
      r.recs.sort(function(a, b){ return a.created - b.created; });
      var drop = [], total = r.total, i = 0;
      while (total > AUDIO_CAP && i < r.recs.length){ total -= r.recs[i].size; drop.push(r.recs[i].key); i++; }
      return Library.tx("audio", "readwrite", function(st){ drop.forEach(function(k){ st.delete(k); }); });
    }).then(audioSync).catch(function(){});
  }
  /* the row in the voices panel: "Audio kept on this device: 123 MB" */
  function mb(n){ return Math.round(n / 1048576) + " MB"; }
  function audioSync(){
    if (typeof document === "undefined" || !document.getElementById("audioKept")) return;
    audioTotal().then(function(n){ var el = document.getElementById("audioKept"); if (el) el.textContent = "Audio kept on this device: " + mb(n); });
  }
  /* the audio store only: every clip of every document, from either source; the model stays */
  function clearAudio(){
    if (!Library) return;
    cancelQueued();
    Library.tx("audio", "readwrite", function(st){ st.clear(); }).then(function(){ loadedKey = null; toast("Cached audio cleared"); audioSync(); }, function(){ toast("Couldn’t clear the audio"); });
  }
  function b64blob(b64){
    var bin = atob(b64), n = bin.length, bytes = new Uint8Array(n), i;
    for (i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "audio/mpeg" });
  }
  /* start / end seconds of each part (unit) of a clip from the character alignment;
     fractions of the duration when there is none */
  function timesFrom(al, clip){
    var st = al && al.character_start_times_seconds, en = al && al.character_end_times_seconds;
    var n = st && en ? Math.min(st.length, en.length) : 0, len = clip.text.length || 1, out = [], i, p, a, b;
    for (i = 0; i < clip.parts.length; i++){
      p = clip.parts[i];
      if (n > 0){
        if (n === clip.text.length){ a = p.s; b = Math.max(a, p.e - 1); }
        else { a = Math.round(p.s * n / len); b = Math.max(a, Math.round(p.e * n / len) - 1); }
        a = Math.min(n - 1, Math.max(0, a)); b = Math.min(n - 1, Math.max(a, b));
        out.push({ a: +st[a] || 0, b: +en[b] || 0 });
      } else out.push({ a: p.s / len, b: p.e / len, rel: true });
    }
    return out;
  }
  var sent = 0;
  function fetchClip(task, attempt){
    var clip = task.clip;
    var body = { text: clip.text, model_id: clip.model, previous_text: clip.prev, next_text: clip.next, apply_text_normalization: "auto" };
    return fetch(API + "/v1/text-to-speech/" + encodeURIComponent(clip.voice) + "/with-timestamps?output_format=mp3_44100_128", {
      method: "POST", headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function(r){
      if (r.ok) return r.json();
      return r.text().then(function(t){ throw apiError(r.status, parse(t), r.headers.get("Retry-After")); });
    }).then(function(j){
      if (!j || !j.audio_base64) throw new Error("ElevenLabs sent no audio");
      sent += clip.text.length; setStatus();
      return { blob: b64blob(j.audio_base64), times: timesFrom(j.alignment, clip) };
    }).catch(function(err){
      /* busy: once more after a pause, unless nobody wants the clip any more (Stop was pressed) */
      if (err && err.status === 429 && !attempt && !task.cancelled){
        return delay(Math.max(2000, (err.retryAfter || 0) * 1000)).then(function(){ if (task.cancelled) throw err; return fetchClip(task, 1); });
      }
      if (!(err && err.status) && !navigator.onLine){ err = new Error("ElevenLabs needs a connection"); err.offline = true; }
      else if (!(err && err.status) && err && !/ElevenLabs/.test(err.message || "")) err = new Error("ElevenLabs request failed");
      throw err;
    });
  }
  /* at most INFLIGHT requests at once; the clip about to play goes first */
  var inflight = {}, queue = [], running = 0;
  /* a request already queued or on its way is shared; asking again keeps it wanted and may bring it forward */
  function join(task, urgent){
    task.cancelled = false;
    var qi = queue.indexOf(task);
    if (urgent && qi > 0){ queue.splice(qi, 1); queue.unshift(task); }
    return task.promise;
  }
  function getClip(clip, urgent){
    var src = plan.src;      /* the plan may be another's by the time the cache has answered */
    return clipKey(clip).then(function(k){
      if (inflight[k]) return join(inflight[k], urgent);
      /* the cache is read before a request slot is taken, so a clip on the device never waits behind the network */
      return cached(k).then(function(rec){
        if (rec) return rec;
        if (inflight[k]) return join(inflight[k], urgent);
        var task = { key: k, clip: clip, docId: clip.doc, src: src, cancelled: false };
        task.promise = new Promise(function(res, rej){ task.res = res; task.rej = rej; });
        inflight[k] = task;
        if (urgent) queue.unshift(task); else queue.push(task);
        pump();
        return task.promise;
      });
    });
  }
  function pump(){ while (queue.length && running < queue[0].src.inflight) launch(queue.shift()); }
  function launch(task){
    running++;
    runTask(task).then(function(rec){ settle(task); task.res(rec); }, function(err){ settle(task); task.rej(err); });
  }
  function settle(task){ running--; delete inflight[task.key]; pump(); }
  function runTask(task){
    if (task.src === SRC.eleven && !navigator.onLine){ var o = new Error("Offline — no ElevenLabs audio cached from here"); o.offline = true; return Promise.reject(o); }
    return task.src.run(task).then(function(r){
      var out = { key: task.key, docId: task.docId, voice_id: task.clip.voice, model_id: task.clip.model, chars: task.clip.text.length,
                  blob: r.blob, size: r.blob.size, times: r.times, created: Date.now() };
      save(out);
      return out;
    });
  }
  /* drop what has not been sent yet and stop retrying what has; an ElevenLabs request already on its way finishes
     and lands in the cache, while the worker drops what it was making (it cannot be cut short) */
  function cancelQueued(){
    queue.splice(0).forEach(function(t){ t.cancelled = true; delete inflight[t.key]; var e = new Error("cancelled"); e.cancelled = true; t.rej(e); });
    Object.keys(inflight).forEach(function(k){ inflight[k].cancelled = true; });
    kokoroCancel();
  }
  function prefetch(ci){
    for (var j = ci + 1; j <= ci + plan.src.ahead && plan && plan.clips[j]; j++) getClip(plan.clips[j], false).catch(function(){});
  }

  /* ============================================================
     4b. Natural voices — the Kokoro worker, made only once the reader picks the engine or presses
         download, and the model it keeps on the device
     ============================================================ */
  /* the 28 English voices of Kokoro-82M (kokoro-js 1.2.1 knows these and no others); the first letter is the
     language (a American, b British), the second the gender */
  var KOKORO_VOICES = (function(){
    var spec = [
      ["af", "American", "female", "heart bella nicole sarah sky alloy aoede jessica kore nova river"],
      ["am", "American", "male", "adam echo eric fenrir liam michael onyx puck santa"],
      ["bf", "British", "female", "alice emma isabella lily"],
      ["bm", "British", "male", "daniel fable george lewis"]
    ], out = [];
    spec.forEach(function(s){
      s[3].split(" ").forEach(function(n){ out.push({ id: s[0] + "_" + n, name: n.charAt(0).toUpperCase() + n.slice(1), group: s[1], gender: s[2], lang: s[0].charAt(0) }); });
    });
    return out;
  })();
  /* the voice pool by document language (the letter Kokoro's voice names start with): English gets the
     American and British voices; another language gets its own voices where the voice list has any, else
     the English ones with a word of warning, once */
  var KOKORO_LANGS = { en: "ab", es: "e", fr: "f", hi: "h", it: "i", ja: "j", pt: "p", zh: "z" };
  var kokoroWarned = false;
  function kokoroPool(lang){
    lang = String(lang || "en").slice(0, 2).toLowerCase();
    var letters = KOKORO_LANGS[lang] || "", pool = KOKORO_VOICES.filter(function(v){ return letters.indexOf(v.lang) >= 0; });
    if (pool.length) return pool;
    if (lang !== "en" && !kokoroWarned){ kokoroWarned = true; toast("Natural voices speak English; other languages may sound odd"); }
    return KOKORO_VOICES.filter(function(v){ return v.lang === "a" || v.lang === "b"; });
  }
  function kokoroVoice(id){ for (var i = 0; i < KOKORO_VOICES.length; i++) if (KOKORO_VOICES[i].id === id) return KOKORO_VOICES[i]; return null; }
  function kokoroNarrator(){ var id = Store.get(K_KNARR); return kokoroVoice(id) ? id : "af_heart"; }
  function kokoroName(id){ var v = kokoroVoice(id); return v ? v.name : "Natural voice"; }
  function kokoroOptions(list, selected){
    var groups = [], by = {};
    (list || KOKORO_VOICES).forEach(function(v){ if (!by[v.group]){ by[v.group] = []; groups.push(v.group); } by[v.group].push(v); });
    return groups.map(function(g){
      return '<optgroup label="' + esc(g) + '">' + by[g].map(function(v){
        return '<option value="' + esc(v.id) + '"' + (v.id === selected ? ' selected' : '') + '>' + esc(v.name) + ' (' + (v.gender === "female" ? "woman" : "man") + ')</option>';
      }).join("") + '</optgroup>';
    }).join("");
  }

  /* ---- the worker: load with progress, generate in order, cancel ---- */
  var kw = null, kLoad = null, kReady = false, kJobs = {}, kSeq = 0, kFiles = {}, kPct = -1, kThreads = 0;
  var kHave = null;     /* { ready, bytes } — what Cache Storage held when last looked */
  /* a load that shows no sign of life for this long (no progress, no ready) is given up on, so a
     refused nested worker or a stalled download never leaves the reader at "Preparing…" for ever */
  var K_STALL = 90000, kTimer = null;
  function kokoroWatch(){
    clearTimeout(kTimer);
    if (!kLoad) return;
    kTimer = setTimeout(function(){
      var l = kLoad; if (!l) return;
      kLoad = null; kReady = false; kFiles = {}; kPct = -1;
      try { if (kw) kw.terminate(); } catch(_){}
      kw = null;
      l.rej(new Error(navigator.onLine ? "Natural voices couldn’t start (no response from the voice engine)" : "Natural voices need a connection to download"));
      kokoroSync();
    }, K_STALL);
  }
  function kokoroWorker(){
    if (kw) return kw;
    kw = new Worker("./workers/kokoro-worker.js", { type: "module" });
    kw.onmessage = function(e){
      var m = e.data || {}, j;
      if (m.type === "progress"){ kokoroProgress(m); kokoroWatch(); }
      else if (m.type === "ready"){
        clearTimeout(kTimer);
        kReady = true; kThreads = m.threads || 0; kFiles = {}; kPct = -1;
        var l = kLoad; kLoad = null; if (l) l.res();
        kHave = null; kokoroSync();
      } else if (m.type === "audio"){
        j = kJobs[m.id]; if (!j) return;         /* dropped meanwhile */
        delete kJobs[m.id]; j.res({ samples: m.samples, sampleRate: m.sampleRate || 24000, ms: m.ms || 0 });
      } else if (m.type === "error"){
        if (m.id === null || m.id === undefined){
          clearTimeout(kTimer);
          var ld = kLoad; kLoad = null; kFiles = {}; kPct = -1;
          if (ld) ld.rej(new Error(m.message ? "Natural voices: " + String(m.message).slice(0, 80) : "Couldn’t load the natural voices"));
          kokoroSync();
        } else { j = kJobs[m.id]; if (j){ delete kJobs[m.id]; j.rej(new Error(m.message || "error")); } }
      }
    };
    /* the script itself failed (offline before the runtime was ever cached, a browser without module workers):
       everything waiting fails now, and the next try makes a new worker */
    kw.onerror = function(){
      clearTimeout(kTimer);
      var l = kLoad, jobs = kJobs;
      kLoad = null; kReady = false; kJobs = {}; kFiles = {}; kPct = -1;
      try { kw.terminate(); } catch(_){}
      kw = null;
      var err = new Error(navigator.onLine ? "Natural voices couldn’t start in this browser" : "Natural voices need a connection to download");
      if (l) l.rej(err);
      Object.keys(jobs).forEach(function(id){ jobs[id].rej(err); });
      kokoroSync();
    };
    return kw;
  }
  /* the model loaded in the worker, downloading it first when it is not on the device; one load at a time */
  function kokoroModel(){
    if (kReady && kw) return Promise.resolve();
    if (kLoad) return kLoad.promise;
    var l = {};
    l.promise = new Promise(function(res, rej){ l.res = res; l.rej = rej; });
    kLoad = l;
    try { kokoroWorker().postMessage({ type: "load" }); } catch(err){ kLoad = null; return Promise.reject(err); }
    kokoroWatch();
    kokoroSync();
    return l.promise;
  }
  /* files come from the browser's cache in a flash (loaded = total at once); only a real download shows a percentage */
  function kokoroProgress(m){
    kFiles[m.file] = { loaded: m.loaded || 0, total: m.total || 0 };
    var loaded = 0, total = 0;
    Object.keys(kFiles).forEach(function(f){ loaded += kFiles[f].loaded; total += kFiles[f].total; });
    kPct = total && loaded < total ? Math.min(99, Math.round(loaded * 100 / total)) : -1;
    if (kokoroRunning()) setStatus(kPct >= 0 ? "Downloading voices " + kPct + "%…" : "Preparing…");
    var st = document.getElementById("kokoroState"), pr = document.getElementById("kokoroProgress");
    if (st) st.textContent = kPct >= 0 ? "Downloading… " + kPct + "%" : "Preparing…";
    if (pr){ pr.hidden = kPct < 0; if (kPct >= 0) pr.value = kPct; }
  }
  function kokoroGenerate(text, voice){
    var id = ++kSeq;
    return new Promise(function(res, rej){
      kJobs[id] = { res: res, rej: rej };
      try { kokoroWorker().postMessage({ type: "generate", id: id, text: text, voice: voice, speed: 1 }); }
      catch(err){ delete kJobs[id]; rej(err); }
    });
  }
  /* everything the worker has not made yet is dropped, and so is what it is making */
  function kokoroCancel(){
    var ids = Object.keys(kJobs);
    if (!ids.length) return;
    if (kw) try { kw.postMessage({ type: "cancel" }); } catch(_){}
    ids.forEach(function(id){ var j = kJobs[id]; delete kJobs[id]; var e = new Error("cancelled"); e.cancelled = true; j.rej(e); });
  }
  /* Float32 samples → 16-bit PCM WAV, for the audio element and the cache */
  function wavBlob(samples, rate){
    var n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i, s;
    function str(o, t){ for (var k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); }
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++){ s = samples[i]; s = s < -1 ? -1 : s > 1 ? 1 : s; v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
    return new Blob([buf], { type: "audio/wav" });
  }
  /* a clip from the worker: the whole clip is one part (or, were it packed, parts in proportion to their text) */
  function kokoroClip(task){
    var clip = task.clip;
    return kokoroModel().then(function(){ return kokoroGenerate(clip.text, clip.voice); }).then(function(r){
      var secs = r.samples.length / r.sampleRate, len = clip.text.length || 1;
      return { blob: wavBlob(r.samples, r.sampleRate), times: clip.parts.map(function(p){ return { a: p.s / len * secs, b: p.e / len * secs }; }) };
    }).catch(function(err){
      if (err && err.cancelled) throw err;
      var e = new Error(!navigator.onLine && kReady ? "Offline — this natural voice isn’t on the device yet" : (err && err.message) || "Natural voices couldn’t make the audio");
      e.offline = !navigator.onLine;
      throw e;
    });
  }
  /* is the model in Cache Storage (kokoro-js keeps it under the huggingface.co URLs), and how big is it */
  function kokoroOnDevice(){
    if (!(window.caches && caches.open)) return Promise.resolve({ ready: false, bytes: 0 });
    var cache;
    return caches.open(KOKORO_CACHES[0]).then(function(c){ cache = c; return c.keys(); }).then(function(keys){
      var model = false, jobs = [];
      keys.forEach(function(req){
        var u = req.url || "";
        if (u.indexOf("Kokoro-82M") < 0) return;
        if (u.indexOf("model_quantized.onnx") >= 0) model = true;
        jobs.push(cache.match(req).then(function(r){
          if (!r) return 0;
          var n = +r.headers.get("content-length") || 0;
          return n || r.blob().then(function(b){ return b.size; });
        }).catch(function(){ return 0; }));
      });
      return Promise.all(jobs).then(function(sizes){
        var bytes = 0; sizes.forEach(function(n){ bytes += n; });
        kHave = { ready: model, bytes: bytes };
        return kHave;
      });
    }).catch(function(){ return { ready: false, bytes: 0 }; });
  }
  /* the Download button */
  function downloadKokoro(){
    if (kLoad) return;
    if (!navigator.onLine && !(kHave && kHave.ready)){ toast("Connect to the internet once to download the natural voices"); return; }
    kokoroModel().then(function(){
      toast("Natural voices are ready");
      /* the English voices (28 × 0.5 MB) come down right after the model so they all work offline */
      try { kokoroWorker().postMessage({ type: "warm", voices: KOKORO_VOICES.map(function(v){ return v.id; }) }); } catch(_){}
    }, function(err){ toast((err && err.message) || "Couldn’t download the natural voices"); });
  }
  /* the Remove button: the model and voice caches, the runtime files in the app's cache, and the worker holding the model */
  function removeKokoro(){
    if (!confirm("Remove the natural voices from this device (" + KOKORO_MB + " MB)? They can be downloaded again.")) return;
    if (kokoroRunning() && Speak && Speak.stop) Speak.stop();
    var l = kLoad, jobs = kJobs;
    kLoad = null; kReady = false; kJobs = {}; kFiles = {}; kPct = -1;
    if (kw){ try { kw.terminate(); } catch(_){} kw = null; }
    var gone = new Error("Natural voices were removed");
    if (l) l.rej(gone);
    Object.keys(jobs).forEach(function(id){ jobs[id].rej(gone); });
    var work = [];
    if (window.caches){
      KOKORO_CACHES.forEach(function(n){ work.push(caches.delete(n).catch(function(){})); });
      work.push(caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){ return k.indexOf("lamplight-") === 0 && k !== "lamplight-share"; }).map(function(k){
          return caches.open(k).then(function(c){
            return c.keys().then(function(reqs){ return Promise.all(reqs.filter(function(r){ return r.url.indexOf("/vendor/kokoro/") >= 0; }).map(function(r){ return c.delete(r); })); });
          });
        }));
      }).catch(function(){}));
    }
    Promise.all(work).then(function(){ kHave = { ready: false, bytes: 0 }; toast("Natural voices removed"); kokoroSync(); });
  }
  /* before reading starts: the download needs a connection; without one the device voice reads this time */
  function kokoroReady(){
    if (!kReady && Store && Store.get("ll_kokoro_told") !== "1"){
      Store.set("ll_kokoro_told", "1");
      toast("Natural voices are made on this device: the first sentence can take a minute on a phone, then it keeps reading");
    }
    if (kReady || navigator.onLine) return Promise.resolve(true);
    return kokoroOnDevice().then(function(h){
      if (h.ready) return true;
      toast("Natural voices aren’t downloaded yet — the device voice reads until you’re online");
      return null;     /* Speak falls back without a second toast */
    });
  }

  /* ============================================================
     5. Playback — one audio element, sentence boundaries from the alignment
     ============================================================ */
  var audioEl = null, url = null, loadedKey = null, seq = 0, ticker = null, current = null, expectNext = null;
  function audio(){
    if (!audioEl){
      /* Speak makes the element inside the user gesture that starts reading, so iOS Safari lets it play afterwards */
      audioEl = (Speak && Speak.audioElement && Speak.audioElement()) || new Audio();
      audioEl.preload = "auto";
    }
    return audioEl;
  }
  /* "Fetching…" / "Generating…" / "Preparing…" in the live region, the counter beside it (ElevenLabs only);
     only a change is written, since screen readers announce every write to a live region */
  function setStatus(text){
    var el = document.getElementById("ttsStatus"), cnt = document.getElementById("ttsSent"), bar = document.getElementById("tts"), play = document.getElementById("ttsPlay");
    if (!el) return;
    var live = text || "", counter = (text || !(plan && plan.src === SRC.eleven)) ? "" : (sent ? "≈" + fmt(sent) + " chars sent" : ""), busy = !!live;
    if (el.textContent !== live) el.textContent = live;
    if (cnt && cnt.textContent !== counter) cnt.textContent = counter;
    if (bar) bar.classList.toggle("fetching", busy);
    if (play && (play.getAttribute("aria-busy") === "true") !== busy) play.setAttribute("aria-busy", busy ? "true" : "false");
  }
  /* where a clip sits in the plan, which may have been rebuilt (PDF pages appended, voices changed) since the clip was made */
  function clipIndex(clip){
    var clips = plan && plan.clips, k, c;
    if (!clips) return -1;
    if (clips[clip.index] === clip) return clip.index;
    for (k = 0; k < clips.length; k++){
      c = clips[k];
      if (c === clip || (c.first === clip.first && c.last === clip.last && c.voice === clip.voice && c.text === clip.text)) return k;
    }
    return -1;
  }
  function partStart(rec, i){
    var t = rec.times && rec.times[i];
    if (!t) return 0;
    return t.rel ? t.a * (audioEl && audioEl.duration ? audioEl.duration : 0) : t.a;
  }
  function tick(){
    if (!current || current.seq !== seq || !audioEl || !plan) return;
    var clip = current.clip, t = audioEl.currentTime, k = 0, j;
    for (j = clip.parts.length - 1; j > 0; j--){ if (t >= partStart(current.rec, j) - 0.02){ k = j; break; } }
    var unit = clip.parts[k].unit;
    if (unit !== current.unit){
      current.unit = unit;
      var u = plan.units[unit];
      if (u) current.opts.onboundary(u.start, u.end, unit);
    }
  }
  function startTicker(){ stopTicker(); ticker = setInterval(tick, 120); }
  function stopTicker(){ if (ticker){ clearInterval(ticker); ticker = null; } }
  function speak(i, opts, tries){
    var mySeq = ++seq;
    var ci = plan && plan.clips ? plan.firstClip[i] : undefined;
    /* the plan (or the pages this unit is on) may still be on its way */
    if (ci === undefined && i < (Speak && Speak.units ? Speak.units().length : 0) && (tries || 0) < 15){
      setTimeout(function(){ if (mySeq === seq) speak(i, opts, (tries || 0) + 1); }, 200);
      return;
    }
    if (!plan || !plan.clips){ opts.onerror("not ready"); return; }
    /* after a clip ends, the next clip may start inside the same unit (a sentence with two voices) */
    if (expectNext !== null && plan.clips[expectNext] && plan.clips[expectNext].first <= i && i <= plan.clips[expectNext].last) ci = expectNext;
    expectNext = null;
    if (ci === undefined || !plan.clips[ci]){ opts.onend(); return; }
    var clip = plan.clips[ci];
    current = { clip: clip, index: ci, opts: opts, seq: mySeq, unit: -1, rec: null };
    if (!(loadedKey && clip.key === loadedKey)) setStatus(plan.src.busy);
    getClip(clip, true).then(function(rec){
      if (mySeq !== seq) return;
      setStatus();
      current.rec = rec;
      playClip(rec, clip, i, opts, mySeq);
      var k = clipIndex(clip);
      if (k >= 0) prefetch(k);
    }, function(err){
      if (mySeq !== seq || (err && err.cancelled)) return;
      setStatus();
      toast(err && err.message ? err.message : (plan.src === SRC.eleven ? "ElevenLabs request failed" : "Natural voices couldn’t make the audio"));
      opts.onerror(null);
    });
  }
  function playClip(rec, clip, i, opts, mySeq){
    var a = audio(), part = -1, k;
    for (k = 0; k < clip.parts.length; k++) if (clip.parts[k].unit === i){ part = k; break; }
    function begin(){
      if (mySeq !== seq) return;
      var at = part > 0 ? partStart(rec, part) : 0;
      try { a.currentTime = at > 0.05 ? at : 0; } catch(_){}
      a.playbackRate = opts.rate;
      var p = a.play();
      if (p && p.catch) p.catch(function(err){ if (mySeq !== seq) return; toast("Couldn’t play the audio (" + ((err && err.name) || "error") + ")"); opts.onerror(null); });
      startTicker(); tick();
    }
    a.onended = function(){
      if (mySeq !== seq) return;
      stopTicker();
      /* the next clip is found by what this one was, not by its old index: the plan may have been rebuilt meanwhile */
      var k = clipIndex(clip), nx = k >= 0 ? plan.clips[k + 1] : null;
      expectNext = nx ? k + 1 : null;
      opts.onend({ advanceTo: nx ? nx.first : clip.last + 1 });
    };
    a.onerror = function(){ if (mySeq !== seq) return; stopTicker(); loadedKey = null; toast("Couldn’t play the audio"); opts.onerror(null); };
    if (loadedKey === rec.key && a.src){ begin(); return; }
    loadedKey = rec.key;
    if (url){ try { URL.revokeObjectURL(url); } catch(_){} }
    url = URL.createObjectURL(rec.blob);
    a.onloadedmetadata = begin;
    a.src = url;
    a.load();
  }
  function cancel(){
    seq++; stopTicker(); current = null;
    if (audioEl){ try { audioEl.pause(); } catch(_){} }
    setStatus();
  }
  function stop(){
    cancel(); expectNext = null; cancelQueued();
    if (audioEl){ try { audioEl.removeAttribute("src"); audioEl.load(); } catch(_){} }
    loadedKey = null;
    if (url){ try { URL.revokeObjectURL(url); } catch(_){} url = null; }
  }
  function setRate(r){ if (audioEl) audioEl.playbackRate = r; }

  /* ============================================================
     6. Settings (the rows in the Read-aloud voices panel) and the Cast panel
     ============================================================ */
  /* a narrator select; lazy = the list already on the device only, so nothing is sent to ElevenLabs while the app starts up */
  function fillVoices(sel, lazy){
    var have = voiceCache || storedVoices(true);
    sel.innerHTML = have ? voiceOptions(have, narratorId(have)) : '<option value="">Loading voices…</option>';
    if (lazy || (have && voiceCache)) return;
    voices().then(function(list){
      sel.innerHTML = voiceOptions(list, narratorId(list)) || '<option value="">No voices</option>';
      syncName();
    }, function(){ if (!have) sel.innerHTML = '<option value="">Voices unavailable</option>'; });
  }
  /* the bar names the narrator once the voice list is in */
  function syncName(){ if (isRunning() && Speak.syncBar) Speak.syncBar(); }
  /* the narrator selects in the bar, the voices panel and the Cast panel show the same voice */
  function showNarrator(id, from){
    var ids = ["ttsVoice", "elevenNarrator"], i, el;
    for (i = 0; i < ids.length; i++){
      el = document.getElementById(ids[i]);
      if (!el || el === from || (ids[i] === "ttsVoice" && !elevenRunning())) continue;
      el.value = id;
      if (el.value !== id && apiKey()) fillVoices(el);
    }
    if (Side && Side.is && Side.is("cast") && Side.body){
      el = Side.body.querySelector('select[data-key="narrator"]');
      if (el && el !== from) el.value = id;
    }
    syncName();
  }
  function setNarrator(id, from){
    if (!id) return;
    Store.set(K_NARR, id);
    if (plan && plan.src === SRC.eleven) plan.narrator = id;
    showNarrator(id, from); replan(SRC.eleven);
  }
  /* the narrator select in the read-aloud bar; Speak restarts the sentence if it is playing */
  function voiceChanged(id){
    if (!id) return;
    Store.set(K_NARR, id);
    if (plan && plan.src === SRC.eleven){ plan.narrator = id; cancelQueued(); buildClips(); }
    showNarrator(id, document.getElementById("ttsVoice"));
  }
  function setModel(m){
    if (MODELS.indexOf(m) < 0) return;
    Store.set(K_MODEL, m);
    syncSettings(true);
    replan(SRC.eleven);
  }
  /* asked: the reader did something (opened the panel, chose ElevenLabs, changed the key), so the voice list may be fetched */
  function syncSettings(asked){
    if (typeof document === "undefined") return;
    var sel = document.getElementById("elevenNarrator"), chips = document.getElementById("elevenModelChips"), link = document.getElementById("elevenKeyLink");
    if (chips) Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function(c){
      var on = c.dataset.model === model(); c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
    });
    if (sel){
      if (!apiKey()){ sel.disabled = true; sel.innerHTML = '<option value="">Add a key first</option>'; }
      else { sel.disabled = false; fillVoices(sel, !asked); }
    }
    if (link) link.textContent = apiKey() ? "Change the ElevenLabs API key…" : "ElevenLabs API key…";
    audioSync();
  }
  /* ---- the natural voices' rows: narrator, and the model's download / ready / remove row ---- */
  function kokoroFillVoices(sel){ sel.innerHTML = kokoroOptions(KOKORO_VOICES, kokoroNarrator()); }
  function kokoroShowNarrator(id, from){
    ["ttsVoice", "kokoroNarrator"].forEach(function(i){
      var el = document.getElementById(i);
      if (el && el !== from && !(i === "ttsVoice" && !kokoroRunning())) el.value = id;
    });
    if (Side && Side.is && Side.is("cast") && Side.body){ var el = Side.body.querySelector('select[data-key="narrator"]'); if (el && el !== from) el.value = id; }
    syncName();
  }
  function kokoroSetNarrator(id, from){
    if (!kokoroVoice(id)) return;
    Store.set(K_KNARR, id);
    if (plan && plan.src === SRC.kokoro) plan.narrator = id;
    kokoroShowNarrator(id, from);
    replan(SRC.kokoro);
  }
  /* the narrator select in the read-aloud bar; Speak restarts the sentence if it is playing */
  function kokoroVoiceChanged(id){
    if (!kokoroVoice(id)) return;
    Store.set(K_KNARR, id);
    if (plan && plan.src === SRC.kokoro){ plan.narrator = id; cancelQueued(); buildClips(); }
    kokoroShowNarrator(id, document.getElementById("ttsVoice"));
  }
  function kokoroSync(){
    if (typeof document === "undefined") return;
    var sel = document.getElementById("kokoroNarrator"), st = document.getElementById("kokoroState");
    var dl = document.getElementById("kokoroDl"), rm = document.getElementById("kokoroRm"), pr = document.getElementById("kokoroProgress");
    if (sel){ if (sel.options.length < KOKORO_VOICES.length) kokoroFillVoices(sel); else sel.value = kokoroNarrator(); }
    audioSync();
    if (!st) return;
    function show(text, canDl, canRm, pct){
      st.textContent = text;
      if (dl) dl.hidden = !canDl;
      if (rm) rm.hidden = !canRm;
      if (pr){ pr.hidden = pct < 0; if (pct >= 0) pr.value = pct; }
    }
    if (kLoad){ show(kPct >= 0 ? "Downloading… " + kPct + "%" : "Preparing…", false, false, kPct); return; }
    function have(h){
      if (h.ready) show("Ready · " + mb(h.bytes || KOKORO_MB * 1048576) + " on this device", false, true, -1);
      else show(navigator.onLine ? "Not on this device yet" : "Not on this device yet — needs a connection once", true, false, -1);
    }
    if (kHave) have(kHave); else show("Checking…", false, false, -1);     /* what was last seen, while the cache is asked again */
    kokoroOnDevice().then(function(h){ if (!kLoad && document.getElementById("kokoroState") === st) have(h); });
  }

  /* the panel is drawn afresh each time it opens, so its rows are handled from the document; the key link, the
     download and remove buttons and the Cast button are Speak's, so they work before this script has loaded */
  if (typeof document !== "undefined"){
    document.addEventListener("change", function(e){
      var t = e.target;
      if (t && t.id === "elevenNarrator" && t.value) setNarrator(t.value, t);
      if (t && t.id === "kokoroNarrator" && t.value) kokoroSetNarrator(t.value, t);
    });
    document.addEventListener("click", function(e){
      var c = e.target && e.target.closest ? e.target.closest("#elevenModelChips .chip") : null;
      if (c && c.dataset.model) setModel(c.dataset.model);
    });
  }

  /* ---- the Cast panel: every character found in the document, with a voice each ---- */
  function speakEngine(){ return Speak && Speak.engine ? Speak.engine() : "device"; }
  /* the ElevenLabs or Kokoro plan for the open document: the one being read, or worked out now for a text document
     (the cast needs no model and no key beyond the voice list) */
  function castPlan(src){
    var docId = Library && Library.currentId ? Library.currentId() : "";
    if (plan && plan.src === src && plan.docId === (docId || "") && plan.clips) return Promise.resolve(plan);
    if (state && state.mode === "doc" && Speak && Speak.buildDocUnits){
      var units = Speak.buildDocUnits();
      return planFor(src, units, { docId: docId, mode: "doc", title: document.title, lang: Speak.docLang ? Speak.docLang() : "" }).then(function(){ return plan; });
    }
    return Promise.reject(new Error("Start reading aloud first to find who speaks on these pages."));
  }
  /* the device plan: the one Speak is reading with, or worked out now for a text document */
  function devicePlan(){
    var S = window.llSpeak, docId = Library && Library.currentId ? Library.currentId() : "";
    var live = S && S.castPlan ? S.castPlan() : null;
    if (live && live.docId === (docId || "")) return Promise.resolve(live);
    if (devPlan && devPlan.docId === (docId || "")) return Promise.resolve(devPlan);
    if (state && state.mode === "doc" && Speak && Speak.buildDocUnits && S){
      return deviceCast(Speak.buildDocUnits(), { docId: docId, mode: "doc" },
        { lang: S.lang(), narrator: S.currentVoice(), voices: S.sortedVoices, gender: S.voiceGender, id: S.voiceId, find: S.findVoice });
    }
    return Promise.reject(new Error("Start reading aloud first to find who speaks on these pages."));
  }
  function openCast(){ if (Side && Side.open) Side.open("cast", "Voices for characters", renderCast); }
  var castFocus = null;
  function refreshCast(){
    if (!(Side && Side.is && Side.is("cast") && Side.refresh)) return;
    var act = document.activeElement;
    castFocus = act && act.dataset && act.dataset.key && Side.body && Side.body.contains(act) ? act.dataset.key : null;
    Side.refresh("cast", renderCast);
  }
  function who(c){ return (c.gender === "unknown" ? "" : c.gender + " · ") + c.lines + (c.lines === 1 ? " line" : " lines"); }
  function focusBack(wrap){
    if (!castFocus) return;
    /* the panel was redrawn under the reader: focus goes back to the row they were on */
    var sels = wrap.querySelectorAll("[data-key]"), back = document.getElementById("sideClose"), f;
    for (f = 0; f < sels.length; f++) if (sels[f].dataset.key === castFocus){ back = sels[f]; break; }
    castFocus = null;
    if (back) back.focus({ preventScroll: true });
  }
  function renderCast(body, foot){
    if (!state || (state.mode !== "doc" && state.mode !== "pdf")){ body.innerHTML = '<div class="empty-note">Open a book first.</div>'; return; }
    if (speakEngine() === "device"){ renderDeviceCast(body, foot); return; }
    var src = speakEngine() === "kokoro" ? SRC.kokoro : SRC.eleven;
    if (src === SRC.eleven && !apiKey()){
      body.innerHTML = '<div class="empty-note">Add an ElevenLabs API key first.</div>';
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = "ElevenLabs API key…";
      b.addEventListener("click", function(){ askForKey(); });
      foot.appendChild(b);
      return;
    }
    body.innerHTML = '<div class="empty-note">Finding who speaks…</div>';
    castPlan(src).then(function(pl){
      if (!Side.is("cast")) return;
      var map = pl.rec[pl.src.castKey];
      var h = '<div class="cast-row"><div class="cast-who"><b>Narrator</b><span>everything outside the quotes</span></div>' +
              '<select class="sel" data-key="narrator" aria-label="Voice for the narrator">' + pl.src.options(pl.list, pl.narrator) + '</select></div>';
      pl.cast.forEach(function(c){
        h += '<div class="cast-row"><div class="cast-who"><b>' + esc(c.name) + '</b><span>' + esc(who(c)) + '</span></div>' +
             '<select class="sel" data-key="' + esc(c.key) + '" aria-label="Voice for ' + esc(c.name) + '">' + pl.src.options(pl.list, map[c.key] || pl.narrator) + '</select></div>';
      });
      if (!pl.cast.length) h += '<div class="empty-note">No dialogue found — the narrator reads everything.</div>';
      else h += '<div class="cast-note">Speakers are worked out on this device from the quoted lines and speech tags (“said Anna”, “he whispered”). A change applies from the next sentence.</div>';
      var wrap = document.createElement("div");
      wrap.innerHTML = h;
      body.innerHTML = ""; body.appendChild(wrap);
      focusBack(wrap);
      wrap.addEventListener("change", function(e){
        var sel = e.target.closest("select[data-key]"); if (!sel || !sel.value) return;
        if (sel.dataset.key === "narrator"){
          pl.narrator = sel.value;
          if (pl.src === SRC.kokoro){ Store.set(K_KNARR, sel.value); kokoroShowNarrator(sel.value, sel); }
          else { Store.set(K_NARR, sel.value); showNarrator(sel.value, sel); }
        } else { map[sel.dataset.key] = sel.value; pl.rec.updated = Date.now(); saveCast(pl.rec); }
        if (plan === pl) replan();
      });
    }, function(err){
      if (Side.is("cast")) body.innerHTML = '<div class="empty-note">' + esc((err && err.message) || "Couldn’t load the voices") + '</div>';
    });
  }
  /* the device section: per character a device voice (or the dialogue voice) and a pitch; changes persist
     and apply on the next unit read */
  function deviceOptions(S, selected){
    var groups = { f: [], m: [], "": [] };
    S.sortedVoices().forEach(function(v){ groups[S.voiceGender(v)].push(v); });
    return '<option value=""' + (selected ? '' : ' selected') + '>Dialogue voice</option>' +
      [["f", "Women"], ["m", "Men"], ["", "Other"]].map(function(g){
        if (!groups[g[0]].length) return "";
        return '<optgroup label="' + g[1] + '">' + groups[g[0]].map(function(v){
          var id = S.voiceId(v);
          return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(S.shortName(v)) + (v.lang ? " · " + esc(v.lang) : "") + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
  }
  function renderDeviceCast(body, foot){
    var S = window.llSpeak;
    if (!S){ body.innerHTML = '<div class="empty-note">Read aloud isn’t available in this browser.</div>'; return; }
    if (Speak && Speak.cast && !Speak.cast()){
      body.innerHTML = '<div class="empty-note">Turn on “A voice per character” in Read-aloud voices first.</div>';
      return;
    }
    body.innerHTML = '<div class="empty-note">Finding who speaks…</div>';
    devicePlan().then(function(pl){
      if (!Side.is("cast")) return;
      var narr = S.currentVoice();
      var h = '<div class="cast-row"><div class="cast-who"><b>Narrator</b><span>everything outside the quotes</span></div>' +
              '<span class="cast-name">' + esc(narr ? S.shortName(narr) : "Default voice") + '</span></div>';
      pl.cast.forEach(function(c){
        var d = pl.rec.device[c.key] || null, vid = d ? d.voice : "", pitch = d && d.voice ? (+d.pitch || 1) : 1;
        h += '<div class="cast-row cast-dev"><div class="cast-who"><b>' + esc(c.name) + '</b><span>' + esc(who(c)) + '</span></div>' +
             '<select class="sel" data-key="' + esc(c.key) + '" aria-label="Voice for ' + esc(c.name) + '">' + deviceOptions(S, vid) + '</select>' +
             '<label class="cast-pitch"><span>Pitch</span><input type="range" min="0.7" max="1.3" step="0.05" value="' + pitch + '" data-pitch="' + esc(c.key) + '" aria-label="Pitch for ' + esc(c.name) + '"' + (vid ? '' : ' disabled') + '><span class="val">' + pitch.toFixed(2) + '</span></label></div>';
      });
      if (!pl.cast.length) h += '<div class="empty-note">No dialogue found — the narrator reads everything.</div>';
      else h += '<div class="cast-note">Speakers are worked out on this device from the quoted lines and speech tags (“said Anna”, “he whispered”); lines no one is named for take the dialogue voice. A change applies from the next sentence.</div>';
      var wrap = document.createElement("div");
      wrap.innerHTML = h;
      body.innerHTML = ""; body.appendChild(wrap);
      focusBack(wrap);
      function saveRow(key, voice, pitch){
        pl.rec.device[key] = { voice: voice, pitch: pitch };
        pl.rec.updated = Date.now(); saveCast(pl.rec);
      }
      wrap.addEventListener("change", function(e){
        var sel = e.target.closest("select[data-key]"); if (!sel) return;
        var row = sel.closest(".cast-row"), range = row.querySelector("input[data-pitch]"), v = sel.value;
        range.disabled = !v;
        if (!v) range.value = "1";
        row.querySelector(".val").textContent = (+range.value).toFixed(2);
        saveRow(sel.dataset.key, v, +range.value || 1);
      });
      wrap.addEventListener("input", function(e){
        var range = e.target.closest("input[data-pitch]"); if (!range) return;
        var row = range.closest(".cast-row"), sel = row.querySelector("select[data-key]");
        row.querySelector(".val").textContent = (+range.value).toFixed(2);
        saveRow(range.dataset.pitch, sel.value, +range.value || 1);
      });
    }, function(err){
      if (Side.is("cast")) body.innerHTML = '<div class="empty-note">' + esc((err && err.message) || "Couldn’t work out who speaks") + '</div>';
    });
  }

  /* ============================================================
     7. The engines, registered with Speak
     ============================================================ */
  var engine = {
    label: "ElevenLabs narration",
    supported: supported, ready: ready, prepare: prepare, speak: speak, cancel: cancel, stop: stop,
    setRate: setRate, fillVoices: fillVoices, voiceChanged: voiceChanged, narratorName: narratorName, syncSettings: syncSettings
  };
  if (Speak && Speak.registerEngine) Speak.registerEngine("eleven", engine);
  /* natural voices: the same clip player, fed by the worker; the model loads (or downloads, with its progress in
     the bar) while the cast is worked out, and the first sentence waits for both */
  var kEngine = {
    label: "Natural voices",
    supported: function(){ return supported() && !!(window.Worker && window.WebAssembly && window.caches); },
    ready: kokoroReady,
    prepare: function(units, ctx){
      if (!kReady) setStatus("Preparing…");
      var m = kokoroModel(); m.catch(function(){});
      return planFor(SRC.kokoro, units, ctx).then(function(){ return m; });
    },
    speak: speak, cancel: cancel, stop: stop, setRate: setRate,
    fillVoices: kokoroFillVoices, voiceChanged: kokoroVoiceChanged, narratorName: function(){ return kokoroName(kokoroNarrator()); }, syncSettings: kokoroSync
  };
  if (Speak && Speak.registerEngine) Speak.registerEngine("kokoro", kEngine);

  window.llAudiobook = { attribute: attribute, castDevice: castDevice, deviceCast: deviceCast, engine: engine, openCast: openCast, askForKey: askForKey,
                         voices: voices, setModel: setModel, syncSettings: syncSettings, sent: function(){ return sent; }, plan: function(){ return plan; },
                         devicePlan: function(){ return devPlan; },
                         kokoro: kEngine, kokoroVoices: KOKORO_VOICES, kokoroPool: kokoroPool, downloadKokoro: downloadKokoro, removeKokoro: removeKokoro,
                         kokoroOnDevice: kokoroOnDevice, kokoroState: function(){ return { ready: kReady, loading: !!kLoad, pct: kPct, threads: kThreads, worker: !!kw, jobs: Object.keys(kJobs).length }; },
                         clearAudio: clearAudio, audioTotal: audioTotal, trimAudio: trimAudio, wavBlob: wavBlob, assignVoices: assignVoices };
})();
