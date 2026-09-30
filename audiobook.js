/* lamplight — who speaks each line, a voice per character, and read aloud with ElevenLabs or natural (Piper, Kokoro) voices (see llAudiobook) */
/* ============================================================
   Lamplight — read aloud with several voices
   Works out who speaks each line on the device (the dialogue units
   Speak builds, speech-verb tags, pronouns and turn-taking), casts a
   device voice for every character (the "A voice per character"
   setting of the built-in engine), and registers three engines with Speak
   (app.js) that play clips: "eleven" — a narrator voice plus a voice per
   character from api.elevenlabs.io with the reader's own key — and the
   natural voices, a model run on this device after a one-time download:
   "piper" ("Fast", Piper in workers/piper-worker.js: en_US-libritts_r-medium, and nl_NL-mls-medium for Dutch books)
   and "kokoro" ("Best", Kokoro-82M in workers/kokoro-worker.js). All make
   their clips a little ahead of playback and keep every clip in IndexedDB
   so replaying costs nothing; they differ only in where a clip comes from
   (SRC below; the two natural ones share everything but their model, NAT).
   window.llAudiobook.attribute(units) and .castDevice(cast, voices, opts)
   are the pure steps; .deviceCast(units, ctx, opts) is what Speak's
   device engine calls.
   ============================================================ */
(function(){
  "use strict";
  /* the interface's language (i18n.js): _t("Prepare book") is the Dutch while the interface is Dutch, else the English */
  var I18N = (typeof window !== "undefined" && window.LL_I18N) || null;
  function _t(s, v){ return I18N ? I18N.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, function(m, k){ return k in v ? v[k] : m; }) : s); }
  function _tn(n, one, other, v){ var o = { n: n }; for (var k in v || {}) o[k] = v[k]; return _t(Number(n) === 1 ? one : other, o); }
  /* numbers in Dutch through Intl (1.234, 1,05); English keeps the forms it always had */
  function isNl(){ return !!(I18N && I18N.lang && I18N.lang() === "nl"); }
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
  /* natural voices: each model in its worker, where the browser keeps it, and the clips kept on the device —
     Kokoro ("Best") and Piper ("Fast", about 11 times quicker, so it keeps up with reading on a phone) */
  var K_KNARR = "ll_kokoro_narrator", KOKORO_MODEL = "kokoro-82m-q8", KOKORO_MB = 105;       /* the model and its 28 voice files */
  var KOKORO_CACHES = ["transformers-cache", "kokoro-voices"];    /* Cache Storage: the model files, the voice files */
  var P_NARR = "ll_piper_narrator", PIPER_MODEL = "piper-libritts_r-medium", PIPER_MB = 80;
  var P_NARR_NL = "ll_piper_narrator_nl", PIPER_NL_MODEL = "piper-nl_NL-mls-medium", PIPER_NL_MB = 77;   /* the Dutch pack */
  var PIPER_CACHES = ["piper-voices"];                              /* Cache Storage: the model and its config */
  var AUDIO_CAP = 400 * 1024 * 1024;    /* clips kept in IndexedDB across all documents; the oldest go first */
  /* natural voices without pauses (5b): each model's measured speed per device (seconds of work per second of audio,
     characters per second of audio), half an hour of audio made ahead, and the smart start's window and longest wait */
  var K_RTF = "ll_kokoro_rtf", K_CPS = "ll_kokoro_cps", K_SLOWTIP = "ll_kokoro_slowtip";
  var P_RTF = "ll_piper_rtf", P_CPS = "ll_piper_cps";
  var FEED_AHEAD = 30 * 60, HOLD_WINDOW = 10 * 60, HOLD_CAP = 90;   /* seconds */
  /* before read-aloud has been started in a document, only its first minute is made ahead (so the first play starts at
     once); once it has, half an hour, until reading has been stopped for three minutes */
  var FEED_LEAD = 60, FEED_LINGER = 3 * 60 * 1000;
  /* a model's worker (and the few hundred MB it holds) is let go after three minutes with nothing to do */
  var NAT_IDLE = 3 * 60 * 1000;

  /* ============================================================
     1. Who speaks — offline heuristics (no network, no DOM)
     The evidence for a quote, strongest first: a speech tag in its sentence or in the narration beside it in the
     paragraph (“said Anna”, “Tom asked”, “she whispered”, “cried his wife”, “said the captain”); an action beat, a
     sentence of the paragraph whose subject is a character (“Anna frowned. “…”” — the one who acts speaks); a
     name addressed inside the quote (“Tom, wait!”), who is not the speaker and is the likely next one to answer;
     then the conversation: its participants (named, acting or speaking in the scene, forgotten at a chapter break
     and after long narration) take turns, a new paragraph a new speaker, the same paragraph the same one.
     Pronouns go to the latest character of that gender (the narration's too); gender comes from titles
     (Mr, Lady…), a list of common first names, then he/she beside the name. Dialogue written with dashes
     ("— Kom je mee? vroeg Anna.") counts as quoted: the speech tag after it is narration and names the speaker.
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
    "promise promises promised respond responds responded tell tells told order orders ordered think thinks thought muse muses mused " +
    "return returns returned rejoin rejoins rejoined resume resumes resumed interpose interposes interposed counter counters countered " +
    "concede concedes conceded conclude concludes concluded pursue pursues pursued whimper whimpers whimpered snarl snarls snarled " +
    "roar roars roared chuckle chuckles chuckled giggle giggles giggled snort snorts snorted sneer sneers sneered drawl drawls drawled " +
    "bellow bellows bellowed whine whines whined wail wails wailed beg begs begged boast boasts boasted scoff scoffs scoffed " +
    "croak croaks croaked squeal squeals squealed stutter stutters stuttered persist persists persisted advise advises advised " +
    "sing sings sang coax coaxes coaxed scold scolds scolded soothe soothes soothed " +
    /* Dutch ("zei Pieter", "vroeg ze", "antwoordde ik"): words English text never has, so English books are not touched */
    "zei zegt zeiden vroeg vraagt vroegen riep roept riepen antwoordde antwoordt fluisterde fluistert mompelde mompelt zuchtte zucht " +
    "lachte lacht schreeuwde schreeuwt snauwde snauwt stamelde stamelt herhaalde herhaalt vervolgde vervolgt sprak spreekt bromde bromt " +
    "gilde snikte grinnikte hijgde smeekte beval beveelt protesteerde protesteert kreunde kreunt jammerde jammert")
    .split(" ").concat(["go on", "goes on", "went on", "cut in", "cuts in", "put in", "puts in", "chime in", "chimes in", "chimed in",
                        "blurt out", "blurts out", "blurted out", "call out", "calls out", "called out", "cry out", "cries out", "cried out",
                        "ging verder", "gaat verder"]);
  VERB_FORMS.sort(function(a, b){ return b.length - a.length; });
  var VERB = "(?:" + VERB_FORMS.join("|") + ")";
  /* “she added”, “he went on”: the same speaker as the line before */
  var CONT = /^(?:continue|continues|continued|go on|goes on|went on|add|adds|added|resume|resumes|resumed|pursue|pursues|pursued|persist|persists|persisted|vervolgde|vervolgt|ging verder|gaat verder)$/;
  /* titles: the ones that say a man or a woman, and the ones that say neither */
  var TGEN = {};
  ("mr sir lord uncle father brother king prince duke count baron master messrs meneer oom opa").split(" ").forEach(function(t){ TGEN[t] = "male"; });
  ("mrs miss ms mme mlle lady aunt madam madame dame mother sister queen princess duchess countess baroness mistress mevrouw juffrouw tante oma").split(" ").forEach(function(t){ TGEN[t] = "female"; });
  /* title words that are also ordinary words ("General Terms", "Master Bedroom"): not enough on their own */
  var TWEAK = { general: 1, major: 1, count: 1, master: 1, judge: 1, king: 1, queen: 1, prince: 1, princess: 1, duke: 1, duchess: 1, countess: 1,
                baron: 1, baroness: 1, father: 1, mother: 1, sister: 1, brother: 1, mistress: 1, admiral: 1 };
  var TNORM = { capt: "captain", col: "colonel", lt: "lieutenant", sgt: "sergeant", prof: "professor", rev: "reverend", doctor: "dr", dokter: "dr", mijnheer: "meneer" };
  /* the Dutch ones also in lower case (TITLE_NL), as Dutch writes them in a sentence ("zei mevrouw Jansen") */
  var TITLE_W = "Mr|Mrs|Ms|Mx|Dr|Miss|Mme|Mlle|Messrs|Aunt|Uncle|Captain|Capt|Colonel|Col|Major|General|Admiral|Lieutenant|Lt|Sergeant|Sgt|Inspector|" +
                "Professor|Prof|Judge|Reverend|Rev|Father|Sister|Brother|Mother|Lord|Lady|Sir|Dame|Madam|Madame|King|Queen|Prince|Princess|Duke|Duchess|" +
                "Count|Countess|Baron|Baroness|Master|Mistress|Meneer|Mijnheer|Mevrouw|Juffrouw|Dokter|Tante|Oom|Opa|Oma";
  var TITLE_NL = "meneer|mijnheer|mevrouw|juffrouw|dokter|tante|oom|opa|oma";      /* never with a full stop: "oom. Straks" is two sentences */
  var TITLE = "(?:(?:" + TITLE_W + ")\\.?|(?:" + TITLE_NL + "))\\s+";
  /* a capitalised word (McKay, O’Brien, Anne-Marie), ending on a letter */
  var WORD = "[A-Z](?:[a-z\\u00C0-\\u024F'\\u2019-]|[A-Z](?=[a-z]))*[a-z\\u00C0-\\u024F]";
  /* "St." belongs to the name it is in ("Lord St. Simon", "Neville St. Clair") */
  var SAINT = "(?:Ste?\\.\\s+)?";
  var NAME = "((?:" + TITLE + ")?" + SAINT + WORD + "(?:\\s+" + SAINT + WORD + "){0,2})";
  var ADV = "(?:[a-z]+ly\\s+)?";
  /* who a quote can be said by without a name: “said his wife”, “the old man said”, “said the captain” */
  var NOUNS = {}, NOUN_LIST = [];
  [["female", "wife lady mother sister daughter aunt niece grandmother widow woman girl lass maid maiden bride nurse governess hostess landlady queen princess duchess countess mistress"],
   ["male", "husband father brother son uncle nephew grandfather widower man gentleman boy lad fellow groom host landlord king prince duke count master"],
   ["", "captain doctor professor colonel major general inspector sergeant lieutenant judge stranger visitor newcomer voice figure friend companion child servant driver officer clerk priest vicar"]
  ].forEach(function(g){ g[1].split(" ").forEach(function(w){ NOUNS[w] = { g: g[0] }; NOUN_LIST.push(w); }); });
  ["wife", "husband", "lady"].forEach(function(w){ NOUNS[w].spouse = true; });
  ["mother", "wife", "lady", "aunt", "widow"].forEach(function(w){ NOUNS[w].pref = { mrs: 1, lady: 1 }; });
  ["father", "husband", "uncle"].forEach(function(w){ NOUNS[w].pref = { mr: 1, sir: 1, lord: 1 }; });
  ["captain", "professor", "colonel", "major", "general", "inspector", "sergeant", "lieutenant", "judge", "king", "queen", "prince", "princess", "duke", "duchess", "count", "countess"]
    .forEach(function(w){ NOUNS[w].title = w; });
  NOUNS.doctor.title = "dr";
  ["stranger", "visitor", "newcomer", "voice", "figure"].forEach(function(w){ NOUNS[w].anon = true; });
  ["friend", "companion"].forEach(function(w){ NOUNS[w].mate = true; });      /* "my companion": in a first-person book, someone in the scene */
  NOUN_LIST.sort(function(a, b){ return b.length - a.length; });
  var ADJS = "old|young|little|elder|eldest|younger|youngest|other|poor|tall|short|big|small|stout|thin|pale|fat|grey|gray|first|second|third|dear|good|kind|" +
             "bearded|elderly|strange|unknown|mysterious|new|same|masked|handsome";
  /* a title used as a name takes a capital: "the Count shrugged", "said the Colonel" */
  var DESC = "((?:[Tt]he|[Hh]is|[Hh]er|[Tt]heir|[Mm]y|[Oo]ur)\\s+(?:(?:" + ADJS + ")\\s+){0,2}(?:" + NOUN_LIST.map(function(w){
    return NOUNS[w].title ? "[" + w.charAt(0).toUpperCase() + w.charAt(0) + "]" + w.slice(1) : w;
  }).join("|") + "))\\b";
  /* someone the narration brings in without a name: "A man entered", "a stranger was standing in the doorway" */
  var PERSONS = "man|woman|girl|boy|gentleman|lady|stranger|figure|visitor|newcomer|lad|lass|youth|fellow";
  /* the verb after a sentence's subject: most past and present forms, the common irregular ones, auxiliaries */
  var VERBISH = "(?:[a-z]+ed|[a-z]{2,}s|is|are|has|was|were|had|did|could|would|should|might|must|can|will|shall|came|went|sat|stood|took|gave|made|got|ran|saw|knew|felt|" +
    "thought|began|held|kept|left|put|set|let|brought|caught|drew|fell|found|told|threw|wore|wrote|shook|spoke|broke|chose|hung|lay|led|meant|met|paid|read|" +
    "rode|rose|sang|slept|struck|swung|taught|tore|woke|bit|blew|built|bought|dug|fled|flung|forgot|froze|grew|heard|hid|hit|hurt|knelt|leant|leapt|lost|rang|" +
    "sank|shut|slid|sprang|stole|stuck|strode|swam|swept|swore|understood|wept|won|drank|ate|fought|sought|spun|crept|dealt|fed|lit|sent|spent|bent|lent|shone|" +
    "shot|sped|spat|spread|strove|thrust|trod|wound|said|smiled|laughed|nodded|shrugged|frowned|sighed|grinned|glanced|turned|looked|walked|waited|" +
    /* Dutch, the past tense of the verbs an action beat uses ("Anna fronste.", "Hij schudde zijn hoofd.") */
    "stond|zat|liep|keek|ging|kwam|zag|nam|gaf|bleef|werd|trok|pakte|sloot|hield|dacht|schudde|fronste|knikte|glimlachte|lachte|zuchtte|legde|" +
    "vouwde|haalde|draaide|opende|wachtte|zette|stapte|greep|leunde|staarde|zei|vroeg|riep|antwoordde)";
  var PRON_SUBJ = "[Hh]e|[Ss]he|I|[Hh]ij|[Hh]y|[Zz]ij|[Zz]y|[Zz]e|[Ii]k";
  /* a subject or tag pronoun as he / she / they / i (Dutch: hij, zij and ze, ik; hy and zy in older spelling) */
  var PRON_NORM = { hij: "he", hy: "he", zij: "she", zy: "she", ze: "she", ik: "i" };
  function pronOf(w){ var l = w === "I" ? "i" : String(w).toLowerCase(); return PRON_NORM[l] || l; }
  var RX = {
    nameVerb: new RegExp(NAME + "\\s+" + ADV + "\\b(" + VERB + ")\\b", "g"),
    /* "said Anna", "added little Amy" */
    verbName: new RegExp("\\b(" + VERB + ")\\s+" + ADV + "(?:(?:little|old|young|poor|dear|good|big|small|kind|elder|eldest)\\s+)?" + NAME, "g"),
    pronVerb: new RegExp("\\b(he|she|they|He|She|They|I|hij|Hij|hy|Hy|zij|Zij|zy|Zy|ze|Ze|ik|Ik)\\s+" + ADV + "\\b(" + VERB + ")\\b", "g"),
    verbPron: new RegExp("\\b(" + VERB + ")\\s+(he|she|they|I|hij|hy|zij|zy|ze|ik)\\b", "g"),
    descVerb: new RegExp("\\b" + DESC + "\\s+" + ADV + "\\b(" + VERB + ")\\b", "g"),
    verbDesc: new RegExp("\\b(" + VERB + ")\\s+" + ADV + "\\b" + DESC, "g"),
    /* narration that ends by introducing the quote: `Anna said, “` */
    tagEnd: new RegExp("\\b" + VERB + "\\s*[,:]?\\s*$"),
    /* a word broken across two lines of PDF text: "Ba-\nker" */
    softHyphen: /([a-z])-\s+(?=[a-z])/g,
    /* a quote that ends in a full stop (its closing mark may be there or, in a dialogue unit, left out) */
    fullStop: /[.…]["”’»]?$/,
    capital: /^\s*[A-Z]/,
    title: new RegExp("^(" + TITLE_W + "|" + TITLE_NL + ")(\\.?)\\s+"),
    male: /\b(he|him|his|himself|hij|hy|hem)\b/gi,
    female: /\b(she|her|hers|herself|zij|zy|haar)\b/gi,
    sentenceEnd: /[.!?…]+["”’)]*(?:\s+|$)/g,
    letter: /[A-Za-zÀ-ɏ]/,
    abbrev: /(?:^|[\s"“(])(?:Mr|Mrs|Ms|Mx|Dr|St|Jr|Sr|Prof|Capt|Col|Lt|Sgt|Rev|Mme|Mlle|Messrs)$/,
    /* every name in a stretch of narration */
    names: new RegExp(NAME, "g"),
    /* a sentence's subject and its verb: a description, a pronoun or a name */
    subject: new RegExp("(?:^|[\\s,;:(\\u2014\\u2013-])(" + DESC + "|" + PRON_SUBJ + "|(?:" + TITLE + ")?" + SAINT + WORD + "(?:\\s+" + SAINT + WORD + "){0,2})\\s+" +
                        "(?:(?:[a-z]+ly|not|never|only|just|still|then|also|now|always|already|again|at once)\\s+)?" + VERBISH + "\\b", "g"),
    /* names addressed in a quote: at a sentence's start (“Tom, wait!”, “Oh, Anna!”) or after a comma (“…, Anna?”) */
    vocStart: new RegExp("(?:^|[.!?\\u2026]\\s+)[^A-Za-z]*(?:(?:[Oo]h|O|[Aa]h|[Ww]ell|[Nn]ow|[Cc]ome|[Yy]es|[Nn]o|[Nn]ay|[Ww]hy|[Ll]ook|[Ll]isten|[Pp]lease|[Hh]ello|[Hh]i|[Hh]ey|" +
                         "[Gg]oodbye|[Gg]ood (?:morning|night|evening|afternoon|day)|[Tt]hank you|[Tt]hanks|[Ss]orry|[Ss]top|[Ww]ait|[Mm]y (?:dear|dearest|good|poor)|[Dd]ear|[Dd]earest|[Pp]oor)[,!]?\\s+)?" +
                         NAME + "\\s*[,!?]", "g"),
    vocMid: new RegExp("[,;]\\s+(?:(?:[Mm]y\\s+)?(?:dear|dearest|good|poor|little)\\s+)?" + NAME + "\\s*(?=[,.!?\\u2026;:\\u2014\\u2013-]|$)", "g"),
    spouse: /\b(his|her)\s+(wife|husband|lady)\b/g,
    intro: new RegExp("(?:^|[.;,:!?\u2014]\\s*|\\b(?:and|when|then|as|while|until|till)\\s+)[Aa]n?\\s+(?:[a-z]+,?\\s+){0,3}?(" + PERSONS + ")\\s+(?:[a-z]+ly\\s+)?" + VERBISH + "\\b", "g"),
    /* "at Hunsford", "in Gracechurch Street": a place, not a person */
    place: /\b(?:at|in|near|into|towards|toward|from|through|across|inside|outside)\s+(?:the\s+)?$/i,
    /* a chapter or section line (EPUB and DOCX headings come flagged; plain text and PDFs have these) */
    chapter: new RegExp("^\\s*(?:(?:chapter|book|part|volume|section|act|scene|canto|stave|hoofdstuk|boek|deel)\\s+(?:[0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|" +
                        "eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|the\\s+[a-z]+|" +
                        "een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|dertien|veertien|vijftien|twintig|het\\s+[a-z]+)\\b[^\u201C\u201D\"]{0,70}|" +
                        "prologue|epilogue|interlude|afterword|foreword|proloog|epiloog|nawoord|voorwoord)\\s*$", "i"),
    /* a heading that is only a number: "IV.", "12" */
    numeral: /^\s*(?:[IVXLC]{1,7}|\d{1,3})\.?\s*$/
  };
  /* capitalised words that are not names (at a sentence's start, or words of address) */
  var STOP = {};
  ("The A An He She They I It But And Then When There This That What Who Yes No Oh Well Now So If In On At As Her His Their Our My Your Its " +
   "One Two Three Four Five Six Seven Eight Nine Ten Of To For With From By Or Nor Not All Some Any Each Every Both Either Neither Such Very Just Only Even " +
   "Still Yet Also Too Again Here Where Why How Which Whom Whose Whatever Whoever Once Twice Before After While Since Until Because Though Although Unless " +
   "Whether Perhaps Maybe Indeed Instead Meanwhile However Therefore Thus Otherwise Anyway Besides Finally First Last Next Nothing Something Anything " +
   "Everything Nobody Somebody Anybody Everybody None Never Always Sometimes Often Soon Later Today Tomorrow Yesterday Tonight Ah Ha Hey Hush Look Listen " +
   "Come Wait Stop Please Thank Thanks Sorry Good God Dear Right Okay Ok Sure Fine Great Hello Goodbye Hi Suddenly Slowly Quickly Quietly Softly Loudly Mr Mrs Ms Dr Miss " +
   "Ay Aye Nay Alas Upon Into Onto Over Under About Above Below Between Through During Without Within Across Against Among Around Behind Beside Beyond " +
   "Do Does Did Don Is Are Was Were Be Been Have Has Had Can Could Will Would Shall Should May Might Must Let Go Give Take Tell Say Said See Hear " +
   "Mother Father Mamma Mama Papa Mum Mom Dad Daddy Mummy Mommy Grandmother Grandfather Granny Grandma Grandpa Madam Madame Sir Sirs Doctor Captain " +
   "Uncle Aunt Lady Lord Master Mistress Darling Honey Sweetheart Love Friend Boy Girl Child Son Lad Gentlemen Ladies Everyone Heaven Heavens " +
   "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April June July August September October November December " +
   "Christmas Easter Chapter Book Part Section Volume English French German Latin Mrs Messrs Sister Brother Father Mother Majesty Highness Lordship Ladyship " +
   "You We Me Us Him Them Mine Yours Ours Theirs Except Excepting Whilst Till Unto Towards Pray Lo Hark Behold Certainly Surely Really Truly Of Course " +
   "Presently Instantly Directly Immediately Accordingly Evidently Apparently Probably Possibly Naturally Fortunately Unfortunately Luckily Happily Sadly " +
   "Clearly Obviously Merely Simply Nearly Hardly Scarcely Shortly Lately Afterwards Having Being Seeing Hearing Knowing Taking Getting Looking Turning " +
   "Children People Nor Yes " +
   /* Dutch sentence starters, pronouns and words of address, which would otherwise pass for names in a Dutch book */
   "En Maar Ja Nee Doch Zie Ziet Hoe Wat Wie Waar Toen Nu Als Want Omdat Hij Zij Ze Ik Je Jij Wij Het De Een Die Dat Dit Er Daar Hier " +
   "Zo Ook Nog Niet Geen Wel Och Ach Kom Mijnheer Meneer Mevrouw Juffrouw Hy Zy")
    .split(" ").forEach(function(w){ STOP[w] = 1; });
  /* about 460 common English first names, for the gender of a character no he or she has marked yet */
  var FIRST = {};
  ("abigail ada adela adelaide adele agatha agnes alice alicia alison amanda amelia amy anastasia andrea angela angelina ann anna annabel anne annie " +
   "antonia arabella audrey augusta barbara beatrice beatrix becky bella bernadette bertha beth betsy betty beverly bianca blanche bridget camilla carla " +
   "carol caroline carrie cassandra catherine cathy cecilia cecily celia charlotte chloe christina christine cicely clara clare claire clarissa constance " +
   "cora cordelia cynthia daisy daphne deborah delia diana dinah dolly dora doris dorothea dorothy edith edna eleanor elinor eliza elizabeth ella ellen " +
   "elsie emily emma esther ethel eugenia eva eve evelyn fanny felicity fiona flora florence frances georgiana georgina gertrude gloria grace gwen " +
   "gwendolen hannah harriet hazel heather helen helena henrietta hester hetty hilda honor honoria imogen irene iris isabel isabella isobel ivy jane " +
   "janet jean jemima jennifer jenny jessica jessie jill joan joanna josephine joy judith julia julie juliet karen kate katherine kathleen katie kitty " +
   "laura lavinia leah lena letitia lilian lillian lily linda lisa lizzie lizzy lois lorna lottie louisa louise lucia lucinda lucy lydia mabel madeleine " +
   "madeline maggie margaret margery maria marian marianne marie marilla marion marjorie martha mary matilda maud maude meg megan melanie mildred " +
   "millie minnie miranda miriam molly muriel nancy nell nellie nelly nina nora norah olive olivia pamela patience patricia pauline peggy penelope " +
   "philippa phoebe phyllis polly priscilla prudence rachel rebecca rhoda rita rosa rosalind rosamond rosamund rose rosie ruby ruth sally sara sarah " +
   "selina sibyl sophia sophie sophy stella susan susanna susannah sylvia tabitha tess tessa theresa ursula valerie vera victoria violet virginia " +
   "vivian wendy winifred").split(" ").forEach(function(w){ FIRST[w] = "female"; });
  ("aaron abel abraham adam adrian albert alec alexander alfred algernon alan allan ambrose amos andrew angus anthony archibald archie arnold arthur " +
   "augustus austin barnaby bartholomew basil ben benedict benjamin bernard bert bertie bill billy bob bobby brian bruce caleb carl cecil cedric charles " +
   "charlie christopher clarence claude clement clifford colin conrad cornelius cuthbert cyril damian daniel david dennis derek desmond dick donald " +
   "dorian douglas duncan edgar edmund edward edwin eli elijah elliot ernest eugene ezekiel ezra felix ferdinand fitzwilliam francis frank frankie fred " +
   "freddie frederick gabriel gavin geoffrey george gerald gideon gilbert giles godfrey gordon graham gregory guy harold harry harvey hector henry " +
   "herbert horace horatio howard hubert hugh hugo humphrey ian isaac ivan jack jacob jake james jamie jasper jeremy jerome jim jimmy joe joel john " +
   "johnny jonathan joseph joshua josiah jude julian julius keith kenneth kevin lawrence leo leonard lewis liam lionel lloyd louis luke malcolm marcus " +
   "mark martin matthew maurice max michael miles montague mortimer nathan nathaniel ned neil neville nicholas nick nigel noah norman oliver oscar " +
   "oswald otto owen patrick paul percy peter philip phillip ralph randolph raymond reginald rex richard robert roderick rodney roger roland ronald " +
   "rowland rufus rupert samuel sam sebastian septimus seth sidney silas simon solomon stanley stephen steven stuart ted teddy terence theodore thomas " +
   "timothy tobias toby tom tommy tony tristram uriah victor vincent walter wilfred will william willie willy wyatt zachary").split(" ").forEach(function(w){ FIRST[w] = "male"; });
  /* and common Dutch ones */
  ("anouk anneke betje els femke fleur geertruida ilse inge jacoba lieke lotte maaike marieke mathilde saskia sanne truus wilhelmina").split(" ").forEach(function(w){ FIRST[w] = "female"; });
  ("bas bram cornelis daan floris frits gerrit gijs hendrik henk jan jelle jeroen johan joost joris kees klaas lodewijk maarten niels pieter " +
   "ruben sjoerd stijn thijs willem wim").split(" ").forEach(function(w){ FIRST[w] = "male"; });
  /* pet names, merged with the full name when a document has both (Lizzy and Elizabeth) */
  var NICK = {};
  [["elizabeth", "lizzy lizzie liz eliza beth betsy bess bessie betty"], ["catherine", "kitty kate katie cathy kit"], ["katherine", "kitty kate katie kathy"],
   ["thomas", "tom tommy"], ["william", "bill billy will willy willie"], ["robert", "bob bobby rob robbie"], ["richard", "dick rick"], ["james", "jim jimmy jamie"],
   ["john", "jack johnny"], ["edward", "ned ted teddy"], ["henry", "harry"], ["charles", "charlie"], ["samuel", "sam"], ["joseph", "joe"], ["daniel", "dan danny"],
   ["michael", "mike"], ["nicholas", "nick"], ["anthony", "tony"], ["frederick", "fred freddie"], ["benjamin", "ben"], ["margaret", "peggy maggie meg"],
   ["mary", "molly polly"], ["sarah", "sally"], ["martha", "patty patsy"], ["eleanor", "nell nelly nellie"], ["helen", "nell nelly nellie"], ["anne", "annie nan nancy"],
   ["jane", "jenny"], ["susan", "sue susie"], ["frances", "fanny"], ["rebecca", "becky"], ["abigail", "abby"], ["dorothy", "dolly"], ["charlotte", "lottie"], ["matilda", "tilly"]
  ].forEach(function(r){ r[1].split(" ").forEach(function(w){ (NICK[w] = NICK[w] || []).push(r[0]); }); });
  var SYNTH = { he: ["He", "male"], she: ["She", "female"], they: ["They", "unknown"], "other-1": ["Another voice", "unknown"], "unknown-1": ["Unknown speaker", "unknown"] };

  var STYLES = [
    { open: "“", close: "”", rx: /“/g },
    { open: '"', close: '"', rx: /"/g },
    { open: "‘", close: "’", rx: /‘/g },
    { open: "«", close: "»", rx: /«/g },
    { open: "„", close: "”", rx: /„/g }      /* Dutch */
  ];
  /* the document's quote style: the most frequent kind of opening mark */
  function pickStyle(texts){
    var counts = STYLES.map(function(){ return 0; }), i, j;
    for (i = 0; i < texts.length; i++) for (j = 0; j < STYLES.length; j++) counts[j] += (texts[i].match(STYLES[j].rx) || []).length;
    counts[1] = counts[1] / 2;
    var best = 0;
    for (j = 1; j < STYLES.length; j++) if (counts[j] > counts[best]) best = j;
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
  /* dialogue written with dashes ("— Kom je mee? vroeg Anna.", "– Nee, zei Tom, ik blijf hier.", "— Ik weet het niet —
     antwoordde ze — misschien morgen."), for units that came without dialogue flags (Speak's own units come flagged, by
     app.js's dashSpans, which this follows): a paragraph that opens with a dash is speech up to its speech tag or a
     closing dash, and speech again after the tag or the next dash, unless narration follows the tag ("…, zei Tom. Hij
     draaide zich om."). A dash anywhere else (an aside — like this — in the narration) stays narration. */
  var DASH_OPEN = /^\s*(?:[\u2014\u2013]|-(?=\s))/;
  var DASH_WHO = "(?:hij|zij|ze|ik|wij|we|he|she|I|they|(?:" + TITLE + ")?" + WORD + "(?:\\s+" + WORD + ")?|" +
                 "(?:de|het|zijn|haar|mijn|hun|the|his|her|my|their)\\s+(?:[a-z\\u00C0-\\u024F]+\\s+){0,2}?[a-z\\u00C0-\\u024F]+)";
  var DASH_TAG = new RegExp("^(?:" + VERB + "\\s+" + DASH_WHO + "(?![A-Za-z\\u00C0-\\u024F'\\u2019])|" + DASH_WHO + "\\s+" + ADV + VERB +
                            "(?:\\s+[a-z]+ly)?(?=\\s*(?:[,.!?\\u2026;:\\u2014\\u2013]|-\\s|$)))");
  var DASH_ACT = /^(?!(?:Ik|I|Je|Jij|U|You|We|Wij|Het|Dat|Dit|Die|Er|Daar|Toen|En|Maar|Dan|Nu|Ja|Nee|It|That|This|There|Then|And|But|So|Yes|No)\s)(?:[Hh]ij|[Zz]ij|[Zz]e|[Hh]e|[Ss]he|[Tt]hey|[A-Z][a-z\u00C0-\u024F]+)\s+(?:[a-z]+ly\s+)?(?:[a-z\u00C0-\u024F]{2,}(?:de|te|ed)|stond|zat|liep|keek|ging|kwam|zag|nam|gaf|bleef|werd|trok|sloot|hield|greep|schudde|took|went|stood|sat|ran|came|gave|held|shook|looked|turned)(?![a-z\u00C0-\u024F])/;
  var DASH_CONJ = /^(?:en|maar|terwijl|toen|die|dat|waarna|want|met|zonder|and|but|while|as|who|which|with|without|then)(?![a-z\u00C0-\u024F])/;
  function dashAt(t, i){
    var c = t.charAt(i);
    return c === "\u2014" || c === "\u2013" || (c === "-" && (i === 0 || /\s/.test(t.charAt(i - 1))) && /\s/.test(t.charAt(i + 1)));
  }
  /* the speech of a paragraph that opens with a dash, as findQuotes gives it: [{ s, e }], s at the dash (or the comma or
     space before speech that goes on after a tag) */
  function dashQuotes(t){
    var out = [], m = DASH_OPEN.exec(t);
    if (!m) return out;
    var lines = t.replace(/\s+$/, "").split(/\n/);
    if (lines.length > 1 && lines.every(function(l){ return DASH_OPEN.test(l) && !/[.!?\u2026]["\u201D\u2019\u00BB]?\s*$/.test(l); })) return out;
    if (!/[.!?\u2026,;:\u2014\u2013\-"\u201D\u2019\u00BB)]\s*$/.test(t) && !/[?!]/.test(t)) return out;
    var n = t.length, open = m[0].length - 1, i = open + 1, c, w, head, held = false;
    function skip(k){ while (k < n && /\s/.test(t.charAt(k))) k++; return k; }
    while (i < n){
      c = t.charAt(i);
      if (open >= 0){
        if (/[,;:?!\u2026]/.test(c) && /\s/.test(t.charAt(i + 1))){
          w = skip(i + 1); head = t.substr(w, 80);
          if (DASH_TAG.test(head) || (/[?!]/.test(c) && /^[a-z\u00C0-\u024F]/.test(head))){ out.push({ s: open, e: i + 1 }); open = -1; held = false; i = w; continue; }
        } else if (dashAt(t, i)){
          w = skip(i + 1); head = t.substr(w, 120);
          if (DASH_TAG.test(head) || (DASH_ACT.test(head) && /\s(?:[\u2014\u2013]|-\s)/.test(head))){ out.push({ s: open, e: i }); open = -1; held = false; i = w; continue; }
        }
        i++;
        continue;
      }
      if (!held && dashAt(t, i)){ open = i; i++; continue; }
      if (!held && c === "," && /\s/.test(t.charAt(i + 1))){
        w = skip(i + 1);
        if (DASH_CONJ.test(t.substr(w, 12))) held = true;
        else { open = i; i = w; continue; }
      }
      if (/[.!?\u2026]/.test(c) && (i + 1 >= n || /\s/.test(t.charAt(i + 1)))){
        w = skip(i + 1);
        if (w >= n) break;
        if (dashAt(t, w)){ open = w; held = false; i = w + 1; continue; }
        if (!held){
          if (DASH_ACT.test(t.substr(w, 60))) held = true;
          else { open = i + 1; i = w; continue; }
        }
      }
      i++;
    }
    if (open >= 0) out.push({ s: open, e: n });
    return out.filter(function(q){ return RX.letter.test(t.slice(q.s + 1, q.e)) && t.slice(q.s + 1, q.e).trim().length >= 2; });
  }
  /* whether the paragraphs write dialogue with dashes: two or more dash paragraphs that read like speech (a question, an
     exclamation, a tag), a third of all the dash paragraphs at least, so a hyphenated list is not taken for dialogue */
  var DASH_SAID = new RegExp("[,?!\\u2026\\u2014\\u2013-]\\s*" + VERB + "\\s+\\S");
  function dashStyle(texts){
    var all = 0, talk = 0, i, head;
    for (i = 0; i < texts.length; i++){
      if (!DASH_OPEN.test(texts[i])) continue;
      all++; head = texts[i].slice(0, 400);
      if (dashQuotes(head).length && (/[?!]/.test(head) || DASH_SAID.test(head))) talk++;
    }
    return talk >= 2 && talk * 3 >= all;
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
  /* a stretch of text as sentences: [{ s, e }] */
  function sentencesOf(text){
    var out = [], m, from = 0;
    RX.sentenceEnd.lastIndex = 0;
    while ((m = RX.sentenceEnd.exec(text))){
      if (!m[0].length){ RX.sentenceEnd.lastIndex++; continue; }
      if (abbreviated(text, m)) continue;
      out.push({ s: from, e: m.index + m[0].length }); from = m.index + m[0].length;
    }
    if (from < text.length && /\S/.test(text.slice(from))) out.push({ s: from, e: text.length });
    return out;
  }
  /* "Mr. Darcy" → { key: "mr darcy", name: "Mr. Darcy", title: "mr", toks: ["darcy"] }; words that are not names are dropped */
  function cleanName(raw){
    var t = String(raw).replace(/\s+/g, " ").trim(), title = "", shown = "", m = RX.title.exec(t);
    if (m){ title = m[1].toLowerCase(); shown = m[1].charAt(0).toUpperCase() + m[1].slice(1) + m[2]; t = t.slice(m[0].length); }     /* "mevrouw" shows as "Mevrouw" */
    /* "Jane’s" is Jane; "I’ll" is no one */
    var toks = t.split(" ").map(function(w){ return /^I['’]/.test(w) ? "" : w.replace(/['’]s$/, "").replace(/[-'’]+$/, ""); });
    while (toks.length && (STOP[toks[0]] || !toks[0])) toks.shift();
    while (toks.length && (STOP[toks[toks.length - 1]] || !toks[toks.length - 1])) toks.pop();
    if (!toks.length) return null;
    title = TNORM[title] || title;
    var low = toks.map(function(w){ return w.toLowerCase().replace(/’/g, "'"); });
    return { key: (title ? title + " " : "") + low.join(" "), name: (shown ? shown + " " : "") + toks.join(" "), title: title, toks: low };
  }
  /* the speech tag nearest the quote in a piece of narration (NAME VERB, VERB NAME, PRONOUN VERB, VERB PRONOUN and the
     same with a description: "his wife said", "said the captain"); side is "after" when the text follows the quote and
     "before" when it precedes it */
  function tagIn(text, side){
    if (!text) return null;
    text = text.replace(RX.softHyphen, "$1");
    var found = [], best = null, m, nm, i, j;
    function add(kind, m, tag, verbAt, verb){ tag.src = text; tag.verb = String(verb).toLowerCase(); found.push({ kind: kind, at: m.index, end: m.index + m[0].length, verbAt: verbAt, tag: tag }); }
    function desc(s){
      var w = s.split(/\s+/), noun = w[w.length - 1].toLowerCase();
      return { desc: s.toLowerCase(), poss: w[0].toLowerCase(), noun: noun, adj: w.length > 2 ? w.slice(1, -1).join(" ").toLowerCase() : "" };
    }
    RX.nameVerb.lastIndex = 0;
    while ((m = RX.nameVerb.exec(text))){ nm = cleanName(m[1]); if (nm) add(0, m, nm, m.index + m[0].length - m[2].length, m[2]); }
    RX.verbName.lastIndex = 0;
    while ((m = RX.verbName.exec(text))){ nm = cleanName(m[2]); if (nm) add(1, m, nm, m.index, m[1]); }
    RX.pronVerb.lastIndex = 0;
    while ((m = RX.pronVerb.exec(text))) add(2, m, { pronoun: pronOf(m[1]) }, m.index + m[0].length - m[2].length, m[2]);
    RX.verbPron.lastIndex = 0;
    while ((m = RX.verbPron.exec(text))) add(3, m, { pronoun: pronOf(m[2]) }, m.index, m[1]);
    RX.descVerb.lastIndex = 0;
    while ((m = RX.descVerb.exec(text))) add(4, m, desc(m[1]), m.index + m[0].length - m[2].length, m[2]);
    RX.verbDesc.lastIndex = 0;
    while ((m = RX.verbDesc.exec(text))) add(5, m, desc(m[2]), m.index, m[1]);
    for (i = 0; i < found.length; i++){
      var f = found[i], skip = false;
      /* "she asked Anna", "said Anna to her mother": the subject before the verb speaks, the one after it is spoken to */
      if (f.kind === 1 || f.kind === 3 || f.kind === 5) for (j = 0; j < found.length && !skip; j++) skip = (found[j].kind === 0 || found[j].kind === 2 || found[j].kind === 4) && found[j].verbAt === f.verbAt;
      if (skip) continue;
      if (!best){ best = f; continue; }
      var nearer = side === "before" ? f.end > best.end : f.at < best.at;
      var same = side === "before" ? f.end === best.end : f.at === best.at;
      if (nearer || (same && f.kind < best.kind)) best = f;
    }
    return best ? best.tag : null;
  }
  function count(rx, text){ rx.lastIndex = 0; return (text.match(rx) || []).length; }
  /* the subjects of a stretch of narration: [{ at, kind: "name" | "pron" | "desc", nm | pron | d }], one per sentence at most */
  function subjectsIn(text){
    var out = [], ss = sentencesOf(text), i, m, s;
    for (i = 0; i < ss.length; i++){
      s = text.slice(ss[i].s, ss[i].e);
      RX.subject.lastIndex = 0;
      while ((m = RX.subject.exec(s)) && m.index < 90){
        var np = m[1], w0 = np.split(/\s+/)[0], x = null;
        if (/^(?:[Hh]e|[Ss]he|I|[Hh]ij|[Hh]y|[Zz]ij|[Zz]y|[Zz]e|[Ii]k)$/.test(np)) x = { kind: "pron", pron: pronOf(np) };
        else if (/^(?:the|his|her|their|my|our)$/i.test(w0) && NOUNS[np.split(/\s+/).pop().toLowerCase()]){
          var w = np.split(/\s+/);
          x = { kind: "desc", d: { desc: np.toLowerCase(), poss: w0.toLowerCase(), noun: w[w.length - 1].toLowerCase(), adj: w.length > 2 ? w.slice(1, -1).join(" ").toLowerCase() : "" } };
        } else { var nm = cleanName(np); if (nm) x = { kind: "name", nm: nm }; }
        if (x){ x.at = ss[i].s + m.index; x.rest = s.slice(m.index + m[0].length); out.push(x); break; }
        RX.subject.lastIndex = m.index + 1;
      }
    }
    return out;
  }
  /* names addressed in a quote's text: [cleanName] */
  function vocativesIn(text){
    var out = [], m, nm;
    RX.vocStart.lastIndex = 0;
    while ((m = RX.vocStart.exec(text))){
      /* "…sick of Mr. Bingley," — the full stop of "Mr." does not start a sentence */
      if (m[0].charAt(0) === "." && RX.abbrev.test(text.slice(0, m.index))){ RX.vocStart.lastIndex = m.index + 1; continue; }
      nm = cleanName(m[1]); if (nm) out.push(nm);
    }
    RX.vocMid.lastIndex = 0;
    while ((m = RX.vocMid.exec(text))){ nm = cleanName(m[1]); if (nm) out.push(nm); }
    return out;
  }

  /* units: [{ start, end, text, para?, page?, dialogue?, heading? }] in reading order (Speak's units). A unit built by
     Speak is either a quoted line (dialogue: true, the quote marks left out of its text) or narration; a
     list without dialogue flags (text that arrived some other way) has its quotes found in the text.
     Returns { units: [ [ {start, end, text, role} ... ] per unit ], roles: [ role per unit ],
               cast: [ {key, name, gender, lines, synthetic, mentions, first, aka} ] (those who speak),
               quotes: [ {role, unit, start, end, text} ] (every quoted line, in order),
               sections: [ {unit, title} ] (chapter and section headings) } */
  function attribute(units){
    var n = units ? units.length : 0, segs = new Array(n), roles = new Array(n), i, j, k, u, p, q, m;
    if (!n) return { units: [], roles: [], cast: [], quotes: [], sections: [] };
    var chars = {}, order = [], flagged = false, sections = [], quotes = [];
    for (i = 0; i < n && !flagged; i++) flagged = !!(units[i] && units[i].dialogue !== undefined);
    function character(key, name, extra){
      var c = chars[key];
      if (!c){
        c = chars[key] = { key: key, name: name, gender: "unknown", m: 0, f: 0, lines: 0, mentions: 0, first: -1, synthetic: false, aka: [] };
        order.push(key);
        if (extra) for (var x in extra) if (extra.hasOwnProperty(x)) c[x] = extra[x];
      }
      return c;
    }
    function synthetic(key){
      if (!chars[key]){ var c = character(key, SYNTH[key][0]); c.gender = SYNTH[key][1]; c.synthetic = true; c.anon = true; }
      return key;
    }

    /* paragraphs: runs of units with the same page and paragraph offset */
    var paras = [], cur = null;
    for (i = 0; i < n; i++){
      u = units[i] || {};
      var pk = (u.page || 0) + ":" + (u.para === undefined ? "u" + i : u.para);
      if (!cur || pk !== cur.pk){ cur = { pk: pk, units: [], base: [], text: "", quotes: [], heading: true }; paras.push(cur); }
      if (cur.text) cur.text += " ";
      cur.base.push(cur.text.length);
      cur.units.push(i);
      cur.text += String(u.text || "");
      if (!u.heading) cur.heading = false;
    }
    var style = flagged ? null : pickStyle(paras.map(function(x){ return x.text; }));
    var dashes = !flagged && dashStyle(paras.map(function(x){ return x.text; }));
    function unitAt(p, pos){ var r = 0; while (r + 1 < p.base.length && p.base[r + 1] <= pos) r++; return p.units[r]; }

    /* pass 1: quotes, their tags and the names addressed in them; the narration between them; the names met in the
       narration (a character is a name that is tagged, titled, a known first name seen more than once, or a name
       addressed that also acts) with the he/she beside them */
    var cands = {}, iSubj = 0, narrSents = 0;
    function cand(nm){
      var c = cands[nm.key];
      if (!c) c = cands[nm.key] = { key: nm.key, name: nm.name, title: nm.title, toks: nm.toks, tag: 0, voc: 0, list: 0, mid: 0, subj: 0, place: 0, m: 0, f: 0, n: 0 };
      c.n++;
      if (nm.title) c.title = nm.title;
      if (FIRST[nm.toks[0]]) c.list = 1;
      return c;
    }
    for (k = 0; k < paras.length; k++){
      p = paras[k];
      var ptext = p.text.replace(/\s+/g, " ").trim();
      if (!p.heading && ptext.length < 90 && (RX.chapter.test(ptext) || RX.numeral.test(ptext)) && !(flagged && p.units.some(function(ui){ return units[ui] && units[ui].dialogue; }))) p.heading = true;
      if (p.heading){ sections.push({ unit: p.units[0], title: ptext.slice(0, 80) }); p.narr = []; continue; }
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
      } else {
        if (dashes && DASH_OPEN.test(p.text)) p.quotes = dashQuotes(p.text);
        if (!p.quotes.length && style) p.quotes = findQuotes(p.text, style);
      }
      p.narr = [];
      var pos = 0;
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        if (q.s > pos) p.narr.push({ s: pos, e: q.s });
        pos = q.e;
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
          var tc = cand(q.tag); tc.tag = 1;
          tc.m += count(RX.male, q.tag.src); tc.f += count(RX.female, q.tag.src);
        }
        q.voc = vocativesIn(p.text.slice(q.s, q.e));
        for (j = 0; j < q.voc.length; j++) cand(q.voc[j]).voc = 1;
      }
      if (pos < p.text.length) p.narr.push({ s: pos, e: p.text.length });
      /* the narration: names, subjects and he/she after them */
      for (i = 0; i < p.narr.length; i++){
        var nt = p.text.slice(p.narr[i].s, p.narr[i].e), subs = subjectsIn(nt), ss = sentencesOf(nt), si = 0;
        p.narr[i].subs = subs; p.narr[i].sents = ss;
        narrSents += ss.length;
        RX.names.lastIndex = 0;
        while ((m = RX.names.exec(nt))){
          var nm = cleanName(m[1]); if (!nm) continue;
          while (si + 1 < ss.length && ss[si + 1].s <= m.index) si++;
          var c = cand(nm);
          /* not the sentence's first word, where any word has a capital */
          if (ss[si] && /\S/.test(nt.slice(ss[si].s, m.index).replace(/^[^A-Za-zÀ-ɏ]+/, ""))) c.mid = 1;
          if (RX.place.test(nt.slice(Math.max(0, m.index - 16), m.index))) c.place = 1;
        }
        for (j = 0; j < subs.length; j++){
          if (subs[j].kind === "pron" && subs[j].pron === "i") iSubj++;
          if (subs[j].kind !== "name") continue;
          var sc = cand(subs[j].nm); sc.subj = 1;
          sc.m += count(RX.male, subs[j].rest); sc.f += count(RX.female, subs[j].rest);
        }
      }
    }
    /* a first-person narrator: "I" is the subject of the narration now and then */
    var firstPerson = iSubj >= 3 && iSubj * 25 >= narrSents;

    /* a word the text mostly writes in lower case is a word, not a name, whatever its capital at a sentence's start
       ("En", "Maar" in a Dutch book; "Will" and "Grace" are kept by the first-name list). Counted only for the one-word
       names that would otherwise become characters, in one pass over the text */
    function keeps(c){
      var strongTitle = c.title && !TWEAK[c.title];
      if (!(c.tag || strongTitle || (c.list && (c.mid || c.subj || c.voc)) || (!c.place && c.voc && c.subj) ||
            (c.title && TWEAK[c.title] && (c.voc || c.subj || c.list)))) return false;
      return !(!(c.tag || strongTitle) && c.place && !c.list);
    }
    function oneWord(c){ return !c.title && c.toks.length === 1 && !FIRST[c.toks[0]] && !NICK[c.toks[0]] && /^[a-z\u00C0-\u024F]+$/.test(c.toks[0]); }
    var caseN = {}, caseW = Object.keys(cands).filter(function(key){ return oneWord(cands[key]) && keeps(cands[key]); }).map(function(key){ return cands[key].toks[0]; });
    if (caseW.length){
      caseW.sort(function(a, b){ return b.length - a.length; });
      var caseRx = new RegExp("(?:^|[^A-Za-z\u00C0-\u024F])(" + caseW.join("|") + ")(?![A-Za-z\u00C0-\u024F])", "gi"), cm, ck;
      for (k = 0; k < paras.length; k++){
        caseRx.lastIndex = 0;
        while ((cm = caseRx.exec(paras[k].text))){
          ck = cm[1].toLowerCase();
          if (!caseN[ck]) caseN[ck] = [0, 0];
          caseN[ck][cm[1] === ck ? 0 : 1]++;
          caseRx.lastIndex = cm.index + cm[0].length;
        }
      }
    }
    function mostlyLower(w){ var x = caseN[w]; return !!x && x[0] >= x[1]; }
    /* the characters, their gender, and one character for "Mr. Darcy" and "Darcy", "Elizabeth Bennet" and "Lizzy" */
    Object.keys(cands).forEach(function(key){
      var c = cands[key];
      if (!keeps(c) || (oneWord(c) && mostlyLower(c.toks[0]))) return;
      var ch = character(key, c.name);
      ch.title = c.title; ch.toks = c.toks; ch.m = c.m; ch.f = c.f; ch.n = c.n; ch.shownN = c.n;
    });
    var alias = {}, bySur = {};
    function root(key){ for (var g = 0; alias[key] && g < 10; g++) key = alias[key]; return key; }
    /* the untitled full names by first name: "John Clay" and "John Openshaw" are two people, and the bare "John" is
       only the one of them the text names far more often than the others (Jane Bennet, not Jane Fairfax) */
    var fullByFirst = {};
    order.forEach(function(key){ var c = chars[key]; if (!c.title && c.toks.length >= 2) (fullByFirst[c.toks[0]] = fullByFirst[c.toks[0]] || []).push(key); });
    function firstOwns(key, first){
      var others = 0;
      (fullByFirst[first] || []).forEach(function(k2){ if (k2 !== key) others += chars[k2].n; });
      return chars[key].n >= 2 * others;
    }
    order.forEach(function(key){
      var c = chars[key], t = c.title ? c.title + " " : "", first = c.toks[0], lastT = c.toks[c.toks.length - 1];
      if (c.toks.length < 2) return;
      /* "Sir William Lucas" → "Sir William", "Mr. Fitzwilliam Darcy" → "Mr. Darcy", "Elizabeth Bennet" → "Elizabeth" */
      if (t && chars[t + first]) alias[key] = t + first;
      else if (t && chars[t + lastT]) alias[key] = t + lastT;
      else if (!t && chars[first] && !chars[first].title && firstOwns(key, first)) alias[key] = first;
    });
    order.forEach(function(key){
      var c = chars[key], r = root(key);
      if (!c.title || r !== key) return;
      var sur = c.toks[c.toks.length - 1];
      (bySur[sur] = bySur[sur] || []).push(key);
    });
    /* the one titled character with a surname: a man's title first ("Bingley" is Mr. Bingley, not Miss Bingley), a
       plain title before a doubtful one ("Mr. Holmes" before "Master Holmes") */
    function surnameOwner(sur, self){
      var list = (bySur[sur] || []).filter(function(k2){ return k2 !== self; });
      var strong = list.filter(function(k2){ return !TWEAK[chars[k2].title]; });
      var men = strong.filter(function(k2){ return TGEN[chars[k2].title] === "male"; });
      return men.length === 1 ? men[0] : strong.length === 1 ? strong[0] : list.length === 1 ? list[0] : null;
    }
    var fullBySur = {};
    order.forEach(function(key){ var c = chars[key]; if (!c.title && c.toks.length >= 2) (fullBySur[c.toks[c.toks.length - 1]] = fullBySur[c.toks[c.toks.length - 1]] || []).push(key); });
    order.forEach(function(key){
      var c = chars[key], first = c.toks[0], o, full = fullBySur[first] || [];
      if (c.title || c.toks.length !== 1 || alias[key] || FIRST[first]) return;
      if (!(o = surnameOwner(first, key))) return;
      /* "Havelaar" is Max Havelaar, not mevrouw Havelaar: a woman's title does not take the bare surname from the one
         man the text names in full with it */
      if (TGEN[chars[o].title] === "female" && full.length === 1 && FIRST[chars[full[0]].toks[0]] === "male") o = full[0];
      alias[key] = o;
    });
    /* "Sherlock Holmes" → Holmes, when no one else in the book has that surname ("Charlotte Lucas" and "Maria Lucas" stay two) */
    order.forEach(function(key){
      var c = chars[key], sur = c.toks[c.toks.length - 1];
      if (alias[key] || c.title || c.toks.length < 2 || (fullBySur[sur] || []).length > 1) return;
      var o = surnameOwner(sur, key) || (chars[sur] || alias[sur] ? root(sur) : null);
      if (o && o !== key) alias[key] = o;
    });
    order.forEach(function(key){
      var c = chars[key];
      if (alias[key] || c.title || c.toks.length !== 1 || !NICK[c.toks[0]]) return;
      /* "Jack" is John only where "John" is one person */
      var full = NICK[c.toks[0]].filter(function(f){ return chars[f] && !chars[f].title && root(f) !== key && (fullByFirst[f] || []).filter(function(k2){ return !alias[k2]; }).length === 0; });
      if (full.length) alias[key] = root(full[0]);
    });
    order.slice().forEach(function(key){
      if (!alias[key]) return;
      var to = root(key), a = chars[key], b = chars[to];
      if (!b || to === key) return;
      b.m += a.m; b.f += a.f;
      /* the name shown is the form the text uses most */
      if (a.shownN > b.shownN){ b.aka.push(b.name); b.name = a.name; b.shownN = a.shownN; } else b.aka.push(a.name);
      if (!b.title && a.title) b.title = a.title;
      delete chars[key]; order.splice(order.indexOf(key), 1);
    });
    order.forEach(function(key){
      var c = chars[key], tg = TGEN[c.title], fg = FIRST[c.toks[0]], i2;
      for (i2 = 0; !fg && i2 < c.aka.length; i2++){ var an = cleanName(c.aka[i2]); if (an) fg = FIRST[an.toks[0]] || (an.title && TGEN[an.title]); }
      c.gender = tg || fg || (c.m > c.f ? "male" : c.f > c.m ? "female" : "unknown");
    });
    /* a name met in the text → its character (or null) */
    function canon(nm){
      if (!nm) return null;
      var key = nm.key;
      if (chars[key] || alias[key]) return root(key);
      if (nm.toks.length >= 2){
        var t = nm.title ? nm.title + " " : "";
        if (t && (chars[t + nm.toks[0]] || alias[t + nm.toks[0]])) return root(t + nm.toks[0]);
        if (t && (chars[t + nm.toks[nm.toks.length - 1]] || alias[t + nm.toks[nm.toks.length - 1]])) return root(t + nm.toks[nm.toks.length - 1]);
        if (!t && (chars[nm.toks[0]] || alias[nm.toks[0]])) return root(nm.toks[0]);
      }
      return null;
    }
    function genderOf(key){ var c = chars[key]; return c ? c.gender : "unknown"; }

    /* pass 2: the paragraphs in order, with the scene they belong to */
    var ment = [];                     /* characters mentioned, in reading order (names in the narration, speakers, names addressed) */
    var scene = {}, sinceQ = {};       /* participants of the scene → paragraph last seen; those seen since the last quote */
    var last = null, prev = null, addressee = null, leadIn = null, gap = 0, LONG = 600;
    function mention(key, para, established, unit){
      if (!key) return;
      ment.push(key);
      if (ment.length > 800) ment.splice(0, 400);
      if (established){ scene[key] = para; sinceQ[key] = para; }
      var c = chars[key];
      if (c && unit !== undefined){ c.mentions++; if (c.first < 0 || unit < c.first) c.first = unit; }
    }
    function recentOf(g, skip, limit){
      for (var r = ment.length - 1, seen = 0; r >= 0 && seen < (limit || 80); r--, seen++){
        var key = ment[r];
        if (key === "narrator" || (skip && skip[key])) continue;
        if (!g || genderOf(key) === g) return key;
      }
      return null;
    }
    function copy(o){ var r = {}, x; for (x in o) if (o.hasOwnProperty(x)) r[x] = o[x]; return r; }
    /* the pronoun's character: "he went on" is the one who spoke last; else the latest of that gender who did not speak
       last (a new paragraph, a new speaker), else the last speaker, else an unnamed voice of that gender */
    function resolvePron(pr, excl, cont, quiet, keepLast){
      if (pr === "i") return firstPerson || !quiet ? "narrator" : null;
      if (pr === "they") return quiet ? null : synthetic("they");
      var g = pr === "he" ? "male" : "female", notG = g === "male" ? "female" : "male";
      if (cont && last && last !== "narrator" && !excl[last] && genderOf(last) !== notG) return last;
      var skip = copy(excl);
      if (last && !keepLast) skip[last] = 1;
      var r = recentOf(g, skip);
      if (r) return r;
      if (last && !excl[last] && genderOf(last) === g) return last;
      return quiet ? null : synthetic(pr);
    }
    function spouseOf(P, g, create){
      var c = chars[P], sur, key;
      if (!c || !c.title || !c.toks) return null;
      sur = c.toks[c.toks.length - 1];
      if (c.title === "mr" && g === "female") key = "mrs " + sur;
      else if (c.title === "mrs" && g === "male") key = "mr " + sur;
      else return null;
      if (chars[key] || alias[key]) return root(key);
      if (!create) return null;
      var shown = c.name.split(/\s+/).pop();
      var sp = character(key, (g === "female" ? "Mrs. " : "Mr. ") + shown);
      sp.title = key.split(" ")[0]; sp.toks = [sur]; sp.gender = g;
      return key;
    }
    /* someone known only by a description: "The stranger", "The old man", "The Count" */
    function descChar(d, g){
      var key = d.desc.replace(/^(?:his|her|their|our)\b/, "the"), c = chars[key], info = NOUNS[d.noun] || {};
      if (!c){
        var shown = key.charAt(0).toUpperCase() + key.slice(1);
        if (info.title) shown = shown.replace(new RegExp(d.noun + "$"), d.noun.charAt(0).toUpperCase() + d.noun.slice(1));
        c = character(key, shown); c.gender = g || "unknown"; c.synthetic = true;
      }
      return key;
    }
    /* "cried his wife", "said her mother", "said the old man", "said the captain" */
    function resolveDesc(d, excl, quiet){
      var info = NOUNS[d.noun] || { g: "" }, g = info.g, r, x;
      if (info.title){
        var best = null;
        for (r = ment.length - 1; r >= 0 && r >= ment.length - 200 && !best; r--) if (chars[ment[r]] && chars[ment[r]].title === info.title && !excl[ment[r]]) best = ment[r];
        for (x = 0; !best && x < order.length; x++) if (chars[order[x]].title === info.title && !excl[order[x]]) best = order[x];
        if (best) return best;
      }
      if (info.anon){
        /* "said the stranger", "continued our strange visitor": the unnamed one the scene already has, if any */
        var own = d.desc.replace(/^(?:his|her|their|our|my)\b/, "the");
        if (chars[own]) return own;
        for (r = ment.length - 1; r >= 0 && r >= ment.length - 40; r--){
          var mk = ment[r];
          if (chars[mk] && chars[mk].synthetic && !chars[mk].anon && scene[mk] !== undefined && !excl[mk]) return mk;
        }
        return quiet ? null : descChar(d, "");
      }
      /* "the Count" with no Count named: the Count, from now on */
      if (info.title) return descChar(d, g || TGEN[info.title] || "");
      if (d.poss === "his" || d.poss === "her" || d.poss === "their"){
        var P = d.poss === "their" ? null : recentOf(d.poss === "his" ? "male" : "female", null);
        if (info.spouse && P){ var sp = spouseOf(P, g, !quiet); if (sp && !excl[sp]) return sp; }
        var skip = copy(excl);
        if (P) skip[P] = 1;
        if (info.pref) for (r = ment.length - 1; r >= 0 && r >= ment.length - 80; r--){
          var key = ment[r];
          if (!skip[key] && chars[key] && info.pref[chars[key].title] && (!g || chars[key].gender === g)) return key;
        }
        var rr = recentOf(g, skip);
        if (rr) return rr;
        return quiet ? null : synthetic(g === "male" ? "he" : g === "female" ? "she" : "they");
      }
      if (d.poss === "the" && g){
        var skip2 = copy(excl);
        if (last) skip2[last] = 1;
        var r2 = recentOf(g, skip2, 40);
        if (r2 && scene[r2] !== undefined) return r2;
      }
      /* "answered my companion" in a first-person book: the narrator's companion, the one of this scene the book has named
         most so far (Holmes, not the client of the day), rather than a new character */
      if ((d.poss === "my" || d.poss === "our") && info.mate && firstPerson){
        var mate = null;
        for (var sk in scene) if (scene.hasOwnProperty(sk) && sk !== "narrator" && chars[sk] && !chars[sk].synthetic && !excl[sk] &&
                                   (!mate || chars[sk].mentions > chars[mate].mentions)) mate = sk;
        if (mate) return mate;
      }
      return quiet ? null : descChar(d, g);
    }
    /* who speaks an untagged paragraph: the one addressed last (if in the scene), the one the narration just before was
       about, the one before the last speaker (turns), the latest participant who did not speak last */
    function expected(excl, nextVoc){
      /* after narration about the one now addressed ("Jo began to whistle." “Don’t, Jo!”), the last speaker goes on */
      var goOn = leadIn && excl[leadIn] && last && !excl[last] ? last : null;
      var list = [nextVoc, addressee && scene[addressee] !== undefined ? addressee : null, goOn, leadIn, prev], r, best = null, bestAt = -1;
      for (r = 0; r < list.length; r++) if (list[r] && (list[r] !== last || list[r] === goOn) && !excl[list[r]]) return list[r];
      for (var key in scene) if (scene.hasOwnProperty(key) && key !== last && !excl[key] && scene[key] > bestAt && (key !== "narrator" || firstPerson)){ best = key; bestAt = scene[key]; }
      return best;
    }
    function subjectKey(s, excl, keepLast){
      if (s.kind === "name") return canon(s.nm);
      if (s.kind === "pron") return resolvePron(s.pron, excl, false, true, keepLast);
      return resolveDesc(s.d, excl, true);
    }
    /* the names in a stretch of narration: mentions (the sentence's subject last, the one it is about) and the scene */
    function narrate(p, k, piece){
      var nt = p.text.slice(piece.s, piece.e), subs = piece.subs || [], sents = piece.sents || [], found = [], spouses = [], f = 0, t, lastSubj = null;
      RX.names.lastIndex = 0;
      while ((m = RX.names.exec(nt))){ var key = canon(cleanName(m[1])); if (key) found.push({ key: key, at: m.index }); }
      RX.spouse.lastIndex = 0;
      while ((m = RX.spouse.exec(nt))) spouses.push({ at: m.index, poss: m[1], g: m[2] === "husband" ? "male" : "female" });
      RX.intro.lastIndex = 0;
      while ((m = RX.intro.exec(nt))){
        var ik = descChar({ desc: "the " + m[1], poss: "the", noun: m[1], adj: "" }, NOUNS[m[1]] ? NOUNS[m[1]].g : "");
        found.push({ key: ik, at: m.index + m[0].indexOf(m[1]) - 2, noCount: true });
      }
      found.sort(function(x, y){ return x.at - y.at; });
      for (var si = 0; si < sents.length; si++){
        var a = sents[si].s, b = sents[si].e, sub = null, here = [];
        for (t = 0; t < subs.length && !sub; t++) if (subs[t].at >= a && subs[t].at < b) sub = subs[t];
        for (; f < found.length && found[f].at < b; f++) if (found[f].at >= a) here.push(found[f]);
        for (t = 0; t < spouses.length; t++) if (spouses[t].at >= a && spouses[t].at < b){
          var P = recentOf(spouses[t].poss === "his" ? "male" : "female", null), sp = P ? spouseOf(P, spouses[t].g, false) : null;
          if (sp) here.push({ key: sp, at: spouses[t].at, noCount: true });
        }
        here.sort(function(x, y){ return x.at - y.at; });
        /* the sentence's names in order, and its subject (the one it is about) after them */
        var sk = sub ? subjectKey(sub, {}, true) : null;
        for (t = 0; t < here.length; t++){
          if (sub && sub.kind === "name" && Math.abs(sub.at - here[t].at) <= 1 && here[t].key === sk) continue;
          mention(here[t].key, k, true, here[t].noCount ? undefined : unitAt(p, piece.s + here[t].at));
        }
        if (sk){ mention(sk, k, true, sub.kind === "name" ? unitAt(p, piece.s + sub.at) : undefined); lastSubj = sk; }
      }
      return lastSubj;
    }
    function reset(){ scene = {}; sinceQ = {}; last = prev = addressee = leadIn = null; gap = 0; }
    for (k = 0; k < paras.length; k++){
      p = paras[k];
      if (p.heading){ reset(); continue; }
      if (!p.quotes.length){
        var ls = null;
        for (i = 0; i < p.narr.length; i++){ var s1 = narrate(p, k, p.narr[i]); if (s1) ls = s1; }
        leadIn = ls; gap += p.text.length;
        continue;
      }
      if (gap > LONG){ last = prev = addressee = null; scene = sinceQ; }
      sinceQ = {}; gap = 0;
      /* the narration before the first quote, then the names addressed */
      var ni = 0;
      for (; ni < p.narr.length && p.narr[ni].e <= p.quotes[0].s; ni++) narrate(p, k, p.narr[ni]);
      var excl = {}, voc = [];
      for (i = 0; i < p.quotes.length; i++) for (j = 0; j < p.quotes[i].voc.length; j++){
        var vk = canon(p.quotes[i].voc[j]);
        if (vk){ excl[vk] = 1; voc.push(vk); mention(vk, k, false); }
      }
      /* nor, when nothing names the speaker, anyone the quote talks about ("put it into Lizzy's head" is not Lizzy's line) */
      var soft = copy(excl);
      for (i = 0; i < p.quotes.length; i++){
        var qt0 = p.text.slice(p.quotes[i].s, p.quotes[i].e);
        RX.names.lastIndex = 0;
        while ((m = RX.names.exec(qt0))){ var tk = canon(cleanName(m[1])); if (tk) soft[tk] = 1; }
      }
      /* explicit tags */
      var paraKey = null;
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i]; q.key = null;
        var tg = q.tag;
        if (!tg) continue;
        if (tg.key && !canon(tg) && oneWord(tg) && mostlyLower(tg.toks[0])) tg = {};     /* "Hy zei": a word, not a name */
        if (tg.key){ q.key = canon(tg) || tg.key; if (!chars[q.key]) character(q.key, tg.name); }
        else if (tg.pronoun) q.key = resolvePron(tg.pronoun, soft, CONT.test(tg.verb || ""), false);
        else if (tg.desc) q.key = resolveDesc(tg, soft, false);
        if (q.key && paraKey === null) paraKey = q.key;
      }
      /* an action beat: the subject of the narration nearest a quote */
      if (paraKey === null){
        var bestD = Infinity;
        for (i = 0; i < p.narr.length; i++){
          var subs2 = p.narr[i].subs || [];
          for (j = 0; j < subs2.length; j++){
            var at = p.narr[i].s + subs2[j].at, dist = Infinity;
            for (var qi = 0; qi < p.quotes.length; qi++) dist = Math.min(dist, at >= p.quotes[qi].e ? at - p.quotes[qi].e : p.quotes[qi].s - at);
            if (dist >= bestD) continue;
            var bk = subjectKey(subs2[j], soft);
            if (bk && !excl[bk] && (subs2[j].kind === "name" || !soft[bk])){ paraKey = bk; bestD = dist; }
          }
        }
      }
      if (paraKey === null){
        /* “So I did, Beth.”, untagged, right after an untagged line that addresses no one: Beth said it */
        var nv = null, pn = voc.length ? null : paras[k + 1];
        if (pn && pn.quotes.some(function(x){ return !!x.tag; })) pn = null;
        if (pn && !pn.heading && pn.quotes.length) for (i = 0; i < pn.quotes.length && !nv; i++) for (j = 0; j < pn.quotes[i].voc.length && !nv; j++){
          var nk = canon(pn.quotes[i].voc[j]);
          if (nk && scene[nk] !== undefined && !excl[nk]) nv = nk;
        }
        paraKey = expected(soft, nv);
      }
      /* nobody known: an unnamed voice, taking turns with the one before */
      if (paraKey === null) paraKey = synthetic(last && last !== "other-1" ? "other-1" : "unknown-1");
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        if (!q.key) q.key = paraKey;
        if (chars[q.key]) chars[q.key].lines++;
        if (q.key !== last){ prev = last; last = q.key; }
        mention(q.key, k, true);
      }
      addressee = voc.length ? voc[voc.length - 1] : null;
      leadIn = null;
      for (; ni < p.narr.length; ni++) narrate(p, k, p.narr[ni]);
      /* the names inside the quotes count as mentions of their characters (not for pronouns: they are talked about) */
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        var qt = p.text.slice(q.s, q.e);
        RX.names.lastIndex = 0;
        while ((m = RX.names.exec(qt))){
          var mk = canon(cleanName(m[1]));
          if (mk && chars[mk]){ chars[mk].mentions++; var mu = unitAt(p, q.s + m.index); if (chars[mk].first < 0 || mu < chars[mk].first) chars[mk].first = mu; }
        }
      }
    }

    /* segments per unit: quoted spans carry their speaker, the rest is narration */
    for (k = 0; k < paras.length; k++){
      p = paras[k];
      var spans = [], sp0 = 0;
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        if (q.s > sp0) spans.push({ s: sp0, e: q.s, role: "narrator" });
        spans.push({ s: q.s, e: q.e, role: q.key || "narrator", q: q });
        sp0 = q.e;
      }
      if (sp0 < p.text.length) spans.push({ s: sp0, e: p.text.length, role: "narrator" });
      for (i = 0; i < p.units.length; i++){
        var ui = p.units[i], ub = p.base[i], list = [], role = "narrator";
        u = units[ui] || {};
        var utext = String(u.text || ""), ue2 = ub + utext.length, us = u.start || 0;
        for (j = 0; j < spans.length; j++){
          var a = Math.max(spans[j].s, ub), b = Math.min(spans[j].e, ue2);
          if (b <= a) continue;
          var text = utext.slice(a - ub, b - ub);
          if (!/\S/.test(text)) continue;
          var sq = spans[j].q;
          if (sq){
            if (sq.unit === undefined){ sq.unit = ui; sq.start = us + (a - ub); }
            sq.end = us + (b - ub);
          }
          var lastS = list[list.length - 1];
          if (lastS && lastS.role === spans[j].role){ lastS.end = us + (b - ub); lastS.text = utext.slice(lastS.start - us, b - ub); }
          else list.push({ start: us + (a - ub), end: us + (b - ub), text: text, role: spans[j].role });
          if (role === "narrator" && spans[j].role !== "narrator") role = spans[j].role;
        }
        if (!list.length) list.push({ start: us, end: u.end !== undefined ? u.end : us + utext.length, text: utext, role: "narrator" });
        segs[ui] = list; roles[ui] = role;
      }
      for (i = 0; i < p.quotes.length; i++){
        q = p.quotes[i];
        if (q.unit !== undefined) quotes.push({ role: q.key || "narrator", unit: q.unit, start: q.start, end: q.end, text: p.text.slice(q.s, q.e).replace(/\s+/g, " ").trim() });
      }
    }
    var cast = order.map(function(key){
      var c = chars[key];
      return { key: c.key, name: c.name, gender: c.gender, lines: c.lines, synthetic: c.synthetic, anon: !!c.anon, mentions: c.mentions, first: c.first, aka: c.aka.slice() };
    }).filter(function(c){ return c.lines > 0; });
    return { units: segs, roles: roles, cast: cast, quotes: quotes, sections: sections };
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
     gender(v) → "f" | "m" | "", id(v), rec: { key → { voice, pitch } } the record kept per document,
     pinned: { key → 1 } the characters whose voice the reader chose }.
     Every speaker without a voice in rec gets one, the unnamed ones (he, she, another voice, the stranger) too: a
     distinct voice from its gender's pool (the document's language, or every voice when that leaves fewer than two;
     never the narrator) first, then any unused voice; when voices run out they are reused with another pitch, so
     the characters still sound different. A voice that has become the narrator's is given up for another unless
     the reader chose it, and a character the reader set to "" (the dialogue voice) stays so. Deterministic;
     returns whether rec changed. */
  function castDevice(cast, voices, opts){
    opts = opts || {};
    var id = opts.id || voiceId, gender = opts.gender || tableGender, lang = String(opts.lang || "").slice(0, 2).toLowerCase();
    var rec = opts.rec || {}, pinned = opts.pinned || {}, narrator = opts.narrator || "", all = (voices || []).slice(), i, changed = false;
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
      if (!c || !c.key) continue;
      var r = rec[c.key];
      /* kept, unless the voice has gone from the device or is now the narrator's (and the reader did not choose it) */
      if (r && (r.voice === "" || (r.voice && have[r.voice] && (r.voice !== narrator || pinned[c.key])))) continue;
      if (r && r.voice && used[r.voice]) used[r.voice]--;
      var want = c.gender === "male" ? "m" : c.gender === "female" ? "f" : "";
      var gp = want && byG[want].length ? byG[want] : null;
      /* an unused voice of the character's gender, else any unused voice, else the least-used one of its gender */
      var best = unusedIn(gp, used, id) || unusedIn(pool, used, id) || leastUsed(gp || pool, used, id);
      var bestN = used[id(best)] || 0, vg = gender(best) || "", pitch;
      if (bestN === 0) pitch = (want && vg !== want) ? (want === "m" ? 0.85 : 1.1) : 1;   /* a voice of the other (or no known) gender: nudged towards the character's */
      else pitch = PITCHES[(bestN - 1) % PITCHES.length];
      /* a device with no voice but the narrator's: at least not in the narrator's own pitch */
      if (id(best) === narrator && pitch === 1) pitch = PITCHES[bestN % PITCHES.length];
      rec[c.key] = { voice: id(best), pitch: pitch };
      used[id(best)] = bestN + 1; changed = true;
    }
    return changed;
  }
  /* the plan for Speak's device engine: who speaks each unit and, for every speaker, which device voice and
     pitch. opts: { lang, narrator (voice), voices() → list, gender(v), id(v), find(id) → voice }. The record
     persists in the cast store beside the ElevenLabs cast; plan.voiceFor(i) → { voice, pitch } | null. The
     narrator is looked up as each line is read, so a voice the reader has since made the narrator's is swapped
     for another (unless they chose it for that character) */
  var devPlan = null;
  function deviceCast(units, ctx, opts){
    opts = opts || {};
    var docId = (ctx && ctx.docId) || "", id = opts.id || voiceId;
    var a = attribute(units);
    function narrator(){
      var S = window.llSpeak, v = S && S.currentVoice ? S.currentVoice() : null;
      return v || opts.narrator || null;
    }
    return loadCast(docId).then(function(rec){
      if (!rec) rec = newCast(docId);
      var narrNow = "";
      function assign(cast){
        narrNow = narrator() ? id(narrator()) : "";
        if (castDevice(cast, opts.voices ? opts.voices() : [], { lang: opts.lang, narrator: narrNow, gender: opts.gender, id: id, rec: rec.device, pinned: rec.picked.device })){ rec.updated = Date.now(); saveCast(rec); }
      }
      assign(a.cast);
      var plan = {
        docId: docId, n: units.length, roles: a.roles, cast: a.cast, rec: rec, a: a,
        voiceFor: function(i){
          var role = plan.roles[i];
          if (!role) return null;
          var nv = narrator();
          /* a first-person narrator's own lines ("I said") are read in the narrator's voice */
          if (role === "narrator") return nv ? { voice: nv, pitch: 1 } : null;
          if ((nv ? id(nv) : "") !== narrNow) assign(plan.cast);
          var d = plan.rec.device[role];
          if (!d || !d.voice) return null;
          var v = opts.find ? opts.find(d.voice) : null;
          return v ? { voice: v, pitch: +d.pitch || 1 } : null;
        },
        /* PDF pages appended since: the whole list is read again (it is quick) */
        extend: function(us){ var b = attribute(us); plan.roles = b.roles; plan.cast = b.cast; plan.a = b; plan.n = us.length; assign(b.cast); if (Side && Side.is && Side.is("cast")) refreshCast(); if (Side && Side.is && Side.is("who")) refreshWho(); }
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
  function fmt(n){ return isNl() ? I18N.num(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  /* a pitch as "1.05" (Dutch "1,05") */
  function fix2(x){ return isNl() ? I18N.num(x, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : x.toFixed(2); }
  function delay(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }
  function apiKey(){ return Store.get(K_KEY) || ""; }
  function model(){ var m = Store.get(K_MODEL); return MODELS.indexOf(m) >= 0 ? m : MODELS[0]; }
  function supported(){
    return !!(window.fetch && window.Promise && window.Audio && window.indexedDB && window.URL && URL.createObjectURL && window.atob);
  }
  function askForKey(){
    var k = prompt(_t("Paste an ElevenLabs API key to read aloud with ElevenLabs voices.\n\nIt is stored only on this device and is sent only to api.elevenlabs.io while reading. Leave blank to remove it."), apiKey());
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
    if (/quota_exceeded|payment/i.test(code) || status === 402) text = _t("ElevenLabs credits are used up");
    else if (status === 401 || /invalid_api_key|missing_permissions|unauthori[sz]ed/i.test(code)) text = _t("ElevenLabs rejected the key");
    else if (status === 429) text = _t("ElevenLabs is busy — try again in a moment");
    else text = _t("ElevenLabs: {error}", { error: (msg || code || _t("error {n}", { n: status })).slice(0, 90) });
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
    if (!apiKey()) return Promise.reject(new Error(_t("Add an ElevenLabs API key first")));
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
      if (!list.length) throw new Error(_t("No ElevenLabs voices found"));
      voiceCache = list; Store.set(K_VOICES, JSON.stringify({ t: Date.now(), voices: list }));
      return list;
    }, function(err){
      voicesPromise = null;
      /* an old list still names the narrator and the cast, so clips already on the device play offline */
      var old = storedVoices(true);
      if (old){ voiceCache = old; voicesStale = true; return old; }
      if (!(err && err.status)) err = new Error(navigator.onLine ? _t("Couldn’t reach ElevenLabs") : _t("ElevenLabs needs a connection"));
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
      return g[1].length ? '<optgroup label="' + esc(_t(g[0])) + '">' + g[1].join("") + '</optgroup>' : "";
    }).join("");
  }

  /* ---- the cast of a document, kept in IndexedDB: { docId, voices: { key → ElevenLabs voice_id },
     device: { key → { voice, pitch } }, kokoro: { key → Kokoro voice name }, piper: { key → Piper speaker id },
     picked: { voices | device | kokoro | piper → { key → 1 } } the voices the reader chose, updated } ---- */
  var CAST_KEYS = ["voices", "device", "kokoro", "piper"];
  function newCast(docId){ return { docId: docId, voices: {}, device: {}, kokoro: {}, piper: {}, picked: { voices: {}, device: {}, kokoro: {}, piper: {} }, updated: 0 }; }
  function loadCast(docId){
    if (!docId || !Library) return Promise.resolve(null);
    return Library.tx("cast", "readonly", function(st){ return st.get(docId); })
      .then(function(r){
        if (!(r && r.docId === docId)) return null;
        CAST_KEYS.forEach(function(k){ if (!r[k] || typeof r[k] !== "object") r[k] = {}; });
        if (!r.picked || typeof r.picked !== "object") r.picked = {};
        CAST_KEYS.forEach(function(k){ if (!r.picked[k] || typeof r.picked[k] !== "object") r.picked[k] = {}; });
        return r;
      }).catch(function(){ return null; });
  }
  function saveCast(rec){
    if (!rec || !rec.docId || !Library) return;
    Library.tx("cast", "readwrite", function(st){ st.put(rec); }).catch(function(){});
  }
  /* every speaker, the unnamed ones (he, she, another voice, the stranger) too, gets a distinct voice from their
     gender's pool (not the narrator's), round-robin; list is [{ id, gender }] (ElevenLabs voices, or the natural voices
     of the document's language) and map the record's { character key → voice id } to fill (rec.voices, rec.kokoro or
     rec.piper). A voice that has become the narrator's is given up for another, unless the reader chose it for that
     character (pinned: { key → 1 }). Only a list with no voice but the narrator's gives it to a character. Returns
     whether map changed. */
  function assignVoices(cast, list, narrator, map, pinned){
    var pools = { male: [], female: [], unknown: [] }, all = [], used = {}, changed = false, i, j;
    pinned = pinned || {};
    list.forEach(function(v){ if (v.id === narrator) return; all.push(v.id); (pools[v.gender] || pools.unknown).push(v.id); });
    var solo = !all.length;
    if (solo) all = list.map(function(v){ return v.id; });
    Object.keys(map).forEach(function(k){ used[map[k]] = (used[map[k]] || 0) + 1; });
    for (i = 0; i < cast.length; i++){
      var c = cast[i], had = c && c.key ? map[c.key] : null;
      if (!c || !c.key || (had && (had !== narrator || solo || pinned[c.key]))) continue;
      if (had) used[had]--;
      var pool = pools[c.gender] && pools[c.gender].length ? pools[c.gender] : all, best = null, bestN = Infinity;
      for (j = 0; j < pool.length; j++){ var nn = used[pool[j]] || 0; if (nn < bestN){ bestN = nn; best = pool[j]; } }
      if (!best) best = narrator;
      if (best !== had){ map[c.key] = best; changed = true; }
      used[best] = (used[best] || 0) + 1;
    }
    return changed;
  }

  /* ---- where clips come from: ElevenLabs requests, or a natural-voices worker on this device (SRC.kokoro and
     SRC.piper, made by natSource in 4b). A plan carries its source; the clip, prefetch, cache and playback code
     below reads the differences off it ---- */
  var SRC = {
    eleven: { name: "eleven", castKey: "voices", inflight: INFLIGHT, ahead: AHEAD, busy: "Fetching…", pack: true,
              model: model, list: function(){ return voices(); }, narrator: narratorId, pool: function(list){ return list; },
              options: voiceOptions, run: function(task){ return fetchClip(task, 0); } }
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
      var narrator = src.narrator(list), pool = src.pool(list, (ctx && ctx.lang) || "");
      var sig = a.cast.map(function(c){ return c.key + ":" + c.lines; }).join("|") + "|" + narrator;
      plan = { src: src, docId: docId, title: (ctx && ctx.title) || "", units: units, segs: a.units, cast: a.cast, a: a, rec: rec, list: list, pool: pool, narrator: narrator, sig: sig, clips: null, firstClip: null,
               pack: srcPack(src) };
      buildClips(); syncName();
      /* PDF pages appended to a plan: the panels are redrawn only when the cast changed */
      if (!prev || prev.sig !== sig){ refreshCast(); refreshWho(); }
    });
    prepPromise = p;
    return p;
  }
  function prepare(units, ctx){ return planFor(SRC.eleven, units, ctx); }
  /* the language pack a source's plan is made for (Piper: "en" or "nl"; "" for the others): a plan for another pack
     than the open document's (its language was told after the plan was made) is made again */
  function srcPack(src){ return src && src.nat && src.nat.packs ? natPack(src.nat).lang : ""; }
  /* every speaker has a voice that is not the narrator's (a new speaker, or a narrator changed since, is cast now) */
  function castPlanVoices(){
    var ck = plan.src.castKey, rec = plan.rec, gone = false;
    if (!rec.picked) rec.picked = {};
    if (!rec.picked[ck]) rec.picked[ck] = {};
    /* natural voices: a voice the model cannot give this document (another language's) is cast again */
    if (plan.src.nat){
      var ok = {};
      (plan.pool || []).forEach(function(v){ ok[v.id] = 1; });
      Object.keys(rec[ck]).forEach(function(k){ if (!ok[rec[ck][k]]){ delete rec[ck][k]; delete rec.picked[ck][k]; gone = true; } });
    }
    if (assignVoices(plan.cast, plan.pool || plan.list || [], plan.narrator, rec[ck], rec.picked[ck]) || gone){
      rec.updated = Date.now(); saveCast(rec);
      if (Side && Side.is && (Side.is("cast") || Side.is("who"))) setTimeout(function(){ refreshCast(); refreshWho(); }, 0);
    }
  }
  function voiceFor(role){
    if (role === "narrator") return plan.narrator;
    var v = plan.rec[plan.src.castKey][role];
    if (v) return v;
    /* a speaker the cast has not met: a voice of the pool that is not the narrator's */
    var pool = plan.pool || plan.list || [], i;
    for (i = 0; i < pool.length; i++) if (pool[i].id !== plan.narrator) return pool[i].id;
    return plan.narrator;
  }
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
     A source that does not pack (the natural voices) gets one clip per run. */
  function buildClips(){
    castPlanVoices();
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
  function isRunning(){ var e = Speak && Speak.activeEngine && Speak.activeEngine(); return !!e && (e === engine || e === kEngine || e === pEngine); }
  function elevenRunning(){ return !!(Speak && Speak.activeEngine && Speak.activeEngine() === engine); }
  /* the engine reading is this natural model's */
  function natRunning(m){ return !!(m && m.engine && Speak && Speak.activeEngine && Speak.activeEngine() === m.engine); }
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
  /* the clips kept on the device stay under AUDIO_CAP: after a put, once things are quiet, the oldest go first. The store
     is walked only when it may be over: its size is known from the last walk plus what was saved since (an over-estimate,
     as a clip saved again replaces itself), and the first save of a session walks it once */
  var audioBytes = -1;
  function save(rec){
    if (!Library) return;
    Library.tx("audio", "readwrite", function(st){ st.put(rec); }).then(function(){
      if (audioBytes >= 0) audioBytes += rec.size || 0;
      if (audioBytes < 0 || audioBytes > AUDIO_CAP) scheduleTrim();
    }, function(){});
  }
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
        total += n; recs.push({ key: c.primaryKey, created: v.created || 0, size: n, docId: v.docId || "" });
        c.continue();
      };
    }).then(function(){ return { recs: recs, total: total }; }).catch(function(){ return { recs: recs, total: total }; });
  }
  function audioTotal(){ return scanAudio().then(function(r){ return r.total; }); }
  /* other documents' clips go first, oldest first; then the open document's behind the reading position; never
     the open document's clips from the reading position on (all of them when it has no plan to tell where that is) */
  function trimAudio(){
    trimT = null;
    var doc = (Library && Library.currentId && Library.currentId()) || "", p = plan && plan.docId === doc && plan.clips ? plan : null, keep = null;
    var from = p ? readPos(p) : 0;
    var ready = p ? keyed(p, from).then(function(){ keep = {}; for (var k = from; k < p.clips.length; k++) keep[p.clips[k].key] = 1; }) : Promise.resolve();
    return ready.then(scanAudio).then(function(r){
      audioBytes = r.total;
      if (r.total <= AUDIO_CAP) return;
      r.recs.sort(function(a, b){ return ((a.docId === doc) - (b.docId === doc)) || a.created - b.created; });
      var drop = [], total = r.total, i, x;
      for (i = 0; i < r.recs.length && total > AUDIO_CAP; i++){
        x = r.recs[i];
        if (doc && x.docId === doc && (!keep || keep[x.key])) continue;
        total -= x.size; drop.push(x.key);
      }
      if (feed.have) drop.forEach(function(k){ delete feed.have[k]; });
      audioBytes = total;
      return Library.tx("audio", "readwrite", function(st){ drop.forEach(function(k){ st.delete(k); }); });
    }).then(audioSync).catch(function(){});
  }
  /* the row in the voices panel: "Audio kept on this device: 123 MB" */
  function mb(n){ var v = Math.round(n / 1048576); return _t("{n} MB", { n: isNl() ? I18N.num(v) : v }); }
  function audioSync(){
    if (typeof document === "undefined" || !document.getElementById("audioKept")) return;
    audioTotal().then(function(n){ var el = document.getElementById("audioKept"); if (el) el.textContent = _t("Audio kept on this device: {size}", { size: mb(n) }); });
  }
  /* the audio store only: every clip of every document, from either source; the model stays */
  function clearAudio(){
    if (!Library) return;
    cancelQueued();
    feed.have = null; feed.haveDoc = null; feed.haveP = null;
    Library.tx("audio", "readwrite", function(st){ st.clear(); }).then(function(){ audioBytes = 0; loadedKey = null; toast(_t("Cached audio cleared")); audioSync(); prepSync(); }, function(){ toast(_t("Couldn’t clear the audio")); });
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
      if (!j || !j.audio_base64) throw new Error(_t("ElevenLabs sent no audio"));
      sent += clip.text.length; setStatus();
      return { blob: b64blob(j.audio_base64), times: timesFrom(j.alignment, clip) };
    }).catch(function(err){
      /* busy: once more after a pause, unless nobody wants the clip any more (Stop was pressed) */
      if (err && err.status === 429 && !attempt && !task.cancelled){
        return delay(Math.max(2000, (err.retryAfter || 0) * 1000)).then(function(){ if (task.cancelled) throw err; return fetchClip(task, 1); });
      }
      if (!(err && err.status) && !navigator.onLine){ err = new Error(_t("ElevenLabs needs a connection")); err.offline = true; }
      else if (!(err && err.status) && err && !/ElevenLabs/.test(err.message || "")) err = new Error(_t("ElevenLabs request failed"));
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
        if (rec){ known(rec); return rec; }
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
    if (task.src === SRC.eleven && !navigator.onLine){ var o = new Error(_t("Offline — no ElevenLabs audio cached from here")); o.offline = true; return Promise.reject(o); }
    return task.src.run(task).then(function(r){
      var out = { key: task.key, docId: task.docId, voice_id: task.clip.voice, model_id: task.clip.model, chars: task.clip.text.length,
                  blob: r.blob, size: r.blob.size, times: r.times, created: Date.now() };
      save(out); known(out);
      return out;
    });
  }
  /* drop what has not been sent yet and stop retrying what has; an ElevenLabs request already on its way finishes
     and lands in the cache, while the worker drops what it was making (it cannot be cut short) */
  function cancelQueued(){
    queue.splice(0).forEach(function(t){ t.cancelled = true; delete inflight[t.key]; var e = new Error("cancelled"); e.cancelled = true; t.rej(e); });
    Object.keys(inflight).forEach(function(k){ inflight[k].cancelled = true; });
    natCancel(NAT.kokoro); natCancel(NAT.piper);
  }
  function prefetch(ci){
    for (var j = ci + 1; j <= ci + plan.src.ahead && plan && plan.clips[j]; j++) getClip(plan.clips[j], false).catch(function(){});
  }

  /* ============================================================
     4b. Natural voices — a model run in a worker on this device: Piper ("Fast", NAT.piper) or Kokoro ("Best",
         NAT.kokoro). A worker is made only once the reader picks the engine or presses download, and the model
         stays on the device; everything else (clips, cache, feeder, playback) is shared
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
     the English ones with a word of warning, once (for a Dutch text: Fast has Dutch voices) */
  var KOKORO_LANGS = { en: "ab", es: "e", fr: "f", hi: "h", it: "i", ja: "j", pt: "p", zh: "z" };
  var natWarned = false;
  function natWarn(lang, fast){
    if (lang === "en" || natWarned) return;
    natWarned = true;
    toast(lang === "nl" && !fast ? _t("The Best natural voices speak English only; choose Fast for Dutch voices")
          : fast ? _t("The Fast natural voices speak English and Dutch; a text in another language is read by the device voice")
          : _t("Natural voices speak English only; a text in another language is read by the device voice"));
  }
  function kokoroPool(lang){
    lang = String(lang || "en").slice(0, 2).toLowerCase();
    var letters = KOKORO_LANGS[lang] || "", pool = KOKORO_VOICES.filter(function(v){ return letters.indexOf(v.lang) >= 0; });
    if (pool.length) return pool;
    natWarn(lang, false);
    return KOKORO_VOICES.filter(function(v){ return v.lang === "a" || v.lang === "b"; });
  }
  function kokoroOptions(list, selected){
    var groups = [], by = {};
    (list || KOKORO_VOICES).forEach(function(v){ if (!by[v.group]){ by[v.group] = []; groups.push(v.group); } by[v.group].push(v); });
    return groups.map(function(g){
      return '<optgroup label="' + esc(_t(g)) + '">' + by[g].map(function(v){
        return '<option value="' + esc(v.id) + '"' + (v.id === selected ? ' selected' : '') + '>' + esc(_t(v.gender === "female" ? "{name} (woman)" : "{name} (man)", { name: v.name })) + '</option>';
      }).join("") + '</optgroup>';
    }).join("");
  }
  /* 24 of the 904 LibriTTS-R speakers of the Piper voice (id: the speaker id the model takes), measured, not guessed:
     one sentence each from 120 speakers, clips of ordinary loudness and pace, then 12 clearly women's voices (median
     pitch 185 Hz and up) and 12 clearly men's (135 Hz and down) spread over each range. The default narrator is the
     woman nearest the middle of hers */
  var PIPER_VOICES = [
    { id: "516", name: "Ada", gender: "female" }, { id: "129", name: "Beth", gender: "female" }, { id: "266", name: "Clara", gender: "female" }, { id: "99", name: "Dora", gender: "female" },
    { id: "46", name: "Eve", gender: "female" }, { id: "880", name: "Fay", gender: "female" }, { id: "493", name: "Grace", gender: "female" }, { id: "76", name: "Hazel", gender: "female" },
    { id: "835", name: "Iris", gender: "female" }, { id: "455", name: "June", gender: "female" }, { id: "850", name: "Kate", gender: "female" }, { id: "675", name: "Lucy", gender: "female" },
    { id: "137", name: "Ben", gender: "male" }, { id: "607", name: "Carl", gender: "male" }, { id: "501", name: "Dan", gender: "male" }, { id: "288", name: "Ed", gender: "male" },
    { id: "8", name: "Finn", gender: "male" }, { id: "751", name: "Gus", gender: "male" }, { id: "395", name: "Hugo", gender: "male" }, { id: "304", name: "Ivan", gender: "male" },
    { id: "402", name: "Jack", gender: "male" }, { id: "243", name: "Leo", gender: "male" }, { id: "789", name: "Max", gender: "male" }, { id: "357", name: "Ned", gender: "male" }
  ];
  var PIPER_DEFAULT = "493";      /* Grace */
  /* 23 of the 52 speakers of the Dutch voice, nl_NL-mls-medium (Multilingual LibriSpeech; id "nl:" and the speaker id
     the model takes), measured the same way: two sentences from each speaker; outliers of loudness, pace and voicing
     dropped, and speakers a speech recogniser understood poorly (a word error rate over 25%); then 12 clearly women's
     voices (175 Hz and up) and the 11 clearly men's (150 Hz and down), the clearest where there were more. The default
     narrator is the clearest woman in the middle of their pitch range */
  var PIPER_VOICES_NL = [
    { id: "nl:37", name: "Anouk", gender: "female" }, { id: "nl:27", name: "Bregje", gender: "female" }, { id: "nl:33", name: "Carlijn", gender: "female" }, { id: "nl:31", name: "Dewi", gender: "female" },
    { id: "nl:14", name: "Eva", gender: "female" }, { id: "nl:29", name: "Fenna", gender: "female" }, { id: "nl:23", name: "Greetje", gender: "female" }, { id: "nl:3", name: "Hanna", gender: "female" },
    { id: "nl:34", name: "Ilse", gender: "female" }, { id: "nl:30", name: "Janneke", gender: "female" }, { id: "nl:25", name: "Kiki", gender: "female" }, { id: "nl:35", name: "Lotte", gender: "female" },
    { id: "nl:21", name: "Arjen", gender: "male" }, { id: "nl:7", name: "Bram", gender: "male" }, { id: "nl:42", name: "Coen", gender: "male" }, { id: "nl:41", name: "Daan", gender: "male" },
    { id: "nl:40", name: "Erik", gender: "male" }, { id: "nl:36", name: "Floris", gender: "male" }, { id: "nl:45", name: "Gijs", gender: "male" }, { id: "nl:17", name: "Hidde", gender: "male" },
    { id: "nl:44", name: "Ivo", gender: "male" }, { id: "nl:20", name: "Joost", gender: "male" }, { id: "nl:13", name: "Kees", gender: "male" }
  ];
  var PIPER_NL_DEFAULT = "nl:14";      /* Eva */
  /* the Fast voices come in packs, one model per language, each downloaded and removed on its own (both kept in Cache
     Storage "piper-voices"): English, and Dutch. The pack in use is the open document's language's, English for any
     other language; NAT.piper reads its model, size, voices, narrator and what is on the device off it (natPacked) */
  var PIPER_PACKS = {
    en: { lang: "en", model: PIPER_MODEL, mb: PIPER_MB, voices: PIPER_VOICES, def: PIPER_DEFAULT, kNarr: P_NARR, urls: /libritts_r-medium/, main: /\.onnx$/, have: null },
    nl: { lang: "nl", model: PIPER_NL_MODEL, mb: PIPER_NL_MB, voices: PIPER_VOICES_NL, def: PIPER_NL_DEFAULT, kNarr: P_NARR_NL, urls: /nl_NL-mls-medium/, main: /\.onnx$/, have: null, dutch: true }
  };
  /* the document's language's voices: English or Dutch, else the English ones with a word of warning, once */
  function piperPool(lang){
    lang = String(lang || "en").slice(0, 2).toLowerCase();
    if (PIPER_PACKS[lang]) return PIPER_PACKS[lang].voices;
    natWarn(lang, true);
    return PIPER_VOICES;
  }

  /* the two models — what differs between them — and each one's worker state (natState) */
  var NAT = {
    kokoro: natState({ key: "kokoro", label: "Best", model: KOKORO_MODEL, mb: KOKORO_MB, voices: KOKORO_VOICES, def: "af_heart", pool: kokoroPool, options: kokoroOptions,
                       script: "./workers/kokoro-worker.js", caches: KOKORO_CACHES, urls: /Kokoro-82M/, main: /model_quantized\.onnx/,
                       runtime: ["/vendor/kokoro/"], rate: 24000, warm: true,
                       need: ["workers/kokoro-worker.js", "vendor/kokoro/kokoro.web.js", "vendor/kokoro/ort-wasm-simd-threaded.jsep.mjs", "vendor/kokoro/ort-wasm-simd-threaded.jsep.wasm"],
                       kNarr: K_KNARR, kRtf: K_RTF, kCps: K_CPS, kTold: "ll_kokoro_told",
                       told: "Natural voices are made on this device: the first sentence can take a minute on a phone, then it keeps reading" }),
    piper: natPacked(natState({ key: "piper", label: "Fast", packs: PIPER_PACKS, pool: piperPool, options: voiceOptions,
                      script: "./workers/piper-worker.js", caches: PIPER_CACHES,
                      runtime: ["/vendor/piper/", "/vendor/kokoro/ort-wasm"], rate: 22050, warm: false,
                      need: ["workers/piper-worker.js", "vendor/piper/ort.min.mjs", "vendor/piper/phonemizer-en-nl.js", "vendor/kokoro/ort-wasm-simd-threaded.jsep.mjs", "vendor/kokoro/ort-wasm-simd-threaded.jsep.wasm"],
                      kRtf: P_RTF, kCps: P_CPS, kTold: "ll_piper_told",
                      told: "Natural voices are made on this device; the first sentence takes a few seconds." }))
  };
  function natState(m){
    m.w = null; m.load = null; m.ready = false; m.jobs = {}; m.seq = 0; m.dl = {}; m.pct = -1; m.threads = 0; m.timer = null; m.warming = false; m.warmed = false;
    m.used = 0;        /* when the worker last had something to do */
    m.have = null;     /* { ready, model, bytes } — what Cache Storage held when last looked */
    m.loaded = "";     /* the language of the model the worker holds (Piper: "en" or "nl") */
    return m;
  }
  /* a model with language packs (Piper): what differs per pack is read off the open document's pack */
  function natPacked(m){
    ["model", "mb", "voices", "def", "kNarr", "urls", "main", "have"].forEach(function(k){
      Object.defineProperty(m, k, { configurable: true, enumerable: true,
                                    get: function(){ return natPack(m)[k]; }, set: function(v){ natPack(m)[k] = v; } });
    });
    return m;
  }
  /* the open document's language ("en" when there is none), and the pack of m for it (m itself without packs) */
  function docLang(){ return Speak && Speak.docLang ? String(Speak.docLang() || "en").slice(0, 2).toLowerCase() || "en" : "en"; }
  function natPack(m){ return m && m.packs ? m.packs[docLang()] || m.packs.en : m; }
  /* whether m speaks the open document's language: Kokoro English, Piper English and Dutch (its packs) */
  function natCan(m){ var l = docLang(); return l === "en" || !!(m && m.packs && m.packs[l]); }
  /* why not, for a toast before reading (reading) or the Prepare book line */
  function natNoLang(m, reading){
    var l = docLang(), name = langName(l);
    if (m === NAT.kokoro && NAT.piper.packs[l]) return reading ? _t("The Best natural voices speak English only — choose Fast for Dutch voices. The device voice reads this time.") : _t("The Best natural voices speak English only — choose Fast for Dutch voices");
    if (m && m.packs) return reading ? _t("The Fast natural voices speak English and Dutch — the device voice reads this {lang} text", { lang: name }) : _t("The Fast natural voices speak English and Dutch, and this text is in {lang}", { lang: name });
    return reading ? _t("Natural voices speak English only — the device voice reads this {lang} text", { lang: name }) : _t("Natural voices speak English only, and this text is in {lang}", { lang: name });
  }
  /* " · " and the pack's name in the Voices panel's lines (the Dutch voices; English, the first, goes unnamed) */
  function natHead(m, size){ var pk = natPack(m); return pk && pk.dutch ? (size ? _t("Dutch voices (≈ {mb} MB)", { mb: pk.mb }) : _t("Dutch voices")) + " · " : ""; }
  function natOther(m){ return m === NAT.piper ? NAT.kokoro : NAT.piper; }
  function natVoice(m, id){ for (var i = 0; i < m.voices.length; i++) if (m.voices[i].id === id) return m.voices[i]; return null; }
  function natNarrator(m){ var id = Store.get(m.kNarr); return natVoice(m, id) ? id : m.def; }
  function natName(m, id){ var v = natVoice(m, id); return v ? v.name : _t("Natural voice"); }
  /* the natural voices the reader chose: the engine picked in settings when it is one of them, else the quality last picked */
  function natCur(){
    var e = speakEngine();
    return e === "kokoro" || e === "piper" ? NAT[e] : Store.get("ll_natural_quality") === "best" ? NAT.kokoro : NAT.piper;
  }
  /* one clip per segment (a unit's run of text in one voice): no packing, so the highlight is exact per unit; the worker
     makes one clip at a time, in the order asked, three ahead of playback, and the feeder (5b) keeps it busy further on */
  function natSource(m){
    return { name: m.key, castKey: m.key, inflight: 1, ahead: 3, busy: "Generating…", pack: false, nat: m,
             model: function(){ return m.model; }, list: function(){ return Promise.resolve(m.voices); }, narrator: function(){ return natNarrator(m); },
             pool: function(list, lang){ return m.pool(lang || docLang()); }, options: m.options, run: function(task){ return natClip(m, task); } };
  }
  SRC.kokoro = natSource(NAT.kokoro);
  SRC.piper = natSource(NAT.piper);
  /* the source the feeder and Prepare book work for */
  function natSrc(){ return SRC[natCur().key]; }

  /* ---- the worker: load with progress, generate in order, cancel ---- */
  /* a load that shows no sign of life for this long (no progress, no ready) is given up on, so a
     refused nested worker or a stalled download never leaves the reader at "Preparing…" for ever */
  var K_STALL = 90000;
  function natWatch(m){
    clearTimeout(m.timer);
    if (!m.load) return;
    m.timer = setTimeout(function(){
      var l = m.load; if (!l) return;
      m.load = null; m.ready = false; m.dl = {}; m.pct = -1;
      try { if (m.w) m.w.terminate(); } catch(_){}
      m.w = null;
      l.rej(new Error(navigator.onLine ? _t("Natural voices couldn’t start (no response from the voice engine)") : _t("Natural voices need a connection to download")));
      liveReset(); natSync();
    }, K_STALL);
  }
  function natWorker(m){
    if (m.w) return m.w;
    var w = m.w = new Worker(m.script, { type: "module" });
    w.onmessage = function(e){
      var msg = e.data || {}, j;
      if (msg.type === "progress"){ natProgress(m, msg); natWatch(m); }
      else if (msg.type === "ready"){
        clearTimeout(m.timer);
        m.ready = true; m.threads = msg.threads || 0; m.dl = {}; m.pct = -1; m.used = Date.now(); m.loaded = msg.lang || "";
        var l = m.load; m.load = null; if (l) l.res();
        /* Kokoro: the English voices (28 × 0.5 MB) come down right after the model, however it came (Download, or
           reading), so every character's voice works offline; the ones already here are skipped */
        if (m.warm && !m.warmed && navigator.onLine){
          m.warming = true;
          try { w.postMessage({ type: "warm", voices: m.voices.map(function(v){ return v.id; }) }); } catch(_){ m.warming = false; }
        }
        m.have = null; liveReset(); natSync(); natIdle();
      } else if (msg.type === "audio"){
        j = m.jobs[msg.id]; if (!j) return;         /* dropped meanwhile */
        delete m.jobs[msg.id]; natMeasure(m, msg, j.n); m.used = Date.now();
        j.res({ samples: msg.samples, sampleRate: msg.sampleRate || m.rate, ms: msg.ms || 0 });
      } else if (msg.type === "warmed"){
        m.warming = false;
        if (msg.n >= m.voices.length) m.warmed = true;
        m.have = null;
      } else if (msg.type === "error"){
        if (msg.id === null || msg.id === undefined){
          clearTimeout(m.timer);
          var ld = m.load; m.load = null; m.dl = {}; m.pct = -1;
          if (ld) ld.rej(new Error(msg.message ? _t("Natural voices: {error}", { error: String(msg.message).slice(0, 80) }) : _t("Couldn’t load the natural voices")));
          liveReset(); natSync();
        } else { j = m.jobs[msg.id]; if (j){ delete m.jobs[msg.id]; j.rej(new Error(msg.message || _t("error"))); } }
      }
    };
    /* the script itself failed (offline before the runtime was ever cached, a browser without module workers):
       everything waiting fails now, and the next try makes a new worker */
    w.onerror = function(){
      clearTimeout(m.timer);
      var l = m.load, jobs = m.jobs;
      m.load = null; m.ready = false; m.jobs = {}; m.dl = {}; m.pct = -1; m.warming = false;
      try { w.terminate(); } catch(_){}
      if (m.w === w) m.w = null;
      var err = new Error(navigator.onLine ? _t("Natural voices couldn’t start in this browser") : _t("Natural voices need a connection to download"));
      if (l) l.rej(err);
      Object.keys(jobs).forEach(function(id){ jobs[id].rej(err); });
      liveReset(); natSync();
    };
    return w;
  }
  /* the model loaded in its worker (Piper: the open document's language's), downloading it first when it is not on the
     device; one load at a time */
  function natLoad(m){
    var lang = m.packs ? natPack(m).lang : "";
    if (natHeld(m)) return Promise.resolve();
    if (m.load) return m.load.promise;
    natCancel(natOther(m)); natRelease(natOther(m));      /* the other quality's work is no longer wanted */
    var l = {};
    l.promise = new Promise(function(res, rej){ l.res = res; l.rej = rej; });
    m.load = l;
    try { natWorker(m).postMessage(lang ? { type: "load", lang: lang } : { type: "load" }); } catch(err){ m.load = null; return Promise.reject(err); }
    natWatch(m);
    natSync();
    return l.promise;
  }
  /* the worker holds the model the open document needs (Piper: its language's pack) */
  function natHeld(m){ return !!(m.ready && m.w && m.loaded === (m.packs ? natPack(m).lang : "")); }
  /* a phone holds one model at a time comfortably: the other one's worker, once idle, lets it go (chosen again,
     it loads from the device) */
  function natRelease(o){
    if (!o.w || o.load || o.warming || Object.keys(o.jobs).length) return;
    try { o.w.terminate(); } catch(_){}
    o.w = null; o.ready = false;
  }
  /* a worker with nothing to do is let go: at once when its engine is no longer the one chosen, else after NAT_IDLE with
     no job, no feeding or preparing for it and nothing playing (paused counts as nothing); used again, it loads the
     model from the device in a few seconds */
  var natIdleT = null;
  function natIdle(ms){ clearTimeout(natIdleT); natIdleT = setTimeout(natIdleCheck, ms >= 0 ? ms : NAT_IDLE); }
  function natIdleCheck(){
    var next = -1;
    natIdleT = null;
    [NAT.piper, NAT.kokoro].forEach(function(m){
      if (!m.w) return;
      var chosen = speakEngine() === m.key, wait = -1;
      if (m.load || m.warming || Object.keys(m.jobs).length) wait = chosen ? NAT_IDLE : 5000;
      else if (chosen && ((natCur() === m && (feed.busy || feed.prep)) || (natRunning(m) && Speak.isPlaying && Speak.isPlaying()))) wait = NAT_IDLE;
      else if (chosen && Date.now() - m.used < NAT_IDLE) wait = NAT_IDLE - (Date.now() - m.used) + 500;
      if (wait < 0) natRelease(m);
      else if (next < 0 || wait < next) next = wait;
    });
    if (next >= 0) natIdle(next);
  }
  /* files come from the browser's cache in a flash (loaded = total at once); only a real download shows a percentage.
     The small files around the model (its config, the tokenizer) finishing do not flip the line back to "Preparing…" */
  function natProgress(m, msg){
    m.dl[msg.file] = { loaded: msg.loaded || 0, total: msg.total || 0 };
    var loaded = 0, total = 0, pct;
    Object.keys(m.dl).forEach(function(f){ loaded += m.dl[f].loaded; total += m.dl[f].total; });
    pct = total && loaded < total ? Math.min(99, Math.round(loaded * 100 / total)) : -1;
    if (pct < 0 && m.pct >= 0 && total < 5e6) pct = m.pct;
    m.pct = pct;
    if (natRunning(m)){ liveStep(document.getElementById("ttsStatus"), m.pct); setStatus(m.pct >= 0 ? _t("Downloading voices {pct}%…", { pct: m.pct }) : _t("Preparing…")); }
    if (m !== natCur()) return;      /* the rows show the other quality */
    var st = document.getElementById("kokoroState"), pr = document.getElementById("kokoroProgress"), text = natHead(m) + (m.pct >= 0 ? _t("Downloading… {pct}%", { pct: m.pct }) : _t("Preparing…"));
    if (st && st.textContent !== text){ liveStep(st, m.pct); st.textContent = text; }
    if (pr){ pr.hidden = m.pct < 0; if (m.pct >= 0) pr.value = m.pct; }
  }
  /* a download's progress in a live region: said when it starts, at each quarter and when it ends; the percentages
     between are shown (and the progress bar carries them), not read out, so a screen reader is not flooded */
  function liveStep(el, pct){
    if (!el) return;
    var step = String(pct >= 0 ? Math.floor(pct / 25) : -1), live = el.getAttribute("data-step") === step ? "off" : "polite";
    if (el.getAttribute("aria-live") !== live) el.setAttribute("aria-live", live);
    el.setAttribute("data-step", step);
  }
  /* the download is over (ready, failed): the bar's line is a live region again */
  function liveReset(){
    var el = typeof document !== "undefined" ? document.getElementById("ttsStatus") : null;
    if (!el || !el.hasAttribute("data-step")) return;
    el.removeAttribute("data-step");
    if (!hold) el.setAttribute("aria-live", "polite");
  }
  function natGenerate(m, text, voice){
    var id = ++m.seq;
    m.used = Date.now();
    return new Promise(function(res, rej){
      m.jobs[id] = { res: res, rej: rej, n: String(text || "").length };
      try { natWorker(m).postMessage({ type: "generate", id: id, text: text, voice: voice, speed: 1 }); }
      catch(err){ delete m.jobs[id]; rej(err); }
    });
  }
  /* everything the worker has not made yet is dropped, and so is what it is making */
  function natCancel(m){
    var ids = Object.keys(m.jobs);
    if (!ids.length) return;
    if (m.w) try { m.w.postMessage({ type: "cancel" }); } catch(_){}
    ids.forEach(function(id){ var j = m.jobs[id]; delete m.jobs[id]; var e = new Error("cancelled"); e.cancelled = true; j.rej(e); });
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
  function natClip(m, task){
    var clip = task.clip;
    return natLoad(m).then(function(){ return natGenerate(m, clip.text, clip.voice); }).then(function(r){
      var secs = r.samples.length / r.sampleRate, len = clip.text.length || 1;
      return { blob: wavBlob(r.samples, r.sampleRate), times: clip.parts.map(function(p){ return { a: p.s / len * secs, b: p.e / len * secs }; }) };
    }).catch(function(err){
      if (err && err.cancelled) throw err;
      var e = new Error(!navigator.onLine && m.ready ? _t("Offline — this natural voice isn’t on the device yet") : (err && err.message) || _t("Natural voices couldn’t make the audio"));
      e.offline = !navigator.onLine;
      throw e;
    });
  }
  /* is the model in Cache Storage (kept under its huggingface.co URLs, in every cache it uses: Kokoro's voice files
     too), and how big is it; asking does not make an empty cache (after Remove, the cache stays gone). Ready also
     needs the runtime the model runs on (the worker and vendor/ files the service worker keeps in its own cache),
     or it could not start offline; without a service worker that cannot be seen, and the model alone counts.
     Piper: the open document's pack, or the pack pk */
  function natOnDevice(m, pk){
    if (!(window.caches && caches.open)) return Promise.resolve({ ready: false, model: false, bytes: 0 });
    var model = false, bytes = 0;
    pk = pk || natPack(m);
    return Promise.all(m.caches.map(function(name){
      var cache;
      return caches.has(name).then(function(yes){ return yes ? caches.open(name) : null; }).then(function(c){ cache = c; return c ? c.keys() : []; }).then(function(keys){
        return Promise.all(keys.map(function(req){
          var u = req.url || "";
          if (!pk.urls.test(u)) return 0;
          if (pk.main.test(u)) model = true;
          return cache.match(req).then(function(r){
            if (!r) return 0;
            var n = +r.headers.get("content-length") || 0;
            return n || r.blob().then(function(b){ return b.size; });
          }).catch(function(){ return 0; });
        }));
      }).then(function(sizes){ sizes.forEach(function(n){ bytes += n; }); });
    })).then(function(){ return model ? natRuntime(m) : false; }).then(function(rt){
      pk.have = { ready: model && rt, model: model, bytes: bytes };
      return pk.have;
    }).catch(function(){ return { ready: false, model: false, bytes: 0 }; });
  }
  /* m's other packs (Piper: English while a Dutch book is open, and the other way round) */
  function natOtherPacks(m){
    var pk = natPack(m);
    return m.packs ? Object.keys(m.packs).map(function(k){ return m.packs[k]; }).filter(function(p){ return p !== pk; }) : [];
  }
  function natRuntime(m){
    var sw = navigator.serviceWorker;
    if (!(sw && sw.controller) || typeof document === "undefined") return Promise.resolve(true);
    return Promise.all(m.need.map(function(f){
      return caches.match(new URL(f, document.baseURI).href).then(function(r){ return !!r; }, function(){ return false; });
    })).then(function(all){ return all.every(Boolean); });
  }
  /* the Download button (Piper: the open document's pack) */
  function natDownload(m){
    if (m.load) return;
    var dutch = !!natPack(m).dutch;
    if (!navigator.onLine && !(m.have && m.have.ready)){ toast(_t("Connect to the internet once to download the natural voices")); return; }
    natLoad(m).then(function(){ toast(dutch ? _t("The Dutch voices are ready") : _t("Natural voices are ready")); }, function(err){ toast((err && err.message) || _t("Couldn’t download the natural voices")); });
  }
  /* the Remove button: the model's caches, its runtime files (not the ONNX runtime the other model still uses, when that
     one is on the device), and the worker holding the model. Piper: the open document's pack only (the files of its
     model in "piper-voices", the cache itself once it is empty, the runtime only when no other pack is left), or every
     pack (all: the Storage panel) */
  /* resolves to whether they were removed (the Storage panel measures again then) */
  function natRemove(m, all){
    var pk = m.packs && !all ? natPack(m) : null, mbs = m.mb;
    if (m.packs && all){
      mbs = 0;
      Object.keys(m.packs).forEach(function(k){ var p = m.packs[k]; if (p.have && p.have.model) mbs += p.mb; });
      mbs = mbs || m.packs.en.mb;
    }
    if (!confirm(pk && pk.dutch ? _t("Remove the Dutch voices from this device (≈ {mb} MB)? They can be downloaded again.", { mb: pk.mb })
                                : _t("Remove the {label} natural voices from this device (≈ {mb} MB)? They can be downloaded again.", { label: _t(m.label), mb: mbs }))) return Promise.resolve(false);
    if (natRunning(m) && Speak && Speak.stop) Speak.stop();
    feedStop();
    var l = m.load, jobs = m.jobs, other = natOther(m), rest = pk ? natOtherPacks(m) : [];
    var none = function(){ return { ready: false, model: false, bytes: 0 }; };
    clearTimeout(m.timer);
    m.load = null; m.ready = false; m.jobs = {}; m.dl = {}; m.pct = -1; m.warming = false; m.warmed = false; m.loaded = "";
    if (pk) pk.have = none();
    else if (m.packs) Object.keys(m.packs).forEach(function(k){ m.packs[k].have = none(); });
    else m.have = none();
    if (m.w){ try { m.w.terminate(); } catch(_){} m.w = null; }
    var gone = new Error(_t("Natural voices were removed"));
    if (l) l.rej(gone);
    Object.keys(jobs).forEach(function(id){ jobs[id].rej(gone); });
    function has(list, u){ for (var i = 0; i < list.length; i++) if (u.indexOf(list[i]) >= 0) return true; return false; }
    var work = [];
    if (window.caches){
      m.caches.forEach(function(n){
        if (!pk){ work.push(caches.delete(n).catch(function(){})); return; }
        /* one pack: its files go, and the cache with them once nothing else is in it */
        work.push(caches.has(n).then(function(yes){
          if (!yes) return;
          return caches.open(n).then(function(c){
            return c.keys().then(function(reqs){
              var left = reqs.filter(function(r){ return !pk.urls.test(r.url || ""); }).length;
              return Promise.all(reqs.filter(function(r){ return pk.urls.test(r.url || ""); }).map(function(r){ return c.delete(r); }))
                .then(function(){ if (!left) return caches.delete(n); });
            });
          });
        }).catch(function(){}));
      });
      /* the runtime stays while the other quality, or another pack of this one, is on the device */
      work.push(Promise.all([natOnDevice(other)].concat(rest.map(function(p){ return natOnDevice(m, p); }))).then(function(hs){
        var keep = hs[0].model ? other.runtime : [];
        if (hs.slice(1).some(function(h){ return h.model; })) return;
        return caches.keys().then(function(keys){
          return Promise.all(keys.filter(function(k){ return (k.indexOf("lamplight-") === 0 && k !== "lamplight-share") || k.indexOf("natural-runtime") === 0; }).map(function(k){
            return caches.open(k).then(function(c){
              return c.keys().then(function(reqs){ return Promise.all(reqs.filter(function(r){ return has(m.runtime, r.url) && !has(keep, r.url); }).map(function(r){ return c.delete(r); })); });
            });
          }));
        });
      }).catch(function(){}));
    }
    return Promise.all(work).then(function(){
      if (pk) pk.have = none(); else m.have = none();
      toast(pk && pk.dutch ? _t("Dutch voices removed") : _t("Natural voices removed")); natSync(); return true;
    });
  }
  function langName(l){
    try { if (typeof Intl !== "undefined" && Intl.DisplayNames) return new Intl.DisplayNames([I18N ? I18N.locale() : "en"], { type: "language" }).of(l) || l; } catch(_){}
    return l;
  }
  /* before reading starts: a language the model does not speak (Best: anything but English; Fast: anything but English and
     Dutch) is read by the device voice (every time, since it is the book that decides); the download (Fast: of the book's
     language's pack) is asked for, with its size, never started unasked; offline, a model not on the device means the
     device voice reads this time */
  function natReady(m){
    if (!natCan(m)){ toast(natNoLang(m, true)); return Promise.resolve(null); }
    var pk = natPack(m);
    if (natHeld(m)){ natTold(m); return Promise.resolve(true); }
    if (m.load) return Promise.resolve(true);      /* on its way already (Download was pressed) */
    return natOnDevice(m).then(function(h){
      if (h.ready || (h.model && navigator.onLine)){ natTold(m); return true; }
      if (!navigator.onLine){ toast(_t("Natural voices aren’t downloaded yet — the device voice reads until you’re online")); return null; }
      if (!confirm(pk.dutch ? _t("Download the Dutch voices to this device (≈ {mb} MB, once)? Use Wi-Fi if you can. Until then the device voice reads.", { mb: pk.mb })
                            : _t("Download the {label} natural voices to this device (≈ {mb} MB, once)? Use Wi-Fi if you can. Until then the device voice reads.", { label: _t(m.label), mb: m.mb }))){
        toast(_t("The device voice reads. The natural voices can be downloaded in the Voices panel."));
        return null;     /* Speak falls back without a second toast */
      }
      return true;
    });
  }
  /* once, when the model is on the device: how the first sentence behaves */
  function natTold(m){
    if (Store && Store.get(m.kTold) !== "1"){ Store.set(m.kTold, "1"); toast(_t(m.told)); }
  }

  /* ============================================================
     5. Playback — one audio element, sentence boundaries from the alignment
     ============================================================ */
  var audioEl = null, url = null, loadedKey = null, seq = 0, ticker = null, current = null, expectNext = null;
  var started = false;     /* this reading (from play to stop) has played a clip: a pause or a skip no longer waits on the smart start */
  function audio(){
    if (!audioEl){
      /* Speak makes the element inside the user gesture that starts reading, so iOS Safari lets it play afterwards */
      audioEl = (Speak && Speak.audioElement && Speak.audioElement()) || new Audio();
      audioEl.preload = "auto";
    }
    return audioEl;
  }
  /* "Fetching…" / "Generating…" / "Preparing…" in the live region, the counter beside it (ElevenLabs only);
     only a change is written, since screen readers announce every write to a live region. idle: a line that
     is not a wait on the worker (the smart start's count), so the play button stays pressable */
  function setStatus(text, idle){
    var el = document.getElementById("ttsStatus"), cnt = document.getElementById("ttsSent"), bar = document.getElementById("tts"), play = document.getElementById("ttsPlay");
    if (!el) return;
    var live = text || "", counter = (text || !(plan && plan.src === SRC.eleven)) ? "" : (sent ? _t("≈{n} chars sent", { n: fmt(sent) }) : ""), busy = !!live && !idle;
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
    if (!plan || !plan.clips){ opts.onerror(_t("not ready")); return; }
    /* straight on from the clip that just ended, rather than a start (play, a skip, a new reading) */
    var cont = endedAt > 0 && Date.now() - endedAt < 1500;
    endedAt = 0;
    /* after a clip ends, the next clip may start inside the same unit (a sentence with two voices) */
    if (expectNext !== null && plan.clips[expectNext] && plan.clips[expectNext].first <= i && i <= plan.clips[expectNext].last) ci = expectNext;
    expectNext = null;
    if (ci === undefined || !plan.clips[ci]){ opts.onend(); return; }
    var clip = plan.clips[ci];
    current = { clip: clip, index: ci, opts: opts, seq: mySeq, unit: -1, rec: null };
    if (!cont) dropBefore(ci);
    if (!(loadedKey && clip.key === loadedKey) && !got(clip)) setStatus(_t(plan.src.busy));     /* a clip already made: no "Generating…" flash */
    /* natural voices: a start may wait until enough is made ahead (5b); flowing on to a clip already made never does, and
       nor does a resume or a skip to one once this reading has started (a pause, Prev / Next) */
    var gate = plan.src.nat && !(got(clip) && (cont || started)) ? smartStart(ci, cont, mySeq) : null;
    if (plan.src.nat){ feed.goDoc = plan.docId; feed.liveAt = Date.now(); }
    getClip(clip, true).then(function(rec){
      if (mySeq !== seq) return;
      current.rec = rec;
      function go(){
        if (mySeq !== seq) return;
        started = true;
        setStatus();
        playClip(rec, clip, i, opts, mySeq);
        var k = clipIndex(clip);
        if (k >= 0) prefetch(k);
      }
      if (gate) gate.then(go); else go();
    }, function(err){
      if (mySeq !== seq || (err && err.cancelled)) return;
      setStatus();
      toast(err && err.message ? err.message : (plan.src === SRC.eleven ? _t("ElevenLabs request failed") : _t("Natural voices couldn’t make the audio")));
      opts.onerror(null);
    });
    if (plan.src.nat) feedKick();
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
      if (p && p.catch) p.catch(function(err){ if (mySeq !== seq) return; toast(_t("Couldn’t play the audio ({error})", { error: (err && err.name) || _t("error") })); opts.onerror(null); });
      startTicker(); tick();
    }
    a.onended = function(){
      if (mySeq !== seq) return;
      stopTicker(); endedAt = Date.now();
      /* the next clip is found by what this one was, not by its old index: the plan may have been rebuilt meanwhile */
      var k = clipIndex(clip), nx = k >= 0 ? plan.clips[k + 1] : null;
      expectNext = nx ? k + 1 : null;
      opts.onend({ advanceTo: nx ? nx.first : clip.last + 1 });
    };
    a.onerror = function(){ if (mySeq !== seq) return; stopTicker(); loadedKey = null; toast(_t("Couldn’t play the audio")); opts.onerror(null); };
    if (loadedKey === rec.key && a.src){ begin(); return; }
    loadedKey = rec.key;
    if (url){ try { URL.revokeObjectURL(url); } catch(_){} }
    url = URL.createObjectURL(rec.blob);
    a.onloadedmetadata = begin;
    a.src = url;
    a.load();
  }
  /* a start somewhere new (a skip, a jump): the clips before it that are still waiting their turn are not made (the one
     being made finishes and is kept) */
  function dropBefore(ci){
    for (var q = queue.length - 1; q >= 0; q--){
      var t = queue[q], k = plan && t.src === plan.src && t.docId === plan.docId ? clipIndex(t.clip) : -1;
      if (k < 0 || k >= ci) continue;
      queue.splice(q, 1); t.cancelled = true; delete inflight[t.key];
      var e = new Error("cancelled"); e.cancelled = true; t.rej(e);
    }
  }
  function cancel(){
    seq++; stopTicker(); current = null; holdEnd();
    if (audioEl){ try { audioEl.pause(); } catch(_){} }
    setStatus();
  }
  function stop(){
    if (plan && plan.src.nat && started){ feed.liveAt = Date.now(); natIdle(); }
    started = false;
    cancel(); expectNext = null; cancelQueued();
    if (audioEl){ try { audioEl.removeAttribute("src"); audioEl.load(); } catch(_){} }
    loadedKey = null;
    if (url){ try { URL.revokeObjectURL(url); } catch(_){} url = null; }
  }
  function setRate(r){ if (audioEl) audioEl.playbackRate = r; }

  /* ============================================================
     5b. Natural voices without pauses — the feeder keeps the worker making the clips after the reading
         position (half an hour of audio, or the whole document once Prepare book is pressed) while the reader
         reads, listens or pauses; the worker's measured speed says how long a start must wait so that reading
         never catches up with it; the clips on the device are known by key, so none is made twice
     ============================================================ */
  var feed = { busy: false, prep: false, t: null, have: null, haveDoc: null, haveP: null, bad: {}, msg: "", full: false, keying: false,
               goDoc: null, liveAt: 0, leadDoc: null };     /* read aloud in this document (when last), its first minute made */
  var hold = null, endedAt = 0, wake = null, wakeAsk = false;
  /* measured per model (m: NAT.kokoro or NAT.piper) */
  function rtf(m){ var v = m ? parseFloat(Store.get(m.kRtf)) : 0; return v > 0 ? v : 0; }
  function cps(m){ var v = m ? parseFloat(Store.get(m.kCps)) : 0; return v > 0 ? v : 14; }
  function ema(old, x){ return old > 0 ? old * 0.7 + x * 0.3 : x; }
  /* every clip a worker makes: seconds of work per second of audio, and characters per second of audio */
  function natMeasure(m, msg, chars){
    var secs = msg.samples && msg.sampleRate ? msg.samples.length / msg.sampleRate : 0;
    if (!(secs > 0.2) || !(msg.ms > 0)) return;
    Store.set(m.kRtf, ema(rtf(m), msg.ms / 1000 / secs).toFixed(4));
    if (chars > 0) Store.set(m.kCps, ema(parseFloat(Store.get(m.kCps)) || 0, chars / secs).toFixed(4));
  }
  /* the smart start (pure): making r seconds of work per second of audio, playing the next W seconds without
     catching up needs W·(r−1)/r seconds made first; have is what is made already, eta how long the rest takes.
     A wait longer than cap (90 s) is not worth it: reading starts at once, with pauses, and slow says so */
  function holdFor(r, W, have, cap){
    r = +r || 0; W = Math.max(0, +W || 0); have = Math.max(0, +have || 0); cap = cap > 0 ? cap : HOLD_CAP;
    if (!(r > 1)) return { hold: false, eta: 0, need: 0, slow: false };
    var need = W * (r - 1) / r, eta = Math.max(0, need - have) * r;
    if (have >= need) return { hold: false, eta: 0, need: need, slow: false };
    if (eta > cap) return { hold: false, eta: eta, need: need, slow: true };
    return { hold: true, eta: eta, need: need, slow: false };
  }

  /* ---- what is on the device: the keys of the open document's clips (seconds of audio where known) ---- */
  function recSecs(rec){ var t = rec && rec.times, l = t && t.length ? t[t.length - 1] : null; return l && !l.rel && l.b > 0 ? l.b : 0; }
  function got(c){ return !!(c && c.key && feed.have && c.doc === feed.haveDoc && feed.have[c.key]); }
  /* a clip's seconds of audio: measured once made, else from its length at the model's pace (m) */
  function secsOf(c, m){ var h = got(c) ? feed.have[c.key] : 0; return typeof h === "number" && h > 0 ? h : (c.text.length || 1) / cps(m); }
  function keyed(p, from){ return Promise.all(p.clips.slice(from || 0).map(clipKey)); }
  function feedHave(docId){
    if (feed.haveDoc === docId && feed.have) return Promise.resolve(feed.have);
    if (feed.haveDoc === docId && feed.haveP) return feed.haveP;
    feed.haveDoc = docId; feed.have = null;
    var p = feed.haveP = (Library ? Library.tx("audio", "readonly", function(st){
      var ix = st.index("doc");
      return ix.getAllKeys ? ix.getAllKeys(IDBKeyRange.only(docId)) : null;
    }) : Promise.resolve(null)).catch(function(){ return null; }).then(function(keys){
      var h = {};
      (keys || []).forEach(function(k){ h[k] = true; });
      if (feed.haveP === p){ feed.have = h; feed.haveP = null; }
      return h;
    });
    return p;
  }
  /* a clip made or read from the device: the smart start and the Prepare book line may move on */
  function known(rec){
    if (!rec || !rec.key || !feed.have || rec.docId !== feed.haveDoc) return;
    var was = feed.have[rec.key];
    feed.have[rec.key] = recSecs(rec) || true;
    if (!was){ if (hold) holdCheck(); prepSync(); }
  }
  /* the clip at the reading position: the one playing or paused on, else the one at the top of the screen */
  function readPos(p){
    var i = -1, j, k;
    if (plan === p && isRunning()){
      if (current && current.clip){ k = clipIndex(current.clip); if (k >= 0) return k; }
      i = Speak && Speak.index ? Speak.index() : -1;
    } else if (state && state.mode === "doc" && Library && Library.topCharOffset){
      var off = Library.topCharOffset() || 0;
      for (j = 0; j < p.units.length; j++) if (p.units[j].end > off){ i = j; break; }
    } else if (state && state.mode === "pdf" && Library && Library.currentPdfPage){
      var pg = Library.currentPdfPage() || 0;
      for (j = 0; j < p.units.length; j++) if ((p.units[j].page || 0) >= pg){ i = j; break; }
    }
    k = i >= 0 ? p.firstClip[i] : 0;
    if (k === undefined) k = i >= p.units.length ? p.clips.length : 0;     /* read past the pages planned so far */
    return k;
  }

  /* ---- the feeder: one clip at a time (the worker is sequential), in reading order ---- */
  function feedOn(){
    var e = speakEngine();
    return !!((e === "kokoro" || e === "piper") && state && (state.mode === "doc" || state.mode === "pdf") &&
              !elevenRunning() && NAT[e].engine && NAT[e].engine.supported() && natCan(NAT[e]));     /* the book's language: see natReady */
  }
  /* how far ahead to make, in seconds of audio: the whole document when preparing; half an hour while read aloud is on in
     this document (reading or paused) and for three minutes after it stops; else its first minute, once */
  function feedAhead(docId){
    if (feed.prep) return Infinity;
    if (natRunning(natCur())){ feed.goDoc = docId; feed.liveAt = Date.now(); }
    if (feed.goDoc === docId){
      feed.leadDoc = docId;
      if (Date.now() - feed.liveAt < FEED_LINGER) return FEED_AHEAD;
    }
    return feed.leadDoc === docId ? 0 : FEED_LEAD;
  }
  /* the open document's natural-voices plan (the chosen model's): the one being read, else worked out now for a text document */
  function feedPlan(){
    var doc = (Library && Library.currentId && Library.currentId()) || "", src = natSrc();
    function mine(){ return plan && plan.src === src && plan.docId === doc && plan.clips && plan.pack === srcPack(src) ? plan : null; }
    if (mine()) return Promise.resolve(mine());
    if (state && state.mode === "doc" && Speak && Speak.buildDocUnits){
      return castPlan(src).then(function(){ var p = mine(); if (!p) throw new Error("replanned"); return p; });
    }
    var e = new Error(_t("Start reading this PDF aloud, then prepare it (the pages loaded so far)")); e.noplan = true;
    return Promise.reject(e);
  }
  /* the next clip to make: the first neither on the device nor on its way, from the reading position on, within half
     an hour of audio (preparing: the whole document, from the reading position, then from its start), and within
     the audio the device keeps */
  function feedPick(p, ahead){
    var n = p.clips.length, start = readPos(p), all = feed.prep, acc = 0, bytes = 0, flying = 0, m = p.src.nat, j, c, s;
    for (j = 0; j < (all ? n : n - start); j++){
      c = p.clips[(start + j) % n]; s = secsOf(c, m);
      if (!all && acc >= ahead) break;
      bytes += s * m.rate * 2 + 44;       /* 16-bit mono WAV */
      if (bytes > AUDIO_CAP) return { full: true, flying: flying };
      acc += s;
      if (got(c) || feed.bad[c.key]) continue;
      if (inflight[c.key]){ flying++; continue; }
      return { clip: c };
    }
    return { flying: flying };
  }
  function feedKick(ms){
    if (feed.busy) return;
    clearTimeout(feed.t);
    feed.t = setTimeout(feedStep, ms || 0);
  }
  /* another document, or the voices removed: the feeder and any preparing stop */
  function feedStop(){
    clearTimeout(feed.t); feed.t = null;
    if (feed.busy) cancelQueued();
    feed.full = false; feed.msg = ""; feed.bad = {};
    if (feed.prep){ feed.prep = false; wakeOff(); }
    prepSync();
  }
  function prepEnd(msg){ feed.prep = false; if (msg) feed.msg = msg; wakeOff(); prepSync(); }
  function feedStep(){
    feed.t = null;
    if (feed.busy || typeof document === "undefined" || document.visibilityState === "hidden") return;   /* hidden: goes on once visible */
    if (!feedOn()){ if (feed.prep) prepEnd(); return; }
    /* nothing is downloaded unasked: without Prepare book the model must be on the device (or on its way for reading) */
    var m = natCur();
    if (!(feed.prep || natHeld(m) || m.load || (m.have && m.have.ready))){
      if (!m.have) natOnDevice(m).then(function(h){ if (h.ready) feedKick(); });
      return;
    }
    var doc = (Library && Library.currentId && Library.currentId()) || "";
    if (!feedAhead(doc)) return;       /* the first minute is made, and read aloud is not on: nothing more until it is */
    var p = null, c = null, ahead = 0;
    feed.busy = true;
    feedPlan().then(function(pl){
      p = pl;
      return feedHave(p.docId).then(function(){ return keyed(p); });
    }).then(function(){
      if (plan !== p || !feedOn()) return "again";
      prepSync();
      ahead = feedAhead(p.docId);
      var x = ahead ? feedPick(p, ahead) : {};
      if (x.clip){ c = x.clip; return getClip(c, false).then(function(){ return "next"; }); }
      feed.full = !!x.full;
      if (feed.prep && !x.flying) prepEnd();
      if (!x.flying && ahead <= FEED_LEAD) feed.leadDoc = p.docId;
      return x.flying ? "again" : "idle";
    }).then(function(how){
      feed.busy = false;
      /* idle: everything within reach is made; while read aloud is on the reading position moves on, so it looks again
         now and then (not for the first minute alone: a reader reading with their eyes is not followed) */
      if (how === "idle" && ahead <= FEED_LEAD) return;
      feedKick(how === "next" ? 0 : how === "again" ? 1000 : 20000);
    }, function(err){
      feed.busy = false;
      if (err && err.cancelled){ feedKick(500); return; }
      if (err && err.noplan){ if (feed.prep) prepEnd(err.message); return; }
      if (c && m.ready){ feed.bad[c.key] = true; feedKick(1000); return; }     /* the model works, not on this text: skipped */
      if (feed.prep) prepEnd((err && err.message) || _t("Natural voices couldn’t make the audio"));
    });
  }

  /* ---- the smart start: reading that starts (or has caught up with the worker) waits, counting down in the bar,
     until enough is made that it won't catch up again in the next ten minutes (or the rest of the document);
     never longer than a minute and a half, and the play button starts it at once ---- */
  function smartStart(ci, cont, mySeq){
    /* hidden, the feeder rests, so there would be nothing to wait for */
    if (!plan || !(rtf(plan.src.nat) > 1) || (typeof document !== "undefined" && document.visibilityState === "hidden")) return null;
    var p = plan;
    return new Promise(function(res){
      feedHave(p.docId).then(function(){ return keyed(p, ci); }).then(function(){
        if (mySeq !== seq) return;
        if (cont && plan === p && got(p.clips[ci])){ res(); return; }
        hold = { seq: mySeq, ci: ci, plan: p, res: res, eta: 0, at: 0, timer: null, shown: false };
        holdCheck();
      });
    });
  }
  function holdCheck(){
    var h = hold;
    if (!h) return;
    if (h.seq !== seq){ holdEnd(); return; }
    if (plan !== h.plan){
      /* the plan was rebuilt (PDF pages appended): the same clip in the new one */
      var at = current && current.seq === h.seq ? clipIndex(current.clip) : -1;
      if (at < 0){ holdRelease(); return; }
      h.plan = plan; h.ci = at;
      keyed(plan, at).then(holdCheck);
      return;
    }
    var p = h.plan, m = p.src.nat, W = 0, have = 0, gap = false, k, c, s;
    for (k = h.ci; k < p.clips.length && W < HOLD_WINDOW; k++){
      c = p.clips[k]; s = secsOf(c, m); W += s;
      if (!gap && got(c)) have += s; else gap = true;
    }
    var x = holdFor(rtf(m), Math.min(W, HOLD_WINDOW), have);
    if (!x.hold){
      if (x.slow && Store.get(K_SLOWTIP) !== "1"){
        Store.set(K_SLOWTIP, "1");
        toast(_t("This phone makes speech slower than it reads. Tap Prepare book in the Voices panel for no pauses."));
      }
      holdRelease(); return;
    }
    h.eta = x.eta; h.at = Date.now();
    holdShow();
    if (!h.timer) h.timer = setInterval(holdShow, 1000);
  }
  function holdShow(){
    var h = hold;
    if (!h || typeof document === "undefined") return;
    var left = Math.max(0, Math.ceil(h.eta - (Date.now() - h.at) / 1000)), sec = left % 60;
    var el = document.getElementById("ttsStatus"), play = document.getElementById("ttsPlay");
    if (el && h.shown) el.setAttribute("aria-live", "off");     /* the first line is announced, not every second after it */
    h.shown = true;
    setStatus(_t("Starts in {time}, then no pauses", { time: Math.floor(left / 60) + ":" + (sec < 10 ? "0" : "") + sec }), true);
    var now = _t("Start now");
    if (play && play.getAttribute("aria-label") !== now) play.setAttribute("aria-label", now);
  }
  function holdEnd(){
    var h = hold;
    if (!h) return null;
    hold = null; clearInterval(h.timer);
    if (h.shown && typeof document !== "undefined"){
      var el = document.getElementById("ttsStatus"), play = document.getElementById("ttsPlay");
      if (el) el.setAttribute("aria-live", "polite");
      if (play) play.setAttribute("aria-label", Speak && Speak.isPlaying && Speak.isPlaying() ? _t("Pause") : _t("Play"));
    }
    return h;
  }
  function holdRelease(){
    var h = holdEnd();
    if (!h || h.seq !== seq) return;
    if (h.shown) setStatus(_t(h.plan.src.busy));     /* until the clip itself is ready */
    h.res();
  }

  /* ---- Prepare book: the whole document made ahead (a PDF's pages loaded so far), so it plays with no pauses and
     offline. Pressed again, it stops; clips already made are skipped, so pressing it after a reload carries on ---- */
  function wakeOn(){
    if (!feed.prep || wake || wakeAsk || typeof navigator === "undefined" || !(navigator.wakeLock && navigator.wakeLock.request) || document.visibilityState !== "visible") return;
    wakeAsk = true;
    navigator.wakeLock.request("screen").then(function(l){
      wakeAsk = false;
      if (!feed.prep){ l.release().catch(function(){}); return; }
      wake = l;
      l.addEventListener("release", function(){ if (wake === l) wake = null; });
    }, function(){ wakeAsk = false; });
  }
  function wakeOff(){ if (wake){ var l = wake; wake = null; l.release().catch(function(){}); } }
  function prepareBook(){
    feed.msg = ""; feed.full = false;
    if (feed.prep){ prepEnd(); return; }
    if (!state || (state.mode !== "doc" && state.mode !== "pdf")){ feed.msg = _t("Open a book first"); prepSync(); return; }
    var m = natCur();
    if (!natCan(m)){ feed.msg = natNoLang(m, false); prepSync(); return; }
    if (!navigator.onLine && !natHeld(m) && !(m.have && m.have.ready)){ toast(_t("Connect to the internet once to download the natural voices")); return; }
    feed.prep = true; feed.bad = {};
    wakeOn(); prepSync(); feedKick();
  }
  function dur(s){ var m = Math.max(1, Math.round(s / 60)); return m < 60 ? _t("{n} min", { n: m }) : m % 60 ? _t("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }) : _t("{h} h", { h: Math.floor(m / 60) }); }
  /* the Prepare book row: its button, "Audiobook: 34% ready · about 25 min left" and the progress bar */
  function prepSync(){
    if (typeof document === "undefined") return;
    var btn = document.getElementById("kokoroPrep"), st = document.getElementById("kokoroPrepState"), pr = document.getElementById("kokoroPrepProgress");
    if (!btn) return;
    var lab = feed.prep ? _t("Stop preparing") : _t("Prepare book");
    if (btn.textContent !== lab) btn.textContent = lab;
    var doc = (Library && Library.currentId && Library.currentId()) || "", p = plan && plan.src === natSrc() && plan.docId === doc && plan.clips ? plan : null;
    var m = p ? p.src.nat : null, text = feed.msg, pct = -1, tot = 0, have = 0, ch = 0, chHave = 0, bytes = 0, run = false, i, s, n;
    if (!text && p && feed.have && feed.haveDoc === doc){
      for (i = 0; i < p.clips.length && p.clips[i].key; i++){}
      if (i < p.clips.length){
        if (!feed.keying){ feed.keying = true; keyed(p).then(function(){ feed.keying = false; prepSync(); }, function(){ feed.keying = false; }); }
      } else {
        /* the percentage by characters (estimated seconds at one pace), so it only goes up as clips are made */
        for (i = 0; i < p.clips.length; i++){ s = secsOf(p.clips[i], m); n = p.clips[i].text.length || 1; tot += s; ch += n; bytes += s * m.rate * 2 + 44; if (got(p.clips[i])){ have += s; chHave += n; } }
        pct = ch ? Math.min(100, Math.floor(chHave * 100 / ch)) : 100;
        /* the audio is kept uncompressed, and the device keeps AUDIO_CAP of it: a long book does not fit whole */
        var fits = bytes > AUDIO_CAP ? tot * AUDIO_CAP / bytes : tot;
        /* the line's parts, each a phrase of its own, are joined by " · " */
        if (chHave >= ch) text = _t("Audiobook ready · plays with no pauses, offline");
        else {
          text = _t("Audiobook: {pct}% ready", { pct: pct });
          if (feed.full) text += " · " + _t("the {size} kept for audio is full, the rest is made as you listen", { size: mb(AUDIO_CAP) });
          else {
            if (fits < tot) text += " · " + _t("about {part} of its {whole} fits on this device", { part: dur(fits), whole: dur(tot) });
            if (feed.prep && rtf(m) > 0) text += " · " + _t("about {time} left", { time: dur(Math.max(0, fits - have) * rtf(m)) });
            run = true;
          }
        }
      }
    }
    if (st && st.textContent !== text){
      /* the running line changes with every clip made: while preparing it is read out at each quarter, otherwise not at
         all; the start, the end (ready, full, stopped) and errors always are */
      var live = !run ? "polite" : !feed.prep ? "off" : st.getAttribute("data-step") === String(Math.floor(pct / 25)) ? "off" : "polite";
      if (st.getAttribute("aria-live") !== live) st.setAttribute("aria-live", live);
      if (run && feed.prep) st.setAttribute("data-step", String(Math.floor(pct / 25))); else st.removeAttribute("data-step");
      st.textContent = text;
    }
    if (pr){ pr.hidden = !feed.prep || pct < 0; if (pct >= 0) pr.value = pct; }
  }

  /* ============================================================
     6. Settings (the rows in the Read-aloud voices panel) and the Cast panel
     ============================================================ */
  /* a narrator select; lazy = the list already on the device only, so nothing is sent to ElevenLabs while the app starts up */
  function fillVoices(sel, lazy){
    var have = voiceCache || storedVoices(true);
    sel.innerHTML = have ? voiceOptions(have, narratorId(have)) : '<option value="">' + esc(_t("Loading voices…")) + '</option>';
    if (lazy || (have && voiceCache)) return;
    voices().then(function(list){
      sel.innerHTML = voiceOptions(list, narratorId(list)) || '<option value="">' + esc(_t("No voices")) + '</option>';
      syncName();
    }, function(){ if (!have) sel.innerHTML = '<option value="">' + esc(_t("Voices unavailable")) + '</option>'; });
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
      if (!apiKey()){ sel.disabled = true; sel.innerHTML = '<option value="">' + esc(_t("Add a key first")) + '</option>'; }
      else { sel.disabled = false; fillVoices(sel, !asked); }
    }
    if (link) link.textContent = apiKey() ? _t("Change the ElevenLabs API key…") : _t("ElevenLabs API key…");
    audioSync();
  }
  /* ---- the natural voices' rows (they follow the chosen quality, natCur): narrator, and the model's
     download / ready / remove row ---- */
  function natFillVoices(m, sel){ sel.innerHTML = m.options(m.voices, natNarrator(m)); sel.setAttribute("data-nat", m.key); sel.setAttribute("data-pack", natPack(m).lang || ""); }
  function natShowNarrator(m, id, from){
    ["ttsVoice", "kokoroNarrator"].forEach(function(i){
      var el = document.getElementById(i);
      if (!el || el === from || (i === "ttsVoice" && !natRunning(m)) || (i === "kokoroNarrator" && el.getAttribute("data-nat") !== m.key)) return;
      el.value = id;
    });
    if (Side && Side.is && Side.is("cast") && Side.body && plan && plan.src.nat === m){ var el = Side.body.querySelector('select[data-key="narrator"]'); if (el && el !== from) el.value = id; }
    syncName();
  }
  function natSetNarrator(m, id, from){
    if (!natVoice(m, id)) return;
    Store.set(m.kNarr, id);
    if (plan && plan.src.nat === m) plan.narrator = id;
    natShowNarrator(m, id, from);
    replan(SRC[m.key]);
  }
  /* the narrator select in the read-aloud bar; Speak restarts the sentence if it is playing */
  function natVoiceChanged(m, id){
    if (!natVoice(m, id)) return;
    Store.set(m.kNarr, id);
    if (plan && plan.src.nat === m){ plan.narrator = id; cancelQueued(); buildClips(); }
    natShowNarrator(m, id, document.getElementById("ttsVoice"));
  }
  function natSync(){
    if (typeof document === "undefined") return;
    var m = natCur(), pk = natPack(m), sel = document.getElementById("kokoroNarrator"), st = document.getElementById("kokoroState");
    var dl = document.getElementById("kokoroDl"), rm = document.getElementById("kokoroRm"), pr = document.getElementById("kokoroProgress");
    if (sel){ if (sel.getAttribute("data-nat") !== m.key || sel.getAttribute("data-pack") !== (pk.lang || "") || sel.options.length < m.voices.length) natFillVoices(m, sel); else sel.value = natNarrator(m); }
    /* Fast: the Download button names the open document's pack (the Dutch voices for a Dutch book) */
    if (dl && m.packs){
      var dt = pk.dutch ? _t("Download Dutch voices (≈ {mb} MB, once)", { mb: pk.mb }) : _t("Download natural voices (≈ {mb} MB, once)", { mb: pk.mb });
      if (dl.textContent !== dt) dl.textContent = dt;
    }
    audioSync(); prepSync(); feedKick();
    if (!st) return;
    function show(text, canDl, canRm, pct){
      if (m.load) liveStep(st, pct);
      else if (st.hasAttribute("data-step")){ st.removeAttribute("data-step"); st.setAttribute("aria-live", "polite"); }     /* the download is over */
      if (st.textContent !== text) st.textContent = text;
      if (dl) dl.hidden = !canDl;
      if (rm) rm.hidden = !canRm;
      if (pr){ pr.hidden = pct < 0; if (pct >= 0) pr.value = pct; }
    }
    if (m.load){ show(natHead(m) + (m.pct >= 0 ? _t("Downloading… {pct}%", { pct: m.pct }) : _t("Preparing…")), false, false, m.pct); return; }
    var other = natOther(m), also = "", note = !natCan(m) && m === NAT.kokoro && NAT.piper.packs[docLang()] ? " · " + _t("English only — Fast has Dutch voices") : "";
    function have(h){
      /* also: " · " and a phrase of its own, the other quality's voices and the other pack's; note: Best on a Dutch book */
      if (h.ready) show(natHead(m) + _t("Ready · {size} on this device", { size: mb(h.bytes || m.mb * 1048576) }) + also + note, false, true, -1);
      else if (h.model) show(natHead(m) + (navigator.onLine ? _t("Almost ready — the voice engine still needs a connection once") : _t("Not ready — the voice engine needs a connection once")) + note, true, true, -1);
      else show(natHead(m, true) + (navigator.onLine ? _t("Not on this device yet") : _t("Not on this device yet — needs a connection once")) + also + note, true, false, -1);
    }
    /* what was last seen, while the cache is asked again (a model that has just loaded keeps its line until then) */
    if (m.have) have(m.have); else if (!m.ready) show(_t("Checking…"), false, false, -1);
    /* the other quality's model and the other pack, still on the device, are named, so their space is not forgotten
       (choose the quality, or open a book in the pack's language, to remove it) */
    var packs = natOtherPacks(m);
    Promise.all([natOnDevice(other)].concat(packs.map(function(p){ return natOnDevice(m, p); }))).then(function(hs){
      also = hs[0].model ? " · " + _t("the {label} voices are here too ({size})", { label: _t(other.label), size: mb(hs[0].bytes || other.mb * 1048576) }) : "";
      packs.forEach(function(p, i){
        var o = hs[i + 1];
        if (o.model) also += " · " + (p.dutch ? _t("the Dutch voices are here too ({size})", { size: mb(o.bytes || p.mb * 1048576) })
                                              : _t("the English voices are here too ({size})", { size: mb(o.bytes || p.mb * 1048576) }));
      });
      return natOnDevice(m, pk);
    }).then(function(h){ if (!m.load && natCur() === m && natPack(m) === pk && document.getElementById("kokoroState") === st) have(h); });
  }

  /* the panel is drawn afresh each time it opens, so its rows are handled from the document; the key link, the
     download and remove buttons and the Cast button are Speak's, so they work before this script has loaded */
  if (typeof document !== "undefined"){
    document.addEventListener("change", function(e){
      var t = e.target;
      if (t && t.id === "elevenNarrator" && t.value) setNarrator(t.value, t);
      if (t && t.id === "kokoroNarrator" && t.value) natSetNarrator(NAT[t.getAttribute("data-nat")] || natCur(), t.value, t);
    });
    document.addEventListener("click", function(e){
      var c = e.target && e.target.closest ? e.target.closest("#elevenModelChips .chip") : null;
      if (c && c.dataset.model) setModel(c.dataset.model);
    });
    /* the play button while the smart start is counting down starts reading at once (and does not pause it) */
    document.addEventListener("click", function(e){
      if (!hold || hold.seq !== seq || !(e.target && e.target.closest && e.target.closest("#ttsPlay"))) return;
      e.stopPropagation(); e.preventDefault();
      holdRelease();
    }, true);
    /* the feeder rests while the page is hidden (a start waiting on it goes ahead) and carries on when it is back;
       another document stops it */
    document.addEventListener("visibilitychange", function(){
      if (document.visibilityState === "visible"){ wakeOn(); feedKick(); }
      else holdRelease();
    });
    document.addEventListener("ll:fileopened", feedStop);
  }

  /* ---- the Cast panel: every character found in the document, with a voice each ---- */
  function speakEngine(){ return Speak && Speak.engine ? Speak.engine() : "device"; }
  /* the ElevenLabs or natural-voices plan for the open document: the one being read, or worked out now for a text document
     (the cast needs no model and no key beyond the voice list) */
  function castPlan(src){
    var docId = Library && Library.currentId ? Library.currentId() : "";
    if (plan && plan.src === src && plan.docId === (docId || "") && plan.clips && plan.pack === srcPack(src)) return Promise.resolve(plan);
    if (state && state.mode === "doc" && Speak && Speak.buildDocUnits){
      var units = Speak.buildDocUnits();
      return planFor(src, units, { docId: docId, mode: "doc", title: document.title, lang: Speak.docLang ? Speak.docLang() : "" }).then(function(){ return plan; });
    }
    return Promise.reject(new Error(_t("Start reading aloud first to find who speaks on these pages.")));
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
    return Promise.reject(new Error(_t("Start reading aloud first to find who speaks on these pages.")));
  }
  function openCast(){ if (Side && Side.open) Side.open("cast", _t("Voices for characters"), renderCast); }
  var castFocus = null;
  function refreshCast(){
    if (!(Side && Side.is && Side.is("cast") && Side.refresh)) return;
    var act = document.activeElement;
    castFocus = act && act.dataset && act.dataset.key && Side.body && Side.body.contains(act) ? act.dataset.key : null;
    Side.refresh("cast", renderCast);
  }
  /* a character's name as shown: the unnamed voices attribute() makes ("He", "Another voice") in the interface's words;
     a name from the book as the book has it */
  function shownName(c){ return SYNTH.hasOwnProperty(c.key) ? _t(c.name) : c.name; }
  function linesOf(n){ return _tn(n, "{n} line", "{n} lines"); }
  /* "male · 12 lines": a list of two phrases, joined by " · " */
  function who(c){ return (c.gender === "unknown" ? "" : _t(c.gender) + " · ") + linesOf(c.lines); }
  /* the document's language, for the book's own words (a quote) in the interface's */
  function bookLang(){ var l = Speak && Speak.docLang ? String(Speak.docLang() || "") : ""; return /^[a-z]{2,3}$/i.test(l) ? l : "en"; }
  function focusBack(wrap){
    if (!castFocus) return;
    /* the panel was redrawn under the reader: focus goes back to the row they were on */
    var sels = wrap.querySelectorAll("[data-key]"), back = document.getElementById("sideClose"), f;
    for (f = 0; f < sels.length; f++) if (sels[f].dataset.key === castFocus){ back = sels[f]; break; }
    castFocus = null;
    if (back) back.focus({ preventScroll: true });
  }
  function renderCast(body, foot){
    if (!state || (state.mode !== "doc" && state.mode !== "pdf")){ body.innerHTML = '<div class="empty-note">' + esc(_t("Open a book first.")) + '</div>'; return; }
    if (speakEngine() === "device"){ renderDeviceCast(body, foot); return; }
    var e = speakEngine(), src = e === "kokoro" || e === "piper" ? SRC[e] : SRC.eleven;
    if (src === SRC.eleven && !apiKey()){
      body.innerHTML = '<div class="empty-note">' + esc(_t("Add an ElevenLabs API key first.")) + '</div>';
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = _t("ElevenLabs API key…");
      b.addEventListener("click", function(){ askForKey(); });
      foot.appendChild(b);
      return;
    }
    body.innerHTML = '<div class="empty-note">' + esc(_t("Finding who speaks…")) + '</div>';
    whoButton(foot);
    castPlan(src).then(function(pl){
      if (!Side.is("cast")) return;
      var vp = { kind: "plan", pl: pl };
      var h = '<div class="cast-row"><div class="cast-who"><b>' + esc(_t("Narrator")) + '</b><span>' + esc(_t("everything outside the quotes")) + '</span></div>' +
              '<select class="sel" data-key="narrator" aria-label="' + esc(_t("Voice for the narrator")) + '">' + pl.src.options(pl.list, pl.narrator) + '</select></div>';
      pl.cast.forEach(function(c){
        h += '<div class="cast-row"><div class="cast-who"><b>' + esc(shownName(c)) + '</b><span>' + esc(who(c)) + '</span></div>' + voiceSelect(vp, c) + '</div>';
      });
      if (!pl.cast.length) h += '<div class="empty-note">' + esc(_t("No dialogue found — the narrator reads everything.")) + '</div>';
      else h += '<div class="cast-note">' + esc(_t("Speakers are worked out on this device from the quoted lines, speech tags (“said Anna”, “he whispered”), who acts beside a line and who takes turns; the unnamed ones get voices of their own too. A change applies from the next sentence.")) + '</div>';
      var wrap = document.createElement("div");
      wrap.innerHTML = h;
      body.innerHTML = ""; body.appendChild(wrap);
      focusBack(wrap);
      wrap.addEventListener("change", function(e){
        var sel = e.target.closest("select[data-key]"); if (!sel || !sel.value) return;
        if (sel.dataset.key === "narrator"){
          pl.narrator = sel.value;
          if (pl.src.nat){ Store.set(pl.src.nat.kNarr, sel.value); natShowNarrator(pl.src.nat, sel.value, sel); }
          else { Store.set(K_NARR, sel.value); showNarrator(sel.value, sel); }
          if (plan === pl) replan();
        } else voicePicked(vp, sel.dataset.key, sel.value);
      });
    }, function(err){
      if (Side.is("cast")) body.innerHTML = '<div class="empty-note">' + esc((err && err.message) || _t("Couldn’t load the voices")) + '</div>';
    });
  }
  /* the device section: per character a device voice (or the dialogue voice) and a pitch; changes persist
     and apply on the next unit read */
  function deviceOptions(S, selected){
    var groups = { f: [], m: [], "": [] };
    S.sortedVoices().forEach(function(v){ groups[S.voiceGender(v)].push(v); });
    return '<option value=""' + (selected ? '' : ' selected') + '>' + esc(_t("Dialogue voice")) + '</option>' +
      [["f", "Women"], ["m", "Men"], ["", "Other"]].map(function(g){
        if (!groups[g[0]].length) return "";
        return '<optgroup label="' + esc(_t(g[1])) + '">' + groups[g[0]].map(function(v){
          var id = S.voiceId(v);
          return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(S.shortName(v)) + (v.lang ? " · " + esc(v.lang) : "") + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
  }
  function renderDeviceCast(body, foot){
    var S = window.llSpeak;
    if (!S){ body.innerHTML = '<div class="empty-note">' + esc(_t("Read aloud isn’t available in this browser.")) + '</div>'; return; }
    if (Speak && Speak.cast && !Speak.cast()){
      body.innerHTML = '<div class="empty-note">' + esc(_t("Turn on “A voice per character” in Read-aloud voices first.")) + '</div>';
      return;
    }
    body.innerHTML = '<div class="empty-note">' + esc(_t("Finding who speaks…")) + '</div>';
    whoButton(foot);
    devicePlan().then(function(pl){
      if (!Side.is("cast")) return;
      var narr = S.currentVoice(), vp = { kind: "device", pl: pl, S: S };
      var h = '<div class="cast-row"><div class="cast-who"><b>' + esc(_t("Narrator")) + '</b><span>' + esc(_t("everything outside the quotes")) + '</span></div>' +
              '<span class="cast-name">' + esc(narr ? S.shortName(narr) : _t("Default voice")) + '</span></div>';
      pl.cast.forEach(function(c){
        var d = pl.rec.device[c.key] || null, vid = d ? d.voice : "", pitch = d && d.voice ? (+d.pitch || 1) : 1;
        h += '<div class="cast-row cast-dev"><div class="cast-who"><b>' + esc(shownName(c)) + '</b><span>' + esc(who(c)) + '</span></div>' + voiceSelect(vp, c) +
             '<label class="cast-pitch"><span>' + esc(_t("Pitch")) + '</span><input type="range" min="0.7" max="1.3" step="0.05" value="' + pitch + '" data-pitch="' + esc(c.key) + '" aria-label="' + esc(_t("Pitch for {name}", { name: shownName(c) })) + '"' + (vid ? '' : ' disabled') + '><span class="val">' + fix2(pitch) + '</span></label></div>';
      });
      if (!pl.cast.length) h += '<div class="empty-note">' + esc(_t("No dialogue found — the narrator reads everything.")) + '</div>';
      else h += '<div class="cast-note">' + esc(_t("Speakers are worked out on this device from the quoted lines, speech tags (“said Anna”, “he whispered”), who acts beside a line and who takes turns; the unnamed ones get voices of their own too. A change applies from the next sentence.")) + '</div>';
      var wrap = document.createElement("div");
      wrap.innerHTML = h;
      body.innerHTML = ""; body.appendChild(wrap);
      focusBack(wrap);
      function saveRow(key, voice, pitch){ voicePicked(vp, key, voice, pitch); }
      wrap.addEventListener("change", function(e){
        var sel = e.target.closest("select[data-key]"); if (!sel) return;
        var row = sel.closest(".cast-row"), range = row.querySelector("input[data-pitch]"), v = sel.value;
        range.disabled = !v;
        if (!v) range.value = "1";
        row.querySelector(".val").textContent = fix2(+range.value);
        saveRow(sel.dataset.key, v, +range.value || 1);
      });
      wrap.addEventListener("input", function(e){
        var range = e.target.closest("input[data-pitch]"); if (!range) return;
        var row = range.closest(".cast-row"), sel = row.querySelector("select[data-key]");
        row.querySelector(".val").textContent = fix2(+range.value);
        saveRow(range.dataset.pitch, sel.value, +range.value || 1);
      });
    }, function(err){
      if (Side.is("cast")) body.innerHTML = '<div class="empty-note">' + esc((err && err.message) || _t("Couldn’t work out who speaks")) + '</div>';
    });
  }
  /* ---- a character's voice select, the same in the Cast panel and in Who's who. vp: { kind: "plan", pl } (ElevenLabs,
     natural voices) or { kind: "device", pl, S } (the device's voices; "" is the dialogue voice) ---- */
  function voiceSelect(vp, c){
    var pl = vp.pl, cur;
    if (vp.kind === "device"){ var d = pl.rec.device[c.key] || null; cur = d ? d.voice : ""; }
    else cur = pl.rec[pl.src.castKey][c.key] || "";
    return '<select class="sel" data-key="' + esc(c.key) + '" aria-label="' + esc(_t("Voice for {name}", { name: shownName(c) })) + '">' +
           (vp.kind === "device" ? deviceOptions(vp.S, cur) : pl.src.options(pl.list, cur || pl.narrator)) + '</select>';
  }
  /* the reader chose a voice (and, on the device, a pitch) for a character: kept for this document, and never
     given up for another when it is also the narrator's */
  function voicePicked(vp, key, voice, pitch){
    var pl = vp.pl, ck = vp.kind === "device" ? "device" : pl.src.castKey;
    if (!pl.rec.picked) pl.rec.picked = {};
    if (!pl.rec.picked[ck]) pl.rec.picked[ck] = {};
    pl.rec.picked[ck][key] = 1;
    if (vp.kind === "device"){
      var old = pl.rec.device[key];
      pl.rec.device[key] = { voice: voice, pitch: voice ? (pitch !== undefined ? pitch : (old && +old.pitch) || 1) : 1 };
    } else pl.rec[ck][key] = voice;
    pl.rec.updated = Date.now(); saveCast(pl.rec);
    if (vp.kind !== "device" && plan === pl) replan();
  }
  function whoButton(foot){
    if (!foot) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.id = "castWhoBtn"; b.textContent = _t("Who’s who…");
    b.addEventListener("click", openWho);
    foot.appendChild(b);
  }

  /* ============================================================
     6b. Who's who — the characters of the open document: name, gender, lines, mentions and where they first
         appear, their lines to jump to, and (when read aloud gives characters voices) the voice of each
     ============================================================ */
  /* pure: attribute()'s output and the units → the characters, most present first. Unnamed voices (he, she,
     another voice) are left out; "The stranger" stays. [{ key, name, gender, lines, mentions, aka, first,
     firstAt: { start, page, where }, quotes: [{ start, page, text, where }] }] */
  function whoList(a, units){
    var secs = (a && a.sections) || [], out = [], byKey = {};
    function where(ui){
      var lo = 0, hi = secs.length - 1, best = -1, mid;
      while (lo <= hi){ mid = (lo + hi) >> 1; if (secs[mid].unit <= ui){ best = mid; lo = mid + 1; } else hi = mid - 1; }
      var u = units[ui] || {};
      if (best >= 0) return u.page ? _t("{section} · page {n}", { section: secs[best].title, n: u.page }) : secs[best].title;
      return u.page ? _t("Page {n}", { n: u.page }) : "";
    }
    ((a && a.cast) || []).forEach(function(c){
      if (c.anon) return;
      var x = { key: c.key, name: c.name, gender: c.gender, lines: c.lines, mentions: c.mentions || 0, aka: c.aka || [], first: c.first, quotes: [] };
      byKey[c.key] = x; out.push(x);
    });
    ((a && a.quotes) || []).forEach(function(q){
      var x = byKey[q.role]; if (!x) return;
      var u = units[q.unit] || {};
      if (x.first < 0 || q.unit < x.first) x.first = q.unit;
      x.quotes.push({ start: q.start, page: u.page || 0, text: q.text, where: where(q.unit) });
    });
    out.forEach(function(x){
      var u = units[x.first] || {};
      x.firstAt = x.first >= 0 ? { start: u.start || 0, page: u.page || 0, where: where(x.first) } : null;
    });
    out.sort(function(p, q){ return (q.lines + q.mentions) - (p.lines + p.mentions) || p.name.localeCompare(q.name); });
    return out;
  }
  function trimLine(t){ t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 42 ? t.slice(0, 40).replace(/\s+\S*$/, "") + "…" : t; }
  function genderWord(g){ return g === "male" ? _t("man") : g === "female" ? _t("woman") : ""; }
  var whoCache = null, whoOpen = {}, whoSeq = 0, whoFocus = null;
  var MAX_WHO_PAGES = 600;
  /* the units to look at: a text document's all; a PDF's pages loaded so far (up to the page being read, and
     what read aloud has loaded) */
  function whoUnits(live){
    var docId = (Library && Library.currentId && Library.currentId()) || "";
    if (state && state.mode === "doc"){
      if (!(Speak && Speak.buildDocUnits)) return Promise.reject(new Error(_t("Couldn’t read this document")));
      return Promise.resolve({ docId: docId, key: docId + ":doc", units: Speak.buildDocUnits(), pdf: false });
    }
    var PdfText = LL.PdfText, S = window.llSpeak;
    if (!(state && state.mode === "pdf" && state.pdfDoc && PdfText && S && S.plan)) return Promise.reject(new Error(_t("Open a book first.")));
    var doc = state.pdfDoc, upto = (Library.currentPdfPage && Library.currentPdfPage()) || 1, read = Speak && Speak.units ? Speak.units() : [];
    if (Speak && Speak.isActive && Speak.isActive() && Speak.context && Speak.context() && Speak.context().docId === docId){
      for (var r = 0; r < read.length; r++) if ((read[r].page || 0) > upto) upto = read[r].page;
    }
    upto = Math.min(upto, doc.numPages || upto, MAX_WHO_PAGES);
    var key = docId + ":pdf:" + upto;
    if (whoCache && whoCache.key === key) return Promise.resolve(whoCache.src);
    var units = [], pg = 1;
    return new Promise(function(res, rej){
      (function next(){
        if (!live() || state.pdfDoc !== doc){ rej(new Error("gone")); return; }
        if (pg > upto){ res({ docId: docId, key: key, units: units, pdf: true, upto: upto, of: doc.numPages }); return; }
        whoStatus(_t("Reading page {n} of {total}…", { n: pg, total: upto }));
        PdfText.get(pg).then(function(t){
          var add = S.plan(t), p0 = pg;
          add.forEach(function(u){ u.page = p0; });
          units = units.concat(add); pg++;
          setTimeout(next, 0);
        }, function(){ pg++; setTimeout(next, 0); });
      })();
    });
  }
  function whoStatus(t){ var el = document.getElementById("whoStatus"); if (el && el.textContent !== t) el.textContent = t; }
  /* read aloud gives characters voices: the device's with "A voice per character" on, ElevenLabs with a key, natural voices */
  function voicesOn(){
    var e = speakEngine();
    if (e === "device") return !!(window.llSpeak && Speak && Speak.cast && Speak.cast());
    if (e === "eleven") return !!apiKey();
    return e === "kokoro" || e === "piper";
  }
  /* the plan whose record holds the voices (null when there is none to be had: a PDF not read aloud yet) */
  function whoVoices(){
    if (!voicesOn()) return Promise.resolve(null);
    var e = speakEngine(), S = window.llSpeak;
    var p = e === "device" ? devicePlan().then(function(pl){ return { kind: "device", pl: pl, S: S }; })
                           : castPlan(e === "kokoro" || e === "piper" ? SRC[e] : SRC.eleven).then(function(pl){ return { kind: "plan", pl: pl }; });
    return p.catch(function(){ return null; });
  }
  function openWho(){ if (Side && Side.open) Side.open("who", _t("Who’s who"), renderWho, function(){ whoSeq++; }); }
  function refreshWho(){
    if (!(Side && Side.is && Side.is("who") && Side.refresh)) return;
    var act = document.activeElement;
    whoFocus = act && Side.body && Side.body.contains(act) && act.closest && act.closest("[data-who]") ? { key: act.closest("[data-who]").getAttribute("data-who"), cls: act.className.split(" ")[0] } : null;
    Side.refresh("who", renderWho);
  }
  function whoJump(start, page){
    if (state && state.mode === "pdf"){ if (page && LL.Toc && LL.Toc.goPdfPage) LL.Toc.goPdfPage(page); }
    else if (LL.revealOffset) LL.revealOffset(start, { center: true });
    if (window.innerWidth <= 560 && Side && Side.close) Side.close();
  }
  function renderWho(body, foot){
    if (!state || (state.mode !== "doc" && state.mode !== "pdf")){ body.innerHTML = '<div class="empty-note">' + esc(_t("Open a book first.")) + '</div>'; return; }
    var my = ++whoSeq;
    function live(){ return my === whoSeq && Side.is("who"); }
    body.innerHTML = '<div class="find-status" id="whoStatus" aria-live="polite">' + esc(_t("Finding who speaks…")) + '</div><div id="whoList"></div>';
    if (voicesOn()){
      var cb = document.createElement("button");
      cb.type = "button"; cb.className = "chip"; cb.id = "whoCastBtn"; cb.textContent = _t("Voices for characters…");
      cb.addEventListener("click", openCast);
      foot.appendChild(cb);
    }
    whoUnits(live).then(function(src){
      if (!live()) return null;
      return new Promise(function(res){
        /* let the panel paint first: a long book takes a moment */
        setTimeout(function(){
          if (!live()){ res(null); return; }
          /* the plan whose voices are shown has already worked out who speaks in this text: its answer is used rather
             than going through the whole book a second time */
          whoVoices().then(function(vp){
            if (!live()){ res(null); return; }
            var pl = vp && vp.pl, pa = pl && pl.a && !src.pdf && pl.docId === src.docId && pl.a.units && pl.a.units.length === src.units.length ? pl.a : null;
            var list = whoCache && whoCache.key === src.key ? whoCache.list : whoList(pa || attribute(src.units), src.units);
            whoCache = { key: src.key, src: src, list: list };
            res({ src: src, list: list, vp: vp });
          });
        }, 30);
      });
    }).then(function(r){
      if (!r || !live()) return;
      drawWho(r.src, r.list, r.vp);
    }, function(err){
      if (!live() || (err && err.message === "gone")) return;
      whoStatus("");
      var l = document.getElementById("whoList");
      if (l) l.innerHTML = '<div class="empty-note">' + esc((err && err.message) || _t("Couldn’t read this document")) + '</div>';
    });
  }
  function drawWho(src, list, vp){
    var box = document.getElementById("whoList");
    if (!box) return;
    if (!list.length){
      whoStatus("");
      /* an empty state (app.css .empty-state): the people icon, a title, one sentence */
      box.innerHTML = '<div class="empty-note empty-state"><span class="es-icon" aria-hidden="true"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.3a3 3 0 0 1 0 5.4"/><path d="M17 14.3a5.5 5.5 0 0 1 3.5 5.7"/></svg></span>' +
        '<div class="es-title">' + esc(_t("No characters yet")) + '</div><p class="es-text">' + esc(_t("No speaking characters found in this document.")) + '</p></div>';
      return;
    }
    var chars = _tn(list.length, "{n} character", "{n} characters");
    whoStatus(!src.pdf ? chars : src.of > src.upto ? _t("{chars} · pages 1–{upto} of {of} (the pages loaded so far)", { chars: chars, upto: src.upto, of: src.of })
                                                    : _t("{chars} · pages 1–{upto}", { chars: chars, upto: src.upto }));
    var h = "", ql = bookLang();
    list.forEach(function(x, n){
      /* "woman · 12 lines · mentioned 30 times": phrases of their own, joined by " · " */
      var meta = [genderWord(x.gender), linesOf(x.lines), _tn(x.mentions, "mentioned {n} time", "mentioned {n} times")].filter(Boolean).join(" · ");
      var id = "who-lines-" + n, open = !!whoOpen[x.key];
      h += '<div class="who-item cast-row" data-who="' + esc(x.key) + '">' +
             '<button type="button" class="who-head" aria-expanded="' + open + '" aria-controls="' + id + '">' +
               '<b>' + esc(x.name) + '</b>' +
               '<span>' + esc(meta) + '</span>' +
               (x.firstAt && x.firstAt.where ? '<span>' + esc(_t("First appears: {where}", { where: x.firstAt.where })) + '</span>' : '') +
               (x.aka.length ? '<span>' + esc(_t("Also: {names}", { names: x.aka.slice(0, 3).join(", ") })) + '</span>' : '') +
             '</button>' +
             (vp ? voiceSelect(vp, x) : '') +
             '<div class="who-lines" id="' + id + '"' + (open ? '' : ' hidden') + '>' + (open ? whoLines(x, false, ql) : '') + '</div>' +
           '</div>';
    });
    if (!vp && voicesOn()) h += '<div class="cast-note">' + esc(_t("Start reading aloud to choose a voice for each character.")) + '</div>';
    h += '<div class="cast-note">' + esc(_t("Worked out on this device from the quoted lines, speech tags, who acts beside a line and who takes turns; it can be wrong now and then.")) + '</div>';
    box.innerHTML = h;
    box.onclick = function(e){
      var head = e.target.closest(".who-head"), jump = e.target.closest("[data-start]");
      if (head){
        var item = head.closest(".who-item"), key = item.getAttribute("data-who"), panel = item.querySelector(".who-lines"), on = head.getAttribute("aria-expanded") !== "true", x = null;
        for (var i = 0; i < list.length; i++) if (list[i].key === key) x = list[i];
        whoOpen[key] = on;
        head.setAttribute("aria-expanded", on ? "true" : "false");
        if (on && !panel.innerHTML && x) panel.innerHTML = whoLines(x, false, ql);
        panel.hidden = !on;
        return;
      }
      if (jump){
        if (jump.hasAttribute("data-more")){
          var it = jump.closest(".who-item"), k2 = it.getAttribute("data-who");
          for (var j = 0; j < list.length; j++) if (list[j].key === k2){ it.querySelector(".who-lines").innerHTML = whoLines(list[j], true, ql); break; }
          var nextBtn = it.querySelectorAll(".who-line")[100]; if (nextBtn) nextBtn.focus();
          return;
        }
        whoJump(+jump.getAttribute("data-start") || 0, +jump.getAttribute("data-page") || 0);
      }
    };
    box.onchange = function(e){
      var sel = e.target.closest("select[data-key]");
      if (!sel || !vp || (vp.kind !== "device" && !sel.value)) return;
      voicePicked(vp, sel.getAttribute("data-key"), sel.value);
    };
    if (whoFocus){
      var row = box.querySelector('[data-who="' + (window.CSS && CSS.escape ? CSS.escape(whoFocus.key) : whoFocus.key) + '"]');
      var back = row ? row.querySelector("." + (whoFocus.cls || "who-head")) || row.querySelector(".who-head") : null;
      whoFocus = null;
      if (back) back.focus({ preventScroll: true });
    }
  }
  /* a character's lines to jump to (the first hundred, or all) and where they first appear; lang: the book's, for the quotes */
  function whoLines(x, all, lang){
    var n = all ? x.quotes.length : Math.min(100, x.quotes.length), h = "";
    if (x.firstAt) h += '<button type="button" class="chip who-first" data-start="' + x.firstAt.start + '" data-page="' + x.firstAt.page + '">' + esc(x.firstAt.where ? _t("First appearance · {where}", { where: x.firstAt.where }) : _t("First appearance")) + '</button>';
    for (var i = 0; i < n; i++){
      var q = x.quotes[i];
      h += '<button type="button" class="find-item who-line" data-start="' + q.start + '" data-page="' + q.page + '">' +
           (q.where ? '<span class="find-where">' + esc(q.where) + '</span>' : '') + '<span lang="' + esc(lang || "en") + '">“' + esc(trimLine(q.text)) + '”</span></button>';
    }
    if (n < x.quotes.length) h += '<button type="button" class="chip who-more" data-start="0" data-more="1">' + esc(_t("Show all {n} lines", { n: x.quotes.length })) + '</button>';
    return h;
  }
  if (typeof document !== "undefined") document.addEventListener("ll:fileopened", function(){ whoCache = null; whoOpen = {}; if (Side && Side.is && Side.is("who")) Side.close(); });

  /* ============================================================
     7. The engines, registered with Speak
     ============================================================ */
  var engine = {
    label: _t("ElevenLabs narration"),
    supported: supported, ready: ready, prepare: prepare, speak: speak, cancel: cancel, stop: stop,
    setRate: setRate, fillVoices: fillVoices, voiceChanged: voiceChanged, narratorName: narratorName, syncSettings: syncSettings
  };
  if (Speak && Speak.registerEngine) Speak.registerEngine("eleven", engine);
  /* natural voices, Fast (Piper) and Best (Kokoro): the same clip player, fed by the model's worker; the model loads
     (or downloads, with its progress in the bar) while the cast is worked out, and the first sentence waits for both */
  function natEngine(m){
    var src = SRC[m.key];
    m.engine = {
      label: _t("Natural voices"),
      supported: function(){ return supported() && !!(window.Worker && window.WebAssembly && window.caches); },
      ready: function(){ return natReady(m); },
      prepare: function(units, ctx){
        if (!natHeld(m)) setStatus(_t("Preparing…"));
        var l = natLoad(m); l.catch(function(){});
        return planFor(src, units, ctx).then(function(){ feedKick(); return l; });
      },
      speak: speak, cancel: cancel, stop: stop, setRate: setRate,
      fillVoices: function(sel){ natFillVoices(m, sel); }, voiceChanged: function(id){ natVoiceChanged(m, id); },
      narratorName: function(){ return natName(m, natNarrator(m)); }, syncSettings: natSync
    };
    return m.engine;
  }
  var kEngine = natEngine(NAT.kokoro), pEngine = natEngine(NAT.piper);
  if (Speak && Speak.registerEngine){ Speak.registerEngine("kokoro", kEngine); Speak.registerEngine("piper", pEngine); }
  function natStateOf(m){
    return { ready: m.ready, loading: !!m.load, pct: m.pct, threads: m.threads, worker: !!m.w, jobs: Object.keys(m.jobs).length, lang: m.loaded, pack: natPack(m).lang || "",
             rtf: rtf(m), cps: cps(m), feeding: feed.busy, preparing: feed.prep, holding: !!hold };
  }

  window.llAudiobook = { attribute: attribute, castDevice: castDevice, deviceCast: deviceCast, engine: engine, openCast: openCast, askForKey: askForKey,
                         openWho: openWho, whoList: whoList,
                         voices: voices, setModel: setModel, syncSettings: syncSettings, sent: function(){ return sent; }, plan: function(){ return plan; },
                         devicePlan: function(){ return devPlan; },
                         kokoro: kEngine, kokoroVoices: KOKORO_VOICES, kokoroPool: kokoroPool,
                         downloadKokoro: function(){ natDownload(NAT.kokoro); }, removeKokoro: function(){ return natRemove(NAT.kokoro); },
                         kokoroOnDevice: function(){ return natOnDevice(NAT.kokoro); }, kokoroState: function(){ return natStateOf(NAT.kokoro); },
                         piper: pEngine, piperVoices: PIPER_VOICES, piperDefault: PIPER_DEFAULT, piperPool: piperPool,
                         piperVoicesNl: PIPER_VOICES_NL, piperDefaultNl: PIPER_NL_DEFAULT, piperPacks: PIPER_PACKS,
                         /* the open document's pack (English, or Dutch for a Dutch book); Remove from the Storage panel takes every pack */
                         downloadPiper: function(){ natDownload(NAT.piper); }, removePiper: function(){ return natRemove(NAT.piper, true); },
                         piperOnDevice: function(lang){ return natOnDevice(NAT.piper, PIPER_PACKS[lang] || null); }, piperState: function(){ return natStateOf(NAT.piper); },
                         /* the Download / Remove buttons of the chosen quality */
                         downloadNatural: function(){ natDownload(natCur()); }, removeNatural: function(){ natRemove(natCur()); },
                         naturalModel: function(){ return natCur().key; },
                         holdFor: holdFor, feed: feedKick, prepareBook: prepareBook,
                         /* Speak's engine changed: a natural-voices worker no longer chosen is let go once idle */
                         engineChanged: function(){ natIdle(1000); },
                         clearAudio: clearAudio, audioTotal: audioTotal, trimAudio: trimAudio, wavBlob: wavBlob, assignVoices: assignVoices };
})();
