/* lamplight — the interface's language: English (the source) or Dutch (see LL_I18N) */
/* ============================================================
   Lamplight — interface language
   window.LL_I18N, loaded by index.html right before app.js.

   The English text in the code is the key: t("Read aloud") gives "Voorlezen" while the
   interface is Dutch and "Read aloud" otherwise, so English needs no table and a string
   that has no Dutch yet simply stays English. One plain object lookup per call.

   Setting: localStorage "ll_ui_lang" = "auto" (the default: Dutch when navigator.language
   starts with "nl", else English) | "nl" | "en". Chosen in Settings › Reading › App language
   (UiLang in app.js), which reloads the page and reopens the book at the same place.

   API (all ES5, safe to call before the DOM is complete)
     t(en, vars)            (app.js: _t) the Dutch for `en` when the interface is Dutch, else `en`;
                            {name} placeholders are filled from vars: t("{n} min left", { n: 12 })
     tn(n, one, other, vars) plural: tn(3, "1 book", "{n} books") → "3 boeken"; {n} is n
                            unless vars.n says otherwise (pass vars.n = num(x) for 1.234 style)
     tc(ctx, en, vars)      the same as t, for a word whose Dutch depends on where it stands:
                            looks up NL[ctx + "|" + en] first, then NL[en]
     lang()                 "nl" or "en", the language in use
     setting()              "auto", "nl" or "en", as chosen
     setLang(v)             stores the choice, switches <html lang> and the static markup;
                            true when the language in use changed (app.js then reloads)
     locale()               the BCP-47 locale for Intl: "nl-NL" (or the device's nl-BE …),
                            else the device's English locale, else "en-GB"
     num(n, opts)           Intl.NumberFormat in locale(): 1,5 in Dutch, 1.5 in English
     date(d, opts)          toLocaleDateString(locale(), opts || day month year): "29 sep 2026"
     time(d, opts)          toLocaleTimeString(locale(), opts || hours:minutes)
     dateTime(d, opts)      toLocaleString(locale(), opts)
     rel(v, unit, opts)     Intl.RelativeTimeFormat: rel(-3, "hour") → "3 uur geleden" / "3 hours ago"
     ago(when, now)         a timestamp as "just now", "5 minutes ago", "3 hours ago", "2 days ago",
                            or a date past a month (Dutch: "zojuist", "5 minuten geleden", …)
     list(arr, type)        Intl.ListFormat: "a, b and c" / "a, b en c" (type "disjunction": or / of)
     apply(root)            translates markup under root (default: the document) marked with
                            data-i18n (the element's own text nodes, each one a key; a value on the
                            attribute is a context for tc) and data-i18n-attr="aria-label title
                            placeholder alt" (those attributes' values as keys). Runs once when this
                            file loads; call it on markup built later from templates.
     NL                     the Dutch table: { "English source": "Nederlands" }
     missing()              keys asked for that have no Dutch (collected while debugging)
     scan(root)             visible text and labels under root that are not Dutch from the table
                            (book text, #doc and #pdf, is skipped): a coverage check to run in Dutch
     check()                the table's own mistakes: placeholders missing or extra in the Dutch

   Debugging: localStorage "ll_i18n_debug" = "1" logs every key without Dutch, once, as
   "[i18n] no Dutch for: …" (in English too, so gaps show without switching), and keeps them
   for missing().

   In app.js: _t(), _tn(), _tc() and I18N (set up at its top; named _t because t is a common
   local name there). In the other scripts (audiobook.js, translate.js, sounds.js, explain.js,
   morph.js) the same names, at the top of their function:
     var I18N = (typeof window !== "undefined" && window.LL_I18N) || null;
     function _t(s, v){ return I18N ? I18N.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, function(m, k){ return k in v ? v[k] : m; }) : s); }
     function _tn(n, one, other, v){ var o = { n: n }; for (var k in v || {}) o[k] = v[k]; return _t(Number(n) === 1 ? one : other, o); }
   explain.js and morph.js also run under node in the tests, where there is no LL_I18N: their
   output must stay the English it is there (better still, translate their labels where app.js
   draws them).

   Rules for the keys: the exact English string as the code has it (typographic quotes and
   dashes included); a whole sentence with {placeholders}, never pieces glued together, so the
   Dutch can put the words in its own order; markup keys have their runs of spaces, tabs and
   newlines folded to one space (a no-break space is kept) and are trimmed.

   ------------------------------------------------------------
   GLOSSARY — the Dutch for every recurring concept (follow it exactly)
   ------------------------------------------------------------
   Style: informal "je" / "jouw" (never "u"); short and plain; sentence case (only the first
   word and names capitalised, also in headings, buttons and menu items); a button or menu item
   that does something is an infinitive at the end ("Bestand openen", "Boek vertalen",
   "Notities exporteren"); a tab, section or switch is a noun ("Inhoud", "Extra dimmen");
   "…" stays wherever the English has it; typographic apostrophe ’ (pagina’s, thema’s, ’s nachts)
   and quotes “…” as in the English; numbers with a decimal comma through num() (1,5×); the
   time 24-hour (Intl does it); keep buttons on a 390px phone short (about 18 characters).
   Not translated: Lamplight, book text, file names, dictionary definitions, voice names,
   ElevenLabs, Piper, Kokoro, format names (PDF, EPUB, DOCX, TXT, Markdown, HTML), language names
   in the language chip (Nederlands, English), keyboard keys (Esc, Enter, ← →; "Space" → "Spatie").

   library ................ bibliotheek (Library → Bibliotheek; Clear library… → Bibliotheek wissen…)
   recent / pinned ........ recent / vastgezet (Recent files → Recente bestanden; Pin → Vastzetten)
   book / document / file . boek / document / bestand
   open (a file) .......... openen (Open → Openen; Open a file → Bestand openen)
   continue reading ....... verder lezen (Up next → Hierna)
   finished (a book) ...... uitgelezen (Finished → Uitgelezen)
   reading journal ........ leesdagboek
   read aloud ............. voorlezen (Stop reading aloud → Voorlezen stoppen)
   voice / voices ......... stem / stemmen
   device voices .......... stemmen van je apparaat
   natural voices ......... natuurlijke stemmen; Fast → Snel, Best → Beste
                            ("Natural voices (Fast)" → "Natuurlijke stemmen (Snel)")
   narrator ............... verteller
   character(s) ........... personage(s) (A voice per character → Een stem per personage)
   Who's who .............. Wie is wie
   sleep timer ............ slaaptimer (Stop after → Stoppen na)
   reading speed (voice) .. leestempo; Speed → Tempo
   prepare book ........... boek voorbereiden (the natural voices making the audio ahead)
   download / remove ...... downloaden / verwijderen (Remove from this device → Van dit apparaat verwijderen)
   background sounds ...... achtergrondgeluiden (rain → regen, fire → haardvuur, café → café,
                            forest night → bos bij nacht, waves → golven; volume → volume)
   Previously… (recap) .... Wat voorafging… (a recap → een terugblik)
   speed reading .......... snellezen (words per minute → woorden per minuut, wpm → w/min)
   focus reading .......... focuslezen
   auto-scroll ............ automatisch scrollen
   reading ruler .......... leesliniaal
   extra dim .............. extra dimmen (Dim → Dimmen; Only at night → Alleen ’s nachts)
   warmth ................. warmte (Warm at night → Alleen ’s nachts warm)
   e-ink mode ............. e-inkmodus
   flow ................... weergave: Pages → Pagina’s, Scroll → Scrollen (pages flow →
                            paginaweergave, scroll flow → scrollweergave; Reading flow → Leesweergave)
   page / sentence ........ pagina / zin (Previous page → Vorige pagina, Next sentence → Volgende zin)
   contents ............... inhoud (table of contents → inhoudsopgave; chapter → hoofdstuk)
   search ................. zoeken (Search in the document → Zoeken in het document)
   highlight(s) ........... markering(en); to highlight → markeren
   note(s) ................ notitie(s)
   bookmark(s) ............ bladwijzer(s)
   highlights, notes and bookmarks together ... aantekeningen
   theme / themes ......... thema / thema’s (Day → Dag, Night → Nacht, Light → Licht, Dark → Donker,
                            High contrast → Hoog contrast, Custom → Eigen, Auto → Automatisch,
                            Manual → Handmatig, Follow system → Systeem volgen, By time → Op tijd)
   colours ................ Background → Achtergrond, Accent → Accentkleur, Panel → Paneel,
                            Secondary text → Secundaire tekst, colour → kleur
   type (text settings) ... tekst (Text settings → Tekstinstellingen; font → lettertype; Size →
                            Grootte, Spacing → Regelafstand, Width → Breedte, Weight → Dikte,
                            Letters → Letters, Words → Woorden, Paragraphs → Alinea’s, Margins → Marges,
                            Justify → Uitvullen, Hyphenate → Woorden afbreken)
   dictionary ............. woordenboek (meaning → betekenis)
   explain ................ uitleggen (the tab: Uitleg)
   simplify ............... vereenvoudigen (the tab Simpler → Eenvoudiger)
   translate .............. vertalen; translation → vertaling (Translate book → Boek vertalen,
                            Translation only → Alleen vertaling; the Dutch ↔ English pack → het
                            pakket Nederlands ↔ Engels)
   word parts ............. woorddelen (prefix → voorvoegsel, root → stam, suffix → achtervoegsel,
                            base word → basiswoord)
   reading stats .......... leesstatistieken (Stats → Statistieken; session → leessessie)
   streak ................. reeks ("5-day streak" → "5 dagen op rij")
   goal ................... doel (Daily goal → Dagdoel)
   zen mode ............... zenmodus
   print .................. afdrukken
   storage ................ opslag (on this device → op dit apparaat)
   tabs ................... tabbladen (Open documents → Geopende documenten)
   settings ............... instellingen; More → Meer; Close → Sluiten; Undo → Ongedaan maken;
                            Cancel → Annuleren; Done → Klaar; Save → Opslaan; Delete → Verwijderen;
                            Rename → Naam wijzigen; Reset → Herstellen; Copy → Kopiëren; Copied → Gekopieerd;
                            Got it → Begrepen; Reload → Opnieuw laden; Export → Exporteren
   keyboard shortcuts ..... sneltoetsen
   time ................... "12 min left" → "nog 12 min"; "3 hours ago" → "3 uur geleden";
                            just now → zojuist; yesterday → gisteren; min / h → min / u
   ============================================================ */
(function(){
  "use strict";
  var KEY = "ll_ui_lang", DEBUG_KEY = "ll_i18n_debug";
  var HAS_WIN = typeof window !== "undefined", HAS_DOC = typeof document !== "undefined";
  function get(k){ try { return localStorage.getItem(k); } catch(_){ return null; } }
  function put(k, v){ try { localStorage.setItem(k, v); } catch(_){} }
  function nav(){ return HAS_WIN && window.navigator ? String(navigator.language || (navigator.languages && navigator.languages[0]) || "") : ""; }

  /* ---------- the Dutch table ----------
     One section per part of the conversion; each adds its own entries with add(). A key added
     twice keeps the later Dutch (the debug log says so when the two differ). */
  var NL = {};
  function add(o){
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)){
      if (debug && typeof NL[k] === "string" && NL[k] !== o[k] && HAS_WIN && window.console) console.warn("[i18n] two Dutch for: " + k + " → " + NL[k] + " | " + o[k]);
      NL[k] = o[k];
    }
  }
  var debug = get(DEBUG_KEY) === "1";

  /* ==== 1. index.html: the static markup, the language row, the drop label ==== */
  add({
    "Skip to the document": "Naar het document",
    "Reading progress": "Leesvoortgang",
    "lamplight — library": "lamplight — bibliotheek",
    "Library": "Bibliotheek",
    "Search in the document": "Zoeken in het document",
    "Contents": "Inhoud",
    "Read aloud": "Voorlezen",
    "Text settings": "Tekstinstellingen",
    "Close text settings": "Tekstinstellingen sluiten",
    "Line spacing": "Regelafstand",
    "Tight": "Krap",
    "Normal": "Normaal",
    "Airy": "Ruim",
    "Narrow": "Smal",
    "Wide": "Breed",
    "Custom {v}": "Aangepast {v}",
    "type|Custom": "Aangepast",
    "All fonts": "Alle lettertypen",
    "Reading controls": "Leesbediening",
    "Back to library": "Terug naar de bibliotheek",
    "Position in book": "Positie in het boek",
    "Page {n} of {m}": "Pagina {n} van {m}",
    "{p}% through the book": "{p}% van het boek gelezen",
    "Under a minute left in chapter": "Nog geen minuut in dit hoofdstuk",
    "{n} min left in chapter": "Nog {n} min in dit hoofdstuk",
    "{h} h {m} min left in chapter": "Nog {h} u {m} min in dit hoofdstuk",
    "{h} h left in chapter": "Nog {h} u in dit hoofdstuk",
    "Fine-tune": "Fijnafstelling",
    "Weight, letter and word spacing, focus reading": "Gewicht, letter- en woordafstand, focuslezen",
    "Theme": "Thema",
    "More actions": "Meer acties",
    "More": "Meer",
    "Open": "Openen",
    "Open documents": "Geopende documenten",
    "Text": "Tekst",
    "Size": "Grootte",
    "Smaller text or zoom out": "Kleinere tekst of uitzoomen",
    "Smaller text / zoom out": "Kleinere tekst / uitzoomen",
    "Larger text or zoom in": "Grotere tekst of inzoomen",
    "Larger text / zoom in": "Grotere tekst / inzoomen",
    "Spacing": "Regelafstand",
    "Width": "Breedte",
    "Weight": "Dikte",
    "This font has two weights.": "Dit lettertype heeft twee diktes.",
    "Letters": "Letters",
    "Words": "Woorden",
    "Focus reading — bold the start of each word": "Focuslezen — het begin van elk woord vet",
    "Font": "Lettertype",
    "Soften pages in dark themes": "Pagina’s zachter in donkere thema’s",
    "Flow": "Weergave",
    "Scroll": "Scrollen",
    "Pages": "Pagina’s",
    "All text settings…": "Alle tekstinstellingen…",
    "Day or night": "Dag of nacht",
    "Day": "Dag",
    "Night": "Nacht",
    "Recent": "Recent",
    "Light": "Licht",
    "Dark": "Donker",
    "High contrast": "Hoog contrast",
    "Auto": "Automatisch",
    "Manual": "Handmatig",
    "System": "Systeem",
    "By time": "Op tijd",
    "Switch by itself": "Vanzelf wisselen",
    "Follow phone": "Volg telefoon",
    "Current": "Huidig",
    "Theme groups": "Themagroepen",
    "Day and night": "Dag en nacht",
    "{name}, current theme": "{name}, huidig thema",
    "Warmth": "Warmte",
    "Warm at night": "Alleen ’s nachts warm",
    "Extra dim": "Extra dimmen",
    "Dim": "Dimmen",
    "Only at night": "Alleen ’s nachts",
    "E-ink mode": "E-inkmodus",
    "All themes and the editor…": "Alle thema’s en de editor…",
    "Reading settings": "Leesinstellingen",
    "Reading": "Lezen",
    "Reading flow": "Leesweergave",
    "Scroll: the bars hide while you read and come back when you scroll up. Pages: tap the left or right edge, or swipe sideways, to turn. Swipe down, or tap the top or bottom edge of the page, to show the bars; swipe up to hide them.":
      "Scrollen: de balken verdwijnen tijdens het lezen en komen terug als je omhoog scrolt. Pagina’s: tik op de linker- of rechterrand of veeg opzij om om te slaan. Veeg omlaag of tik op de boven- of onderrand van de pagina om de balken te tonen; veeg omhoog om ze te verbergen.",
    "Two pages side by side on wide screens": "Twee pagina’s naast elkaar op brede schermen",
    "Keep the screen awake while reading": "Scherm aan laten tijdens het lezen",
    "Pure black on white with nothing moving, for e-paper screens. The Pages flow stays on while it is — tap the left third to go back a page, anywhere else to go on — and highlights are drawn as lines.":
      "Puur zwart op wit, zonder beweging, voor e-paperschermen. Zolang dit aanstaat, blijft de paginaweergave aan — tik op het linkerderde van het scherm om terug te bladeren en ergens anders om verder te bladeren — en markeringen worden als lijnen getekend.",
    "Follow system": "Systeem volgen",
    "Night from": "Nacht van",
    "until": "tot",
    "A warm film over the screen for evening reading. At 0 % nothing is added.": "Een warme gloed over het scherm om ’s avonds te lezen. Bij 0 % wordt er niets toegevoegd.",
    "Darker than your phone's lowest brightness, for reading in bed.": "Donkerder dan de laagste helderheid van je telefoon, om in bed te lezen.",
    "Custom": "Eigen",
    "Rename": "Naam wijzigen",
    "Duplicate": "Dupliceren",
    "Save as new": "Opslaan als nieuw",
    "Delete": "Verwijderen",
    "Background": "Achtergrond",
    "Tint": "Tint",
    "Bright": "Helderheid",
    "Or any colour": "Of een andere kleur",
    "Background hex code": "Hexcode achtergrond",
    "Automatic — always readable": "Automatisch — altijd leesbaar",
    "Text colour": "Tekstkleur",
    "Text hex code": "Hexcode tekst",
    "Accent": "Accentkleur",
    "Accent hex code": "Hexcode accentkleur",
    "Advanced": "Geavanceerd",
    "Panel": "Paneel",
    "The bars, the menu and this sheet.": "De balken, het menu en dit paneel.",
    "Automatic — a shade off the background": "Automatisch — net iets anders dan de achtergrond",
    "Panel colour": "Paneelkleur",
    "Panel hex code": "Hexcode paneel",
    "Secondary text": "Secundaire tekst",
    "Hints, captions and page numbers.": "Toelichtingen, bijschriften en paginanummers.",
    "Automatic — between the text and the background": "Automatisch — tussen de tekst en de achtergrond in",
    "Secondary text colour": "Kleur secundaire tekst",
    "Secondary text hex code": "Hexcode secundaire tekst",
    "Contrast": "Contrast",
    "Text on background": "Tekst op achtergrond",
    "Secondary text on background": "Secundaire tekst op achtergrond",
    "Secondary text on panel": "Secundaire tekst op paneel",
    "Accent on background": "Accentkleur op achtergrond",
    "Accent on panel": "Accentkleur op paneel",
    "Fix contrast": "Contrast verbeteren",
    "Chapter three · 12 min left": "Hoofdstuk drie · nog 12 min",
    "The lamp hums quietly.": "De lamp zoemt zachtjes.",
    "She turns the page anyway": "Ze slaat de bladzijde toch om",
    "— one more chapter, she tells herself,": "— nog één hoofdstuk, zegt ze tegen zichzelf,",
    "just one more": "nog eentje maar",
    "Secondary text looks like this — page 42 of 310.": "Secundaire tekst ziet er zo uit — pagina 42 van 310.",
    "Paragraphs": "Alinea’s",
    "Margins": "Marges",
    "Browse fonts…": "Lettertypen bekijken…",
    "Justify text": "Tekst uitvullen",
    "Hyphenate": "Woorden afbreken",
    "Strength": "Sterkte",
    "Medium": "Gemiddeld",
    "Strong": "Sterk",
    "The first letters of every word in bold, so the eye lands on each word sooner: about a third of the letters (light), half (medium) or two thirds (strong).":
      "De eerste letters van elk woord vet, zodat je oog sneller op elk woord landt: ongeveer een derde van de letters (licht), de helft (gemiddeld) of twee derde (sterk).",
    "Reset text settings": "Tekstinstellingen herstellen",
    "The lamp hums quietly as she turns the page — this is exactly how your book will look.": "De lamp zoemt zachtjes terwijl ze de bladzijde omslaat — precies zo ziet je boek eruit.",
    "Applies to text documents (EPUB, DOCX, TXT, Markdown, HTML).": "Geldt voor tekstdocumenten (EPUB, DOCX, TXT, Markdown, HTML).",
    "Zoom": "Zoom",
    "Soften PDF pages in dark themes": "PDF-pagina’s zachter in donkere thema’s",
    "For PDF documents — these apply once one is open.": "Voor PDF-documenten — dit geldt zodra er een open is.",
    "A quiet place to read.": "Een rustige plek om te lezen.",
    "Drop a file anywhere on this page, or open one below.": "Sleep een bestand naar deze pagina, of open er hieronder een.",
    "Works fully offline — nothing you open leaves your device.": "Werkt helemaal offline — niets wat je opent verlaat je apparaat.",
    "Open a file": "Bestand openen",
    "Supported formats": "Ondersteunde formaten",
    "Tap a word for its meaning and its parts": "Tik op een woord voor de betekenis en de woorddelen",
    "Hold a sentence to explain, simplify or translate it": "Druk lang op een zin om hem uit te leggen, te vereenvoudigen of te vertalen",
    "Press ⋯ for read aloud, stats, zen mode and more": "Tik op ⋯ voor voorlezen, statistieken, zenmodus en meer",
    "While reading, tap the lamp for read aloud, stats, zen mode and more.": "Tik tijdens het lezen op de lamp voor voorlezen, statistieken, zenmodus en meer.",
    "Scroll: tap the lamp for your reading controls. Pages: tap the left or right edge, or swipe sideways, to turn; swipe up or tap the lamp for your reading controls.": "Scrollen: tik op de lamp voor je leesbediening. Pagina’s: tik op de linker- of rechterrand of veeg opzij om om te slaan; veeg omhoog of tik op de lamp voor je leesbediening.",
    "Got it": "Begrepen",
    "Recent files": "Recente bestanden",
    "The books you have finished": "De boeken die je hebt uitgelezen",
    "Reading journal": "Leesdagboek",
    "Open another file": "Ander bestand openen",
    "or drop a file anywhere on this page": "of sleep een bestand naar deze pagina",
    "Remove all files from this device (the reading journal is kept)": "Alle bestanden van dit apparaat verwijderen (het leesdagboek blijft bewaard)",
    "Clear library…": "Bibliotheek wissen…",
    "Auto-scroll": "Automatisch scrollen",
    "Slower": "Langzamer",
    "Faster": "Sneller",
    "Pause": "Pauzeren",
    "Pause / resume": "Pauzeren / hervatten",
    "Stop": "Stoppen",
    "Stop auto-scroll": "Automatisch scrollen stoppen",
    "Voices": "Stemmen",
    "Sleep timer — tap to change": "Slaaptimer — tik om te wijzigen",
    "Previous sentence": "Vorige zin",
    "Play": "Afspelen",
    "Play / pause": "Afspelen / pauzeren",
    "Next sentence": "Volgende zin",
    "Reading speed": "Leestempo",
    "Stop reading": "Voorlezen stoppen",
    "Speed": "Tempo",
    "Speed presets": "Vaste tempo’s",
    "Previous page": "Vorige pagina",
    "Next page": "Volgende pagina",
    "Reading actions": "Leesacties",
    "Close": "Sluiten",
    "Panels": "Panelen",
    /* app.css body.dragging::before, through --ll-drop (set below) */
    "Drop to open": "Loslaten om te openen",
    /* the language row (Settings › Reading) */
    "App language": "Taal van de app",
    "Automatic": "Automatisch",
    "Automatic follows your device’s language. Lamplight restarts in the new language and keeps your place.":
      "Automatisch volgt de taal van je apparaat. Lamplight start opnieuw in de nieuwe taal en je blijft waar je was.",
    /* the helpers below (ago) */
    "just now": "zojuist"
  });

  /* ==== 2. app.js, part A ==== */
  add({
    "theme|Day": "Dag",
    "Sepia": "Sepia",
    "Mist": "Mist",
    "Rose": "Roze",
    "Paper": "Papier",
    "Parchment": "Perkament",
    "Linen": "Linnen",
    "Sage": "Salie",
    "Lavender": "Lavendel",
    "Sky": "Hemel",
    "Peach": "Perzik",
    "Newsprint": "Krant",
    "Mint": "Mint",
    "Dusk": "Schemer",
    "Forest": "Bos",
    "Ocean": "Oceaan",
    "Plum": "Pruim",
    "Ink": "Inkt",
    "Midnight": "Middernacht",
    "Graphite": "Grafiet",
    "Ember": "Sintel",
    "Moss": "Mos",
    "Cocoa": "Cacao",
    "Slate": "Leisteen",
    "Candle": "Kaars",
    "Terminal": "Terminal",
    "Amber": "Amber",
    "Noir": "Noir",
    "theme|Contrast": "Contrast",
    "Contrast dark": "Contrast donker",
    /* the four collections (Settings › Theme and the picker’s Collections tab) */
    "Delft blue": "Delfts blauw",
    "Vermeer": "Vermeer",
    "Rembrandt": "Rembrandt",
    "Tulip field": "Tulpenveld",
    "Polder": "Polder",
    "Canals": "Grachten",
    "Autumn wood": "Herfstbos",
    "Winter morning": "Wintermorgen",
    "Northern lights": "Noorderlicht",
    "Sea air": "Zeelucht",
    "Cherry blossom": "Kersenbloesem",
    "Coffee house": "Koffiehuis",
    "Old library": "Oude bibliotheek",
    "Rainy evening": "Regenavond",
    "Candle cabin": "Kaarsenhut",
    "Night train": "Nachttrein",
    "Handmade paper": "Handgeschept",
    "Book cloth": "Boekenlinnen",
    "Laid paper": "Vergé",
    "Vellum": "Velijn",
    "Collections": "Collecties",
    "theme group|Dutch": "Hollands",
    "Nature and seasons": "Natuur en seizoenen",
    "Cozy": "Gezellig",
    "Textured": "Met textuur",
    "Plain background": "Effen achtergrond",
    "Leaves out the paper or cloth texture of the Textured themes.": "Laat de papier- of stofstructuur van de thema’s met textuur weg.",
    "Light": "Licht",
    "Dark": "Donker",
    "Colour": "Kleur",
    "High contrast": "Hoog contrast",
    "name|Custom": "Eigen thema",
    "My theme": "Mijn thema",
    "Custom {n}": "Eigen thema {n}",
    "Custom": "Eigen",
    "New…": "Nieuw…",
    "New theme": "Nieuw thema",
    "Start a custom theme from the colours on screen": "Begin een eigen thema met de kleuren op het scherm",
    "Background {colour}": "Achtergrond {colour}",
    "Accent {colour}": "Accentkleur {colour}",
    "Low": "Laag",
    "All text is comfortably readable.": "Alle tekst is goed leesbaar.",
    "All text is readable.": "Alle tekst is leesbaar.",
    "text": "tekst",
    "secondary text": "secundaire tekst",
    "accent": "accentkleur",
    "{list} and {last}": "{list} en {last}",
    "the panel": "het paneel",
    "this background": "deze achtergrond",
    "lighter colours": "lichtere kleuren",
    "darker colours": "donkerdere kleuren",
    "a lighter accent": "een lichtere accentkleur",
    "a darker accent": "een donkerdere accentkleur",
    "lighter text": "lichtere tekst",
    "darker text": "donkerdere tekst",
    "lighter secondary text": "lichtere secundaire tekst",
    "darker secondary text": "donkerdere secundaire tekst",
    "{what} is hard to read on {where} — try {fix}.": "{what} is slecht leesbaar op {where} — probeer {fix}.",
    "{what} are hard to read on {where} — try {fix}.": "{what} zijn slecht leesbaar op {where} — probeer {fix}.",
    "It’s night now — using the night theme.": "Het is nu nacht — het nachtthema staat aan.",
    "It’s day now — using the day theme.": "Het is nu dag — het dagthema staat aan.",
    "Follows your device’s light / dark setting.": "Volgt de instelling licht / donker van je apparaat.",
    "Picking a theme below changes the night theme.": "Kies je hieronder een thema, dan verandert het nachtthema.",
    "Picking a theme below changes the day theme.": "Kies je hieronder een thema, dan verandert het dagthema.",
    "It’s night now — the warm film is on.": "Het is nu nacht — de warme gloed staat aan.",
    "Off until the night window; it comes back on then.": "Uit tot de nachturen; dan gaat hij weer aan.",
    "It’s night now.": "Het is nu nacht.",
    "Off until {time}.": "Uit tot {time}.",
    "Darker than your phone's lowest brightness, for reading in bed. Not used in E-ink mode.": "Donkerder dan de laagste helderheid van je telefoon, om in bed te lezen. Werkt niet in e-inkmodus.",
    "Night is {hours} (the hours of Auto › By time). {now}": "Nacht: {hours} (de uren van Automatisch › Op tijd). {now}",
    "Night is {hours}. {now}": "Nacht: {hours}. {now}",
    "Not used in E-ink mode.": "Werkt niet in e-inkmodus.",
    "Night: {hours} · Settings › Theme sets the hours.": "Nacht: {hours} · de uren stel je in bij Instellingen › Thema.",
    "E-ink mode keeps the Pages flow": "E-inkmodus houdt de paginaweergave aan",
    "Looks like an e-ink screen — use E-ink mode?": "Dit lijkt een e-inkscherm — e-inkmodus gebruiken?",
    "Turn on": "Aanzetten",
    "No thanks": "Nee, bedankt",
    "E-ink mode is on — Settings › Reading turns it off": "E-inkmodus staat aan — uitzetten kan bij Instellingen › Lezen",
    "Couldn’t load this font": "Kan dit lettertype niet laden",
    "Font not available offline": "Lettertype niet offline beschikbaar",
    "Fonts": "Lettertypen",
    "Easy reading": "Makkelijk lezen",
    "Serif": "Schreef",
    "Sans": "Schreefloos",
    "Mono": "Monospace",
    "System sans": "Systeem schreefloos",
    "System mono": "Systeem monospace",
    "weighted letter bottoms and wide spacing help letters stay put": "zwaardere onderkanten en ruime spatiëring houden de letters op hun plek",
    "wide, even shapes shown to raise reading speed": "brede, gelijkmatige vormen waarmee je aantoonbaar sneller leest",
    "designed for low vision readers": "ontworpen voor slechtziende lezers",
    "clear letterforms for beginning readers": "duidelijke lettervormen voor beginnende lezers",
    "the classic screen serif, on nearly every device": "de klassieke schreefletter voor schermen, op bijna elk apparaat",
    "a calligraphic book face, where the device has it": "een kalligrafische boekletter, als je apparaat hem heeft",
    "the newspaper serif everyone knows": "de krantenletter die iedereen kent",
    "made for e-reading": "gemaakt voor e-readers",
    "a sturdy, open text serif": "een stevige, open schreefletter",
    "brushed curves with a modern feel": "gepenseelde rondingen met een moderne uitstraling",
    "large x-height, pleasant on screens": "grote x-hoogte, prettig op schermen",
    "a faithful old-style Garamond": "een getrouwe klassieke Garamond",
    "an old-style face in the spirit of printed books": "een klassieke letter in de geest van gedrukte boeken",
    "a Baskerville tuned for reading on screens": "een Baskerville afgestemd op lezen op schermen",
    "a slab serif, solid at any size": "een letter met blokschreven, stevig op elke grootte",
    "whatever your device uses for its own text": "de letter die je apparaat zelf gebruikt",
    "neutral and familiar": "neutraal en vertrouwd",
    "wide and generous, made for small screens": "breed en ruim, gemaakt voor kleine schermen",
    "a clean interface sans with tall letters": "een strakke schreefloze letter met hoge letters",
    "a warm, even sans with a slight edge": "een warme, gelijkmatige schreefloze letter met een randje",
    "rounded and soft on the eye": "rond en zacht voor het oog",
    "fixed width, for code and plain text": "vaste breedte, voor code en platte tekst",
    "a tall, open monospace made for long reads": "een hoge, open monospace voor lang lezen",
    "a typewriter-flavoured monospace": "een monospace met een typemachinegevoel",
    "A PDF is open — these apply to text documents. Use Zoom below for PDFs.": "Er is een PDF geopend — deze instellingen gelden voor tekstdocumenten. Gebruik Zoom hieronder voor PDF’s.",
    "Couldn't open “{name}”. {error}": "Kan “{name}” niet openen. {error}",
    "Opening PDF…": "PDF wordt geopend…",
    "Opening document…": "Document wordt geopend…",
    "Opening book…": "Boek wordt geopend…",
    "Opening page…": "Pagina wordt geopend…",
    ".{ext} isn't supported yet — export it as PDF, EPUB or DOCX and open that instead.": ".{ext} wordt nog niet ondersteund — exporteer het als PDF, EPUB of DOCX en open dat bestand.",
    "Couldn't load {file}": "Kan {file} niet laden",
    "This book is protected (DRM), so it can't be opened here.": "Dit boek is beveiligd (DRM) en kan hier niet worden geopend.",
    "Not a valid EPUB (no container.xml).": "Geen geldige EPUB (container.xml ontbreekt).",
    "Not a valid EPUB (no package file).": "Geen geldige EPUB (pakketbestand ontbreekt).",
    "This EPUB has no readable chapters.": "Deze EPUB heeft geen leesbare hoofdstukken.",
    "Page {n}": "Pagina {n}",
    "PDF rendering failed. {error}": "De PDF kan niet worden weergegeven. {error}",
    "Search": "Zoeken",
    "panel|Notes": "Aantekeningen",
    "About": "Info",
    "menu|Bookmarks": "Bladwijzers",
    "menu|Reading": "Lezen",
    "Lamplight": "Lamplight",
    "Close other Lamplight tabs to finish updating": "Sluit andere tabbladen met Lamplight om de update af te ronden",
    "Lamplight was updated in another tab — reload to keep saving": "Lamplight is in een ander tabblad bijgewerkt — laad de pagina opnieuw om te blijven opslaan",
    "{n} min ago": "{n} min geleden",
    "1 hour ago": "1 uur geleden",
    "{n} hours ago": "{n} uur geleden",
    "yesterday": "gisteren",
    "{n} days ago": "{n} dagen geleden",
    "new": "nieuw",
    "Finished": "Uitgelezen",
    "Move up": "Omhoog verplaatsen",
    "Move down": "Omlaag verplaatsen",
    "Move up {name}": "{name} omhoog verplaatsen",
    "Move down {name}": "{name} omlaag verplaatsen",
    "Unpin from the top": "Losmaken",
    "Pin to the top": "Bovenaan vastzetten",
    "Unpin {name} to the top": "{name} losmaken",
    "Pin {name} to the top": "{name} bovenaan vastzetten",
    "Remove from library": "Uit bibliotheek verwijderen",
    "Remove {name} from the library": "{name} uit de bibliotheek verwijderen",
    "Read again": "Opnieuw lezen",
    "Up next": "Hierna",
    "Continue reading": "Verder lezen",
    "Read {name} again": "{name} opnieuw lezen",
    "Continue reading {name}": "Verder lezen in {name}",
    "Start again": "Opnieuw beginnen",
    "Continue": "Verder",
    "Pinned": "Vastgezet",
    "Remove all {n} files and reading positions from this device? Your reading journal is kept.": "Alle {n} bestanden en leesposities van dit apparaat verwijderen? Je leesdagboek blijft bewaard.",
    "one|Remove all {n} files and reading positions from this device? Your reading journal is kept.": "{n} bestand en de leespositie van dit apparaat verwijderen? Je leesdagboek blijft bewaard.",
    "Removed “{name}”": "“{name}” verwijderd",
    "Important": "Belangrijk",
    "Vocabulary": "Woordenschat",
    "Question": "Vraag",
    "Default": "Standaard",
    "Yellow": "Geel",
    "Green": "Groen",
    "Pink": "Roze",
    "Already bookmarked": "Hier staat al een bladwijzer",
    "Couldn't find the spot": "Kan de plek niet vinden",
    "Bookmarked": "Bladwijzer gezet",
    "Bookmark removed": "Bladwijzer verwijderd",
    "Highlight removed": "Markering verwijderd",
    "Note removed": "Notitie verwijderd",
    "Undo": "Ongedaan maken",
    "Edit note": "Notitie bewerken",
    "Note": "Notitie",
    "Remove": "Verwijderen",
    "kind|Bookmark": "Bladwijzer",
    "kind|Highlight": "Markering",
    "page {n}": "pagina {n}",
    "Your note… use #tags to group it": "Je notitie… gebruik #tags om te groeperen",
    "Save note": "Notitie opslaan",
    "Cancel": "Annuleren",
    "Add note": "Notitie toevoegen",
    "Delete": "Verwijderen",
    "Nothing here matches those filters.": "Niets voldoet aan deze filters.",
    "{shown} of {n} mark": "{shown} van {n} aantekening",
    "{shown} of {n} marks": "{shown} van {n} aantekeningen",
    "{n} mark": "{n} aantekening",
    "{n} marks": "{n} aantekeningen",
    "Only {name} highlights": "Alleen markeringen: {name}",
    "Only notes tagged {tag}": "Alleen notities met tag {tag}",
    "Clear filters": "Filters wissen",
    "Colours": "Kleuren",
    "What a {colour} highlight means": "Betekenis van de kleur {colour}",
    "{name} — rename": "{name} — naam wijzigen",
    "Name it": "Naam geven",
    "No bookmarks or highlights yet": "Nog geen bladwijzers of markeringen",
    "Use “Bookmark here” in the ⋯ menu to mark a page.": "Kies “Bladwijzer zetten” in het menu ⋯ om een pagina te onthouden.",
    "Select text and choose Highlight, or hold a sentence and tap Highlight. “Bookmark here” in the ⋯ menu marks your spot.": "Selecteer tekst en kies Markeren, of druk lang op een zin en tik op Markeren. Met “Bladwijzer zetten” in het menu ⋯ bewaar je je plek.",
    "Search highlights and notes…": "Zoeken in markeringen en notities…",
    "Search highlights, notes and bookmarks": "Zoeken in markeringen, notities en bladwijzers",
    "What the highlight colours mean": "Wat de markeerkleuren betekenen",
    "Export Markdown": "Markdown exporteren",
    "Export Obsidian": "Voor Obsidian exporteren",
    "Export JSON": "JSON exporteren",
    "Copy as text": "Als tekst kopiëren",
    "Copy for Obsidian": "Voor Obsidian kopiëren",
    "Bookmarks & notes": "Aantekeningen",
    "Exported from Lamplight on {date}": "Geëxporteerd uit Lamplight op {date}",
    "Bookmarks": "Bladwijzers",
    "Highlights": "Markeringen",
    "Untitled": "Zonder titel",
    "Legend": "Legenda",
    "export|Notes": "Notities",
    "Copied": "Gekopieerd",
    "Couldn’t copy": "Kopiëren mislukt",
    "Bookmark here": "Bladwijzer zetten",
    "Quick": "Snel",
    "Tools": "Extra",
    "Navigate": "Navigatie"
  });

  /* ==== 3. app.js, part B ==== */
  add({
    "This PDF has no outline.": "Deze PDF heeft geen inhoudsopgave.",
    "No headings found in this document.": "Geen koppen gevonden in dit document.",
    "Reading the outline…": "Inhoudsopgave lezen…",
    "Go to page {input} of {n}": "Naar pagina {input} van {n}",
    "Contents": "Inhoud",
    "Page {n}": "Pagina {n}",
    "Searching… page {i} of {n}": "Zoeken… pagina {i} van {n}",
    "Searching… page {i} of {n} · {k} so far": "Zoeken… pagina {i} van {n} · {k} tot nu toe",
    "Searching…": "Zoeken…",
    "Type at least two letters.": "Typ minstens twee letters.",
    "No matches": "Geen treffers",
    "500+ matches · {i} of {total}": "500+ treffers · {i} van {total}",
    "{n} match · {i} of {total}": "{n} treffer · {i} van {total}",
    "{n} matches · {i} of {total}": "{n} treffers · {i} van {total}",
    "500+ matches": "500+ treffers",
    "{n} match": "{n} treffer",
    "{n} matches": "{n} treffers",
    "Nothing in this PDF matches “{q}”.": "“{q}” komt niet voor in deze PDF.",
    "Nothing in this document matches “{q}”.": "“{q}” komt niet voor in dit document.",
    "Find in this document": "Zoeken in dit document",
    "Find in this PDF…": "Zoeken in deze PDF…",
    "Find in this document…": "Zoeken in dit document…",
    "Previous match": "Vorige treffer",
    "Next match": "Volgende treffer",
    "Search": "Zoeken",
    "Reading page {i} of {n}…": "Pagina {i} van {n} lezen…",
    "before grade 1 · about age 5–6": "vóór leerjaar 1 (VS) · ongeveer 5–6 jaar",
    "beyond grade 16 · postgraduate reading": "boven leerjaar 16 (VS) · postuniversitair niveau",
    "grade {n} · university level": "leerjaar {n} (VS) · universitair niveau",
    "grade {n} · about age {a}–{b}": "leerjaar {n} (VS) · ongeveer {a}–{b} jaar",
    "Simple": "Eenvoudig",
    "Moderate": "Gemiddeld",
    "Rich": "Rijk",
    "Very rich": "Heel rijk",
    "under a minute": "minder dan een minuut",
    "about {n} min": "ongeveer {n} min",
    "about {h} h {m} min": "ongeveer {h} u {m} min",
    "about {h} h": "ongeveer {h} u",
    "This document": "Dit document",
    "very rare": "heel zeldzaam",
    "rare": "zeldzaam",
    "uncommon": "ongewoon",
    "Find in the text": "Zoeken in de tekst",
    "Find “{word}” in the text": "“{word}” zoeken in de tekst",
    "Nothing to count yet.": "Nog niets om te tellen.",
    "At a glance": "In één oogopslag",
    "Words": "Woorden",
    "Unique words": "Unieke woorden",
    "Sentences": "Zinnen",
    "Reading time at your speed": "Leestijd in jouw tempo",
    "Words per sentence": "Woorden per zin",
    "Letters per word": "Letters per woord",
    "Dialogue": "Dialoog",
    "Reading level": "Leesniveau",
    "Very easy": "Heel makkelijk",
    "Easily understood by an average 11-year-old.": "Goed te volgen voor een gemiddelde elfjarige.",
    "Easy": "Makkelijk",
    "Conversational English; most 12-year-olds can follow it.": "Engels zoals in een gesprek; de meeste twaalfjarigen kunnen het volgen.",
    "Fairly easy": "Vrij makkelijk",
    "Most 13-year-olds can follow it.": "De meeste dertienjarigen kunnen het volgen.",
    "Standard": "Gemiddeld",
    "Plain English; easily understood by most 14- to 15-year-olds.": "Eenvoudig Engels; goed te volgen voor de meeste 14- tot 15-jarigen.",
    "Fairly difficult": "Vrij moeilijk",
    "Fairly hard to read; comfortable for older teenagers.": "Vrij lastig te lezen; goed te doen voor oudere tieners.",
    "Difficult": "Moeilijk",
    "Hard to read; best understood by university-level readers.": "Lastig te lezen; het best te volgen voor lezers op universitair niveau.",
    "Very difficult": "Heel moeilijk",
    "Very hard to read; best understood by graduates and specialists.": "Heel lastig te lezen; het best te volgen voor afgestudeerden en specialisten.",
    "Flesch reading ease": "Flesch-leesgemak",
    "harder": "moeilijker",
    "easier": "makkelijker",
    "Coleman–Liau, as a second opinion: {grade}": "Coleman–Liau, als tweede mening: {grade}",
    "Vocabulary": "Woordenschat",
    "Vocabulary richness ({n})": "Rijkdom van de woordenschat ({n})",
    "Words used only once": "Woorden die maar één keer voorkomen",
    "Hardest words": "Moeilijkste woorden",
    "Preparing…": "Voorbereiden…",
    "Copy": "Kopiëren",
    "Counts are from the text as shown; numbers, headings and captions are included.": "Geteld in de tekst zoals je die ziet; getallen, koppen en bijschriften tellen mee.",
    "No unusual words — everything here is everyday English.": "Geen ongewone woorden — alles hier is alledaags Engels.",
    "Couldn’t load the word list.": "Kan de woordenlijst niet laden.",
    "Waiting for the document…": "Wachten op het document…",
    "first {n} pages": "eerste {n} pagina’s",
    "Counting words…": "Woorden tellen…",
    "Counting words… {n} so far": "Woorden tellen… {n} tot nu toe",
    "Couldn’t read the text.": "Kan de tekst niet lezen.",
    "Reading the text…": "Tekst lezen…",
    "About this text": "Over deze tekst",
    "About “{name}”": "Over “{name}”",
    "About “{name}” ({note})": "Over “{name}” ({note})",
    "Words: {words} · unique words: {unique} · sentences: {sentences}": "Woorden: {words} · unieke woorden: {unique} · zinnen: {sentences}",
    "Reading time: {time} at {wpm} words a minute": "Leestijd: {time} bij {wpm} woorden per minuut",
    "Average sentence: {s} words · average word: {w} letters": "Gemiddelde zin: {s} woorden · gemiddeld woord: {w} letters",
    "Average sentence: {s} words · average word: {w} letters · dialogue: {pct}%": "Gemiddelde zin: {s} woorden · gemiddeld woord: {w} letters · dialoog: {pct}%",
    "Reading level: Flesch reading ease {score} ({band}) — {text}": "Leesniveau: Flesch-leesgemak {score} ({band}) — {text}",
    "Vocabulary richness: {label} ({ttr}) · words used only once: {n}": "Rijkdom van de woordenschat: {label} ({ttr}) · woorden die maar één keer voorkomen: {n}",
    "Hardest words: {list}": "Moeilijkste woorden: {list}",
    "Copied": "Gekopieerd",
    "Couldn’t copy": "Kopiëren mislukt",
    "Speed {x} — change": "Tempo {x} — wijzigen",
    "Using the device voice": "De stem van je apparaat leest voor",
    "{name} isn’t available in this browser": "{name} is niet beschikbaar in deze browser",
    "Woman": "Vrouw",
    "Man": "Man",
    "Voice": "Stem",
    "natural": "natuurlijk",
    "offline": "offline",
    "online": "online",
    "Women": "Vrouwen",
    "Men": "Mannen",
    "Other": "Overig",
    "Voices": "Stemmen",
    "Voice: {name} — choose another": "Stem: {name} — kies een andere",
    "{name} — choose another voice": "{name} — kies een andere stem",
    "Default voice": "Standaardstem",
    "Read aloud": "Voorlezen",
    "Off": "Uit",
    "{n} minutes": "{n} minuten",
    "{n} min": "{n} min",
    "End of chapter": "Einde hoofdstuk",
    "Stops at": "Stopt bij",
    "end of page": "einde pagina",
    "end of chapter": "einde hoofdstuk",
    "Stops at end of page — sleep timer": "Stopt bij einde pagina — slaaptimer",
    "Stops at end of chapter — sleep timer": "Stopt bij einde hoofdstuk — slaaptimer",
    "Stops in": "Stopt over",
    "Stops in {n} min — sleep timer": "Stopt over {n} min — slaaptimer",
    "Stopped by the sleep timer": "Gestopt door de slaaptimer",
    "Speech stopped ({error})": "Voorlezen gestopt ({error})",
    "Pause": "Pauzeren",
    "Play": "Afspelen",
    "{name} couldn’t start": "Kan {name} niet starten",
    "Read aloud isn’t available in this browser": "Voorlezen is niet beschikbaar in deze browser",
    "Nothing to read": "Niets om voor te lezen",
    "No text on this page": "Geen tekst op deze pagina",
    "Quoted speech is read in the narrator’s voice.": "De verteller leest ook de dialogen.",
    "{name} reads the quoted speech.": "{name} leest de dialogen.",
    "Chosen for you: {name} reads the quoted speech.": "Voor je gekozen: {name} leest de dialogen.",
    "No man’s voice for this language, so quoted speech is the narrator pitched higher.": "Geen mannenstem voor deze taal, dus de verteller leest de dialogen wat hoger.",
    "No man’s voice for this language, so quoted speech is the narrator pitched lower.": "Geen mannenstem voor deze taal, dus de verteller leest de dialogen wat lager.",
    "No woman’s voice for this language, so quoted speech is the narrator pitched higher.": "Geen vrouwenstem voor deze taal, dus de verteller leest de dialogen wat hoger.",
    "No woman’s voice for this language, so quoted speech is the narrator pitched lower.": "Geen vrouwenstem voor deze taal, dus de verteller leest de dialogen wat lager.",
    "No second voice for this language, so quoted speech is the narrator pitched higher.": "Geen tweede stem voor deze taal, dus de verteller leest de dialogen wat hoger.",
    "No second voice for this language, so quoted speech is the narrator pitched lower.": "Geen tweede stem voor deze taal, dus de verteller leest de dialogen wat lager.",
    "Natural": "Natuurlijk",
    "Dramatic": "Dramatisch",
    "engine|Device voice": "Je apparaat",
    "Device voice": "Stem van je apparaat",
    "Natural voices": "Natuurlijke stemmen",
    "Fast · keeps up on phones": "Snel · vlot op telefoons",
    "Best · slower, prepare first": "Beste · trager, eerst voorbereiden",
    "Download natural voices (≈ {mb} MB, once)": "Stemmen downloaden (≈ {mb} MB, eenmalig)",
    "Runs on this device and keeps up with reading on most phones. Nothing is sent anywhere.": "Werkt op dit apparaat en is op de meeste telefoons snel genoeg om meteen voor te lezen. Er wordt niets verstuurd.",
    "Prepare book makes the whole book ahead, to listen offline. Keep Lamplight open; it carries on where it left off.": "Boek voorbereiden maakt het hele boek vooraf klaar, zodat je offline kunt luisteren. Laat Lamplight open; het gaat verder waar het was gebleven.",
    "Heart (woman)": "Heart (vrouw)",
    "Runs on this device. Nothing is sent anywhere. Slower than reading on most phones: press Prepare book first, then listen with no pauses.": "Werkt op dit apparaat. Er wordt niets verstuurd. Op de meeste telefoons te traag om meteen voor te lezen: tik eerst op Boek voorbereiden en luister dan zonder pauzes.",
    "Keep Lamplight open (plugging in helps); it carries on where it left off.": "Laat Lamplight open (aan de oplader gaat het beter); het gaat verder waar het was gebleven.",
    "One voice": "Eén stem",
    "A voice per character": "Een stem per personage",
    "v3 expressive": "v3 expressief",
    "Voices from": "Stemmen van",
    "Characters": "Personages",
    "Every character gets a device voice of their own, the unnamed ones too, worked out from the text on this device (“said Anna”, “he whispered”, who acts beside a line, who takes turns).": "Elk personage krijgt een eigen stem van je apparaat, ook de naamloze. Dat wordt op dit apparaat uit de tekst afgeleid (“said Anna”, “he whispered”, wie iets doet naast een zin, wie om de beurt spreekt).",
    "Voices for characters…": "Stemmen per personage…",
    "Narrator": "Verteller",
    "Add a key first": "Eerst een sleutel toevoegen",
    "Model": "Model",
    "ElevenLabs API key…": "ElevenLabs-API-sleutel…",
    "Each sentence is sent to ElevenLabs once and kept on this device, so replaying is free. Uses your ElevenLabs credits.": "Elke zin gaat één keer naar ElevenLabs en wordt op dit apparaat bewaard, dus opnieuw afspelen is gratis. Gebruikt je ElevenLabs-tegoed.",
    "Quality": "Kwaliteit",
    "Checking…": "Controleren…",
    "Remove": "Verwijderen",
    "Downloading the natural voices": "De natuurlijke stemmen worden gedownload",
    "Prepare book": "Boek voorbereiden",
    "Preparing the audiobook": "Het luisterboek wordt voorbereid",
    "Audio kept on this device": "Audio bewaard op dit apparaat",
    "Clear": "Wissen",
    "Couldn’t load the voices module": "Kan de stemmenmodule niet laden",
    "{name} is a woman’s voice — change": "{name} is een vrouwenstem — wijzigen",
    "{name} is a man’s voice — change": "{name} is een mannenstem — wijzigen",
    "{name} is not marked — change": "{name}: man of vrouw onbekend — wijzigen",
    "Hear {name}": "{name} beluisteren",
    "{name} reads the narration": "{name} leest de vertelling",
    "{name} reads the quoted speech": "{name} leest de dialogen",
    "No voice yet": "Nog geen stem",
    "This browser offers no voices yet.": "Deze browser biedt nog geen stemmen.",
    "Hide {name}": "{name} verbergen",
    "Hide": "Verbergen",
    "Hidden ({n})": "Verborgen ({n})",
    "Show {name} again": "{name} weer tonen",
    "No voices to list.": "Geen stemmen om te tonen.",
    "Reading to you": "Wie leest voor",
    "Swap the two": "Omwisselen",
    "Choose for me": "Voor mij kiezen",
    "Your device doesn’t say which voices are women’s and which are men’s — mark them below and Lamplight will remember.": "Je apparaat zegt niet welke stemmen van vrouwen en welke van mannen zijn — geef het hieronder aan, dan onthoudt Lamplight het.",
    "Good for this text": "Geschikt voor deze tekst",
    "All voices ({n})": "Alle stemmen ({n})",
    "Filter by name or language": "Filteren op naam of taal",
    "Filter voices": "Stemmen filteren",
    "No voice matches that.": "Geen stem gevonden.",
    "Expression": "Expressie",
    "Natural follows the punctuation and the said-tags around speech; dramatic pushes harder.": "Natuurlijk volgt de leestekens en de woorden rond de dialogen (“she said”); dramatisch zet alles sterker aan.",
    "Pitch": "Toonhoogte",
    "Sleep timer": "Slaaptimer",
    "Stop after": "Stoppen na",
    "Minutes from now; reading stops at the end of the sentence. End of chapter stops before the next heading, or at the end of a PDF page.": "Minuten vanaf nu; het voorlezen stopt aan het eind van de zin. Einde hoofdstuk stopt vóór de volgende kop, of aan het eind van een PDF-pagina.",
    "Hear the pair": "Beide beluisteren",
    "Read-aloud voices": "Voorleesstemmen",
    "Stop reading aloud": "Voorlezen stoppen",
    "Who’s who": "Wie is wie",
    "{h} h {m} min": "{h} u {m} min",
    "{h} h": "{h} u",
    "measured over {time} of reading in {n} book": "gemeten over {time} lezen in {n} boek",
    "measured over {time} of reading in {n} books": "gemeten over {time} lezen in {n} boeken",
    "not measured yet": "nog niet gemeten",
    "a first guess": "een eerste schatting",
    "an early estimate": "een vroege schatting",
    "measured": "gemeten",
    "well measured": "goed gemeten",
    "not measured yet, using a typical {n} words per minute": "nog niet gemeten, uitgaande van een gangbare {n} woorden per minuut",
    "under a minute left": "nog geen minuut",
    "{n} min left": "nog {n} min",
    "{h} h {m} min left": "nog {h} u {m} min",
    "{h} h left": "nog {h} u",
    "{pct}% · {left}": "{pct}% · {left}",
    "p. {page} / {pages} · {left}": "blz. {page} / {pages} · {left}",
    "p. {page} / {pages}": "blz. {page} / {pages}",
    "Read aloud reads the original, not the translation — “{item}” in the menu lets you follow it": "Voorlezen leest het origineel, niet de vertaling — met “{item}” in het menu kun je meelezen",
    "Show both languages": "Beide talen tonen"
  });

  /* ==== 4. app.js, part C ==== */
  add({
    "Daily goal reached — {n}-day streak": "Dagdoel gehaald — {n} dagen op rij",
    "one|Daily goal reached — {n}-day streak": "Dagdoel gehaald — {n} dag op rij",
    "{day} — {n} min": "{day} — {n} min",
    "Reading speed over {n} weeks: {lo} to {hi} words per minute": "Leestempo over {n} weken: {lo} tot {hi} woorden per minuut",
    "Not enough reading yet to see a trend": "Nog te weinig gelezen om een trend te zien",
    "Steady at about {n} words per minute": "Stabiel rond {n} woorden per minuut",
    "Speed is up {n} % on last month": "{n} % sneller dan vorige maand",
    "Speed is down {n} % on last month": "{n} % langzamer dan vorige maand",
    "about {time} left": "nog ongeveer {time}",
    "about {time} left · ≈ {n} more evening": "nog ongeveer {time} · ≈ {n} avond",
    "about {time} left · ≈ {n} more evenings": "nog ongeveer {time} · ≈ {n} avonden",
    "{n}-day streak": "{n} dagen op rij",
    "one|{n}-day streak": "{n} dag op rij",
    "{n} min today": "vandaag {n} min",
    "goal {n} min": "doel {n} min",
    "{n} of {goal} books this year": "{n} van {goal} boeken dit jaar",
    "Reading stats": "Leesstatistieken",
    "{n} book": "{n} boek",
    "{n} books": "{n} boeken",
    "{n} page": "{n} pagina",
    "{n} pages": "{n} pagina’s",
    "Lower the yearly book goal": "Jaardoel voor boeken verlagen",
    "Raise the yearly book goal": "Jaardoel voor boeken verhogen",
    "Books a year — zero for no goal": "Boeken per jaar — nul voor geen doel",
    "Lower the yearly page goal": "Jaardoel voor pagina’s verlagen",
    "Raise the yearly page goal": "Jaardoel voor pagina’s verhogen",
    "Pages a year — zero for no goal": "Pagina’s per jaar — nul voor geen doel",
    "{n} of {goal}": "{n} van {goal}",
    "{label}: {n} of {goal}": "{label}: {n} van {goal}",
    "a year": "per jaar",
    "no goal": "geen doel",
    "{n} word": "{n} woord",
    "{n} words": "{n} woorden",
    "{n} skimmed": "{n} vluchtig gelezen",
    "Today": "Vandaag",
    "of {n} min": "van {n} min",
    "Goal reached": "Doel gehaald",
    "{n} minute to go": "nog {n} minuut",
    "{n} minutes to go": "nog {n} minuten",
    "Streak": "Reeks",
    "No streak yet": "Nog geen reeks",
    "best {n} day": "record {n} dag",
    "best {n} days": "record {n} dagen",
    "Read {n} more minute today to keep it.": "Lees vandaag nog {n} minuut om je reeks te houden.",
    "Read {n} more minutes today to keep it.": "Lees vandaag nog {n} minuten om je reeks te houden.",
    "Read {n} more minute today to start one.": "Lees vandaag nog {n} minuut om een reeks te beginnen.",
    "Read {n} more minutes today to start one.": "Lees vandaag nog {n} minuten om een reeks te beginnen.",
    "Last 4 weeks": "Afgelopen 4 weken",
    "This week {a} · last week {b}": "Deze week {a} · vorige week {b}",
    "Reading speed": "Leestempo",
    "wpm": "w/min",
    "This year": "Dit jaar",
    "Books finished": "Uitgelezen boeken",
    "Pages read": "Gelezen pagina’s",
    "Reading journal": "Leesdagboek",
    "Books": "Boeken",
    "{pct}% · {time} read": "{pct}% · {time} gelezen",
    "This document": "Dit document",
    "{n} pages per minute over {time}": "{n} pagina’s per minuut over {time}",
    "{n} words per minute over {time}": "{n} woorden per minuut over {time}",
    "All time": "Totaal",
    "Time read": "Leestijd",
    "Words": "Woorden",
    "Pages": "Pagina’s",
    "Skimmed": "Vluchtig gelezen",
    "Listened": "Beluisterd",
    "Documents opened": "Documenten",
    "Average speed": "Gemiddeld tempo",
    "{n} words per minute": "{n} woorden per minuut",
    "First day recorded": "Eerste leesdag",
    "Daily goal": "Dagdoel",
    "Daily goal in minutes": "Dagdoel in minuten",
    "{n} minute a day": "{n} minuut per dag",
    "{n} minutes a day": "{n} minuten per dag",
    "Minutes of reading a day. A day counts toward the streak once the goal is met.": "Minuten lezen per dag. Een dag telt mee voor je reeks zodra je het doel haalt.",
    "Export JSON": "JSON exporteren",
    "stats|Reset…": "Wissen…",
    "Clear all reading stats from this device? This can’t be undone.": "Alle leesstatistieken van dit apparaat wissen? Dit kan niet ongedaan worden gemaakt.",
    "Reading stats cleared": "Leesstatistieken gewist",
    "Natural voices · Fast": "Natuurlijke stemmen · Snel",
    "the Piper voice model, for reading aloud offline": "het stemmodel van Piper, om offline voor te lezen",
    "Remove Fast voices": "Snelle stemmen verwijderen",
    "Natural voices · Best": "Natuurlijke stemmen · Beste",
    "the Kokoro model and its voices, for reading aloud offline": "het model van Kokoro met zijn stemmen, om offline voor te lezen",
    "Remove Best voices": "Beste stemmen verwijderen",
    "Natural voices’ engine": "Spraaksoftware voor de stemmen",
    "shared by Fast and Best; removed with the last of them": "gedeeld door Snel en Beste; verdwijnt met de laatste van de twee",
    "Dutch ↔ English pack": "Pakket Nederlands ↔ Engels",
    "translation on this device, offline": "vertalen op dit apparaat, offline",
    "Remove the pack": "Pakket verwijderen",
    "{n} file": "{n} bestand",
    "{n} files": "{n} bestanden",
    "App files and dictionary": "Appbestanden en woordenboek",
    "Measuring…": "Meten…",
    "Not cached yet": "Nog niet bewaard",
    "{used} used of about {quota} this site may use": "{used} gebruikt van de ongeveer {quota} die deze site mag gebruiken",
    "{used} used": "{used} gebruikt",
    "All together": "Alles bij elkaar",
    "What is stored": "Wat er bewaard is",
    "{n} finished": "{n} uitgelezen",
    "Remove finished books": "Uitgelezen boeken verwijderen",
    "Reading positions": "Leesposities",
    "Highlights and notes": "Markeringen en notities",
    "Delete all highlights and notes": "Alle markeringen en notities verwijderen",
    "Cached translations": "Bewaarde vertalingen",
    "{n} document": "{n} document",
    "{n} documents": "{n} documenten",
    "{n} word or sentence": "{n} woord of zin",
    "{n} words and sentences": "{n} woorden en zinnen",
    "Clear cached translations": "Bewaarde vertalingen wissen",
    "Read-aloud audio": "Voorleesaudio",
    "{n} clip made by the natural voices or ElevenLabs, kept for replays (up to 400 MB)": "{n} fragment van de natuurlijke stemmen of ElevenLabs, bewaard om opnieuw af te spelen (tot 400 MB)",
    "{n} clips made by the natural voices or ElevenLabs, kept for replays (up to 400 MB)": "{n} fragmenten van de natuurlijke stemmen of ElevenLabs, bewaard om opnieuw af te spelen (tot 400 MB)",
    "Clear read-aloud audio": "Voorleesaudio wissen",
    "{n} day": "{n} dag",
    "{n} days": "{n} dagen",
    "Reset reading stats": "Leesstatistieken wissen",
    "{n} book finished · kept when the library is cleared": "{n} boek uitgelezen · blijft bewaard als je de bibliotheek wist",
    "{n} books finished · kept when the library is cleared": "{n} boeken uitgelezen · blijft bewaard als je de bibliotheek wist",
    "Clear reading journal": "Leesdagboek wissen",
    "Saved themes": "Bewaarde thema’s",
    "{n} theme": "{n} thema",
    "{n} themes": "{n} thema’s",
    "Keeping it": "Bewaren",
    "This browser doesn’t say whether it keeps storage.": "Deze browser zegt niet of hij de opslag bewaart.",
    "Storage is persistent — the browser won’t clear it on its own.": "De opslag is blijvend — de browser wist hem niet uit zichzelf.",
    "Storage may be cleared by the browser when space is low.": "De browser kan de opslag wissen als de ruimte opraakt.",
    "Request persistent storage": "Blijvende opslag vragen",
    "Clear everything…": "Alles wissen…",
    "Storage": "Opslag",
    "Remove {n} finished book from this device, with its reading position, highlights, bookmarks and notes? This can’t be undone. Your reading journal is kept.": "{n} uitgelezen boek van dit apparaat verwijderen, met de leespositie, markeringen, bladwijzers en notities? Dit kan niet ongedaan worden gemaakt. Je leesdagboek blijft bewaard.",
    "Remove {n} finished books from this device, with their reading positions, highlights, bookmarks and notes? This can’t be undone. Your reading journal is kept.": "{n} uitgelezen boeken van dit apparaat verwijderen, met hun leesposities, markeringen, bladwijzers en notities? Dit kan niet ongedaan worden gemaakt. Je leesdagboek blijft bewaard.",
    "Removed {n} finished book": "{n} uitgelezen boek verwijderd",
    "Removed {n} finished books": "{n} uitgelezen boeken verwijderd",
    "Nothing is finished yet": "Nog niets uitgelezen",
    "Delete every highlight, bookmark and note on this device? This can’t be undone.": "Alle markeringen, bladwijzers en notities op dit apparaat verwijderen? Dit kan niet ongedaan worden gemaakt.",
    "Highlights and notes deleted": "Markeringen en notities verwijderd",
    "Delete the read-aloud audio kept on this device ({size})? The natural voices make it again as you listen; ElevenLabs audio is made (and paid for) again.": "De voorleesaudio op dit apparaat ({size}) verwijderen? De natuurlijke stemmen maken hem opnieuw terwijl je luistert; ElevenLabs-audio wordt opnieuw gemaakt (en betaald).",
    "Delete the read-aloud audio kept on this device? The natural voices make it again as you listen; ElevenLabs audio is made (and paid for) again.": "De voorleesaudio op dit apparaat verwijderen? De natuurlijke stemmen maken hem opnieuw terwijl je luistert; ElevenLabs-audio wordt opnieuw gemaakt (en betaald).",
    "Read-aloud audio cleared": "Voorleesaudio gewist",
    "Couldn’t load the voices": "Kan de stemmen niet laden",
    "Remove the Dutch ↔ English pack from this device ({size})? It can be downloaded again.": "Het pakket Nederlands ↔ Engels van dit apparaat verwijderen ({size})? Je kunt het later opnieuw downloaden.",
    "Remove the Dutch ↔ English pack from this device? It can be downloaded again.": "Het pakket Nederlands ↔ Engels van dit apparaat verwijderen? Je kunt het later opnieuw downloaden.",
    "Couldn’t load the translator": "Kan de vertaler niet laden",
    "Cached translations cleared": "Bewaarde vertalingen gewist",
    "Storage is now persistent": "De opslag is nu blijvend",
    "The browser kept storage as it was": "De browser laat de opslag zoals hij was",
    "Clear everything Lamplight keeps on this device — books, positions, notes, translations, stats, reading journal, themes and settings (an ElevenLabs key too), the read-aloud audio, the natural voices and the Dutch ↔ English pack?": "Alles wissen wat Lamplight op dit apparaat bewaart — boeken, posities, notities, vertalingen, statistieken, leesdagboek, thema’s en instellingen (ook een ElevenLabs-sleutel), de voorleesaudio, de natuurlijke stemmen en het pakket Nederlands ↔ Engels?",
    "This can’t be undone. Clear everything?": "Dit kan niet ongedaan worden gemaakt. Alles wissen?",
    "read in a day": "in één dag gelezen",
    "took {n} day": "in {n} dag gelezen",
    "took {n} days": "in {n} dagen gelezen",
    "Untitled": "Zonder titel",
    "Couldn’t save to the reading journal": "Kan niet opslaan in het leesdagboek",
    "{n} of 5 stars": "{n} van 5 sterren",
    "no stars": "geen sterren",
    "{n} star": "{n} ster",
    "{n} stars": "{n} sterren",
    "Open a book first": "Open eerst een boek",
    "Finished": "Uitgelezen",
    "Close": "Sluiten",
    "Your rating": "Jouw beoordeling",
    "A few words…": "Een paar woorden…",
    "A few words about it (optional)": "Een paar woorden erover (optioneel)",
    "Finished on": "Uitgelezen op",
    "Cancel": "Annuleren",
    "Not now": "Niet nu",
    "Save": "Opslaan",
    "Finished {title}. A card at the foot of the page asks for your stars.": "Je hebt {title} uitgelezen. Onder aan de pagina kun je sterren geven.",
    "You can add it later: More › Mark as finished": "Je kunt het later toevoegen: Meer › Als uitgelezen markeren",
    "Added to your reading journal": "Toegevoegd aan je leesdagboek",
    "Journal entry saved": "Opgeslagen in je leesdagboek",
    "Finished {date}": "Uitgelezen op {date}",
    "Stars": "Sterren",
    "Note": "Notitie",
    "Open book": "Boek openen",
    "Delete": "Verwijderen",
    "No finished books yet": "Nog geen uitgelezen boeken",
    "Books you finish appear here with your stars and a note.": "Boeken die je uitleest, komen hier te staan met je sterren en een notitie.",
    "Loading…": "Laden…",
    "Export": "Exporteren",
    "Clear journal…": "Alles wissen…",
    "Delete “{title}” from your reading journal? This can’t be undone.": "“{title}” uit je leesdagboek verwijderen? Dit kan niet ongedaan worden gemaakt.",
    "Removed from your reading journal": "Verwijderd uit je leesdagboek",
    "Delete all {n} book from your reading journal? This can’t be undone.": "{n} boek uit je leesdagboek verwijderen? Dit kan niet ongedaan worden gemaakt.",
    "Delete all {n} books from your reading journal? This can’t be undone.": "Alle {n} boeken uit je leesdagboek verwijderen? Dit kan niet ongedaan worden gemaakt.",
    "Reading journal cleared": "Leesdagboek gewist",
    "Exported from Lamplight on {date}": "Geëxporteerd uit Lamplight op {date}",
    "finished {date}": "uitgelezen op {date}",
    "Nothing in the journal yet": "Nog niets in het leesdagboek",
    "Mark as finished": "Als uitgelezen markeren",
    "Finished, {stars}": "Uitgelezen, {stars}",
    "Drag the handle to move the ruler": "Sleep het handvat om de liniaal te verplaatsen",
    "The ruler follows your mouse": "De liniaal volgt je muis",
    "Hide reading ruler": "Leesliniaal verbergen",
    "Reading ruler": "Leesliniaal",
    "Zen mode — press z or Esc to leave": "Zenmodus — druk op z of Esc om te stoppen",
    "Zen mode — tap the lamp to leave": "Zenmodus — tik op de lamp om te stoppen",
    "Tap the lamp to leave zen mode": "Tik op de lamp om de zenmodus te verlaten",
    "Press z or Esc to leave zen mode": "Druk op z of Esc om de zenmodus te verlaten",
    "Leave zen mode": "Zenmodus verlaten",
    "Zen mode": "Zenmodus",
    "The PDF isn’t ready to print yet — try again in a moment": "De PDF is nog niet klaar om af te drukken — probeer het zo nog eens",
    "Opened the PDF in a new tab — print it from there": "De PDF staat in een nieuw tabblad — druk hem daar af",
    "The browser blocked the new tab — allow pop-ups to print this PDF": "De browser heeft het nieuwe tabblad geblokkeerd — sta pop-ups toe om deze PDF af te drukken",
    "Print…": "Afdrukken…",
    "End of document": "Einde van het document",
    "Pause": "Pauzeren",
    "Resume": "Hervatten",
    "Stop auto-scroll": "Automatisch scrollen stoppen",
    "Auto-scroll": "Automatisch scrollen",
    "Nothing to recap yet — read a little further first": "Nog niets om op terug te blikken — lees eerst nog wat verder",
    "a moment ago": "zojuist",
    "{n} minutes ago": "{n} minuten geleden",
    "an hour ago": "een uur geleden",
    "{n} hours ago": "{n} uur geleden",
    "yesterday": "gisteren",
    "{n} days ago": "{n} dagen geleden",
    "on {date}": "op {date}",
    "Couldn’t make a recap": "Kan geen terugblik maken",
    "Previously…": "Wat voorafging…",
    "Close the recap": "Terugblik sluiten",
    "Characters": "Personages",
    "Read it aloud": "Voorlezen",
    "Continue": "Verder",
    "Previously: a recap of your last reading, {when}, is at the top of the page.": "Wat voorafging: bovenaan de pagina staat een terugblik op je vorige leessessie ({when}).",
    "Stop": "Stoppen",
    "{pct}% · {left}": "{pct}% · {left}",
    "{n} min left": "nog {n} min",
    "{h} h {m} min left": "nog {h} u {m} min",
    "Time left at {n} words a minute": "Resterende tijd bij {n} woorden per minuut",
    "End of the document": "Einde van het document",
    "Play": "Afspelen",
    "Pause (Space)": "Pauzeren (Spatie)",
    "Play (Space)": "Afspelen (Spatie)",
    "{n} wpm": "{n} w/min",
    "Speed reading": "Snellezen",
    "Close (Esc)": "Sluiten (Esc)",
    "Close speed reading": "Snellezen sluiten",
    "Tap to play or pause": "Tik om af te spelen of te pauzeren",
    "Back a sentence (←)": "Een zin terug (←)",
    "Back a sentence": "Een zin terug",
    "On a sentence (→)": "Een zin verder (→)",
    "On a sentence": "Een zin verder",
    "Speed": "Tempo",
    "Space or a tap plays and pauses · ← → a sentence · ↑ ↓ speed · Esc closes": "Spatie of tik: afspelen en pauzeren · ← → een zin · ↑ ↓ tempo · Esc sluit",
    "Speed reading works in text documents": "Snellezen werkt in tekstdocumenten",
    "rsvp|Nothing to read": "Niets om te lezen",
    "Couldn’t load the sounds": "Kan de geluiden niet laden",
    "Mix…": "Mixen…",
    "Background sounds off": "Achtergrondgeluiden uit",
    "{mix} — playing": "{mix} — aan",
    "Sound mix…": "Geluidsmix…",
    "Open a file…": "Bestand openen…",
    "Library": "Bibliotheek",
    "Settings": "Instellingen",
    "Close document": "Document sluiten",
    "menu|Background sounds": "Achtergrond\u00ADgeluiden",
    "menu|Stop background sounds": "Achtergrond\u00ADgeluiden stoppen",
    "menu|Reading stats": "Lees\u00ADstatistieken",
    "menu|Previously…": "Wat voor\u00ADaf\u00ADging…"
  });

  /* ==== 5. app.js, part D ==== */
  add({
    /* wiring, Launch, the read-aloud button, the phone's switcher, the settings sheet */
    "Shared text": "Gedeelde tekst",
    "Reading now \u00B7 {progress}": "Nu aan het lezen · {progress}",
    "Close {name}": "{name} sluiten",
    "Open books": "Geopende boeken",
    "{name} theme": "Thema: {name}",
    "Settings sections": "Onderdelen van de instellingen",
    "Close settings": "Instellingen sluiten",
    /* first-run tip, the theme editor, the type reset */
    "Tip: tap any word for its meaning": "Tip: tik op een woord voor de betekenis",
    "Tap a word for its meaning. Tap the lamp for your reading controls.": "Tik op een woord voor de betekenis. Tik op de lamp voor je leesbediening.",
    "Name for this theme": "Naam voor dit thema",
    "{name} copy": "Kopie van {name}",
    "Copied as “{name}”": "Gekopieerd als “{name}”",
    "Name for the new theme": "Naam voor het nieuwe thema",
    "Saved as “{name}”": "Opgeslagen als “{name}”",
    "Delete the theme “{name}”?": "Thema “{name}” verwijderen?",
    "Text settings reset": "Tekstinstellingen hersteld",
    /* keyboard shortcuts (the help panel) */
    "Switch day / night theme": "Wisselen tussen dag- en nachtthema",
    "Switch scroll / pages": "Wisselen tussen scrollen en pagina’s",
    "Read aloud (start / stop)": "Voorlezen (starten / stoppen)",
    "Zen mode (enter / leave)": "Zenmodus (aan / uit)",
    "Auto-scroll (start / stop)": "Automatisch scrollen (starten / stoppen)",
    "Speed reading (one word at a time)": "Snellezen (één woord tegelijk)",
    "Library / home": "Bibliotheek / start",
    "Keyboard shortcuts": "Sneltoetsen",
    "\u2190 \u2192, PgUp/PgDn, Space": "\u2190 \u2192, PgUp/PgDn, Spatie",
    "Turn pages (Pages flow)": "Bladeren (paginaweergave)",
    "First / last page (Pages flow)": "Eerste / laatste pagina (paginaweergave)",
    "Next tab": "Volgend tabblad",
    "Next / previous match (in search)": "Volgende / vorige treffer (bij zoeken)",
    "Close panels and cards": "Panelen en kaarten sluiten",
    "Right-click a sentence": "Rechtsklikken op een zin",
    "Explain it (desktop)": "Zin uitleggen (computer)",
    "Hold a sentence": "Lang drukken op een zin",
    "Explain it (touch)": "Zin uitleggen (touchscreen)",
    "Select text, then d or Shift+F10": "Tekst selecteren, dan d of Shift+F10",
    "Define or explain it (F7 turns on caret browsing)": "Opzoeken of uitleggen (F7 zet cursornavigatie aan)",
    "Define or explain the selected text": "Geselecteerde tekst opzoeken of uitleggen",
    /* the dictionary and explainer card: its head, tabs and footer */
    "Selected text": "Geselecteerde tekst",
    "Explain": "Uitleggen",
    "tab|Explain": "Uitleg",
    "Define": "Opzoeken",
    "Highlight": "Markeren",
    "Highlighted": "Gemarkeerd",
    "Selected text: Explain, Highlight": "Geselecteerde tekst: Uitleggen, Markeren",
    "Selected text: Define, Highlight": "Geselecteerde tekst: Opzoeken, Markeren",
    "Dictionary": "Woordenboek",
    "Meaning": "Betekenis",
    "Parts": "Woorddelen",
    "Simpler": "Eenvoudiger",
    "Show all": "Alles tonen",
    "Show less": "Minder tonen",
    "Word": "Woord",
    "Sentence": "Zin",
    "This sentence": "Deze zin",
    "This word": "Dit woord",
    "Say it": "Uitspreken",
    "Note…": "Notitie…",
    "Read from here": "Hier voorlezen",
    "Look up": "Opzoeken",
    "Word or sentence to look up": "Woord of zin om op te zoeken",
    "A word, or a sentence to explain…": "Een woord, of een zin om uit te leggen…",
    "One word is defined; more words are explained.": "Bij één woord krijg je de betekenis, bij meer woorden uitleg.",
    "Define or explain…": "Opzoeken of uitleggen…",
    /* the Meaning panel */
    "also: {words}": "ook: {words}",
    "Looked up online — not in the offline dictionary.": "Online opgezocht — staat niet in het offline woordenboek.",
    "No definition found.": "Geen betekenis gevonden.",
    "No definition found — you’re offline, so only the built-in dictionary was searched.": "Geen betekenis gevonden — je bent offline, dus alleen het ingebouwde woordenboek is doorzocht.",
    "Looking up “{word}”…": "“{word}” wordt opgezocht…",
    "Getting the dictionary ready — this only happens once.": "Het woordenboek wordt klaargezet — dat gebeurt maar één keer.",
    /* the Parts panel (the kinds and origins are morph.js's words, drawn here) */
    "Look up “{word}”": "“{word}” opzoeken",
    "so: {gloss}": "dus: {gloss}",
    "A guess from the spelling.": "Een gok op basis van de spelling.",
    "prefix": "voorvoegsel",
    "root": "stam",
    "suffix": "achtervoegsel",
    "ending": "uitgang",
    "base": "basiswoord",
    "link": "bindletter",
    "Latin": "Latijn",
    "Greek": "Grieks",
    "Old English": "Oudengels",
    "French": "Frans",
    "Dutch": "Nederlands",
    /* the Explain panel: headings, clause kinds, roles */
    "Style": "Stijl",
    "Nothing to break down here.": "Hier valt niets te ontleden.",
    "1 part": "1 deel",
    "{n} parts": "{n} delen",
    "clause": "bijzin",
    "{label} — “{words}”": "{label} — “{words}”",
    "describes “{words}”": "beschrijft “{words}”",
    "describing clause": "beschrijvende bijzin",
    "“{words}” clause — the thing that…": "bijzin met “{words}” — datgene wat…",
    "joined with “{words}” ({label})": "verbonden met “{words}” ({label})",
    "question": "vraag",
    "instruction": "opdracht",
    "main clause": "hoofdzin",
    "added detail": "extra detail",
    "who / what (receives the action)": "wie / wat (ondergaat de handeling)",
    "what there is": "wat er is",
    "who / what": "wie / wat",
    "{words} (same as before)": "{words} (zelfde als eerder)",
    "{words} (same as the next part)": "{words} (zelfde als het volgende deel)",
    "{words} (= {head})": "{words} (= {head})",
    "what happens to it": "wat ermee gebeurt",
    "did what": "deed wat",
    "{words} (negative)": "{words} (ontkennend)",
    "to whom": "aan wie",
    "what / whom": "wat / wie",
    "is what": "is wat",
    "done by": "gedaan door",
    "Tense: {name} — {note}": "Tijd: {name} — {note}",
    "Expressions": "Uitdrukkingen",
    "In plainer words": "In eenvoudiger woorden",
    "Key words": "Kernwoorden",
    "Reading it…": "Even lezen…",
    "Couldn’t analyse this sentence.": "Kan deze zin niet ontleden.",
    /* the Simpler panel */
    "How plain": "Hoe eenvoudig",
    "Plain": "Eenvoudig",
    "Very plain": "Heel eenvoudig",
    "For a 10-year-old": "Voor een kind van 10",
    "1 word swapped": "1 woord vervangen",
    "{n} words swapped": "{n} woorden vervangen",
    "1 phrase shortened": "1 zinsdeel ingekort",
    "{n} phrases shortened": "{n} zinsdelen ingekort",
    "1 sentence turned active": "1 zin bedrijvend gemaakt",
    "{n} sentences turned active": "{n} zinnen bedrijvend gemaakt",
    "1 sentence split": "1 zin gesplitst",
    "{n} sentences split": "{n} zinnen gesplitst",
    "1 part shortened": "1 deel ingekort",
    "{n} parts shortened": "{n} delen ingekort",
    "1 word explained": "1 woord uitgelegd",
    "{n} words explained": "{n} woorden uitgelegd",
    "nothing to simplify — this is already plain": "niets te vereenvoudigen — dit is al eenvoudig",
    "Making it plainer…": "Even vereenvoudigen…",
    "Couldn’t simplify this.": "Kan dit niet vereenvoudigen.",
    "was: {words}": "origineel: {words}",
    "was “{words}” — {why}": "origineel: “{words}” — {why}",
    /* Settings › Dictionary */
    "Tap a word": "Tikken",
    "Hold only": "Lang drukken",
    "Tap a word for its meaning. Hold on a sentence (or select text) to have it explained — clauses, who did what, tense, idioms and a plainer rewrite, all offline.": "Tik op een woord voor de betekenis. Druk lang op een zin (of selecteer tekst) voor uitleg — zinsdelen, wie wat deed, werkwoordstijd, uitdrukkingen en een eenvoudigere versie, allemaal offline.",
    /* Settings › Translation, and the translation entries of the menu */
    "Translation": "Vertaling",
    "Into": "Naar",
    "From": "Van",
    "Automatic · {lang}": "Automatisch · {lang}",
    "Auto-detect": "Automatisch herkennen",
    "Automatic: a book in another language is translated into {lang}, your device’s language. A book already in {lang} shows no translation when you tap a word; Translate book turns it into {other}.": "Automatisch: een boek in een andere taal wordt vertaald naar het {lang}, de taal van je apparaat. Bij een boek dat al in het {lang} is, zie je geen vertaling als je op een woord tikt; Boek vertalen zet het om naar het {other}.",
    "Dutch ↔ English": "Nederlands ↔ Engels",
    "Dutch ↔ English (≈ 50 MB, once)": "Nederlands ↔ Engels (≈ 50 MB, eenmalig)",
    "Downloading Dutch ↔ English": "Nederlands ↔ Engels wordt gedownload",
    "Translated book": "Vertaald boek",
    "Translation only": "Alleen vertaling",
    "Both": "Beide",
    "Translate book (in the menu) translates the whole book. Translation only shows the translation in place of the original — tap or hold a paragraph to see its original; Both shows the translation under each paragraph. Read aloud reads the original, so choose Both to follow it.": "Boek vertalen (in het menu) vertaalt het hele boek. Alleen vertaling toont de vertaling in plaats van het origineel — tik op een alinea of druk er lang op om het origineel te zien; Beide toont de vertaling onder elke alinea. Voorlezen leest het origineel voor, dus kies Beide om mee te lezen.",
    "Tap a word or select a sentence and its translation is in the card.": "Tik op een woord of selecteer een zin, en de vertaling staat in de kaart.",
    "Couldn’t load the translator.": "Kan de vertaler niet laden.",
    "Translate the rest": "De rest vertalen",
    "Show original": "Origineel tonen",
    "Translate book…": "Boek vertalen…",
    "Show translation only": "Alleen vertaling tonen",
    /* the languages of Translation (Intl.DisplayNames names them; these are for browsers without it) */
    "Spanish": "Spaans",
    "German": "Duits",
    "Italian": "Italiaans",
    "Portuguese": "Portugees",
    "Swedish": "Zweeds",
    "Danish": "Deens",
    "Norwegian": "Noors",
    "Finnish": "Fins",
    "Polish": "Pools",
    "Czech": "Tsjechisch",
    "Slovak": "Slowaaks",
    "Hungarian": "Hongaars",
    "Romanian": "Roemeens",
    "Turkish": "Turks",
    "Russian": "Russisch",
    "Ukrainian": "Oekraïens",
    "Arabic": "Arabisch",
    "Hebrew": "Hebreeuws",
    "Persian": "Perzisch",
    "Hindi": "Hindi",
    "Bengali": "Bengaals",
    "Urdu": "Urdu",
    "Indonesian": "Indonesisch",
    "Malay": "Maleis",
    "Vietnamese": "Vietnamees",
    "Thai": "Thai",
    "Chinese (Simplified)": "Chinees (vereenvoudigd)",
    "Chinese (Traditional)": "Chinees (traditioneel)",
    "Japanese": "Japans",
    "Korean": "Koreaans",
    "Swahili": "Swahili",
    "Catalan": "Catalaans",
    "English": "Engels",
    /* the offer of a new version */
    "A new version of Lamplight is ready.": "Er is een nieuwe versie van Lamplight.",
    "Reload": "Opnieuw laden",
    "Later": "Later"
  });

  /* ==== 6. audiobook.js ==== */
  add({
    /* the unnamed speakers attribute() makes, and the genders, as the Cast panel shows them */
    "He": "Hij",
    "She": "Zij",
    "They": "Zij (meervoud)",
    "Another voice": "Een andere stem",
    "Unknown speaker": "Onbekende spreker",
    "male": "man",
    "female": "vrouw",
    "man": "man",
    "woman": "vrouw",
    /* ElevenLabs: the key, the voice list, the errors, the counter */
    "Paste an ElevenLabs API key to read aloud with ElevenLabs voices.\n\nIt is stored only on this device and is sent only to api.elevenlabs.io while reading. Leave blank to remove it.":
      "Plak een ElevenLabs-API-sleutel om voor te lezen met stemmen van ElevenLabs.\n\nDe sleutel wordt alleen op dit apparaat bewaard en alleen tijdens het voorlezen naar api.elevenlabs.io gestuurd. Laat het veld leeg om hem te verwijderen.",
    "ElevenLabs credits are used up": "Je ElevenLabs-tegoed is op",
    "ElevenLabs rejected the key": "ElevenLabs heeft de sleutel geweigerd",
    "ElevenLabs is busy — try again in a moment": "ElevenLabs is bezet — probeer het zo nog eens",
    "ElevenLabs: {error}": "ElevenLabs: {error}",
    "error {n}": "fout {n}",
    "error": "fout",
    "Add an ElevenLabs API key first": "Voeg eerst een ElevenLabs-API-sleutel toe",
    "Add an ElevenLabs API key first.": "Voeg eerst een ElevenLabs-API-sleutel toe.",
    "No ElevenLabs voices found": "Geen ElevenLabs-stemmen gevonden",
    "Couldn’t reach ElevenLabs": "Kan ElevenLabs niet bereiken",
    "ElevenLabs needs a connection": "ElevenLabs heeft een verbinding nodig",
    "ElevenLabs sent no audio": "ElevenLabs heeft geen audio gestuurd",
    "ElevenLabs request failed": "Verzoek aan ElevenLabs mislukt",
    "Offline — no ElevenLabs audio cached from here": "Offline — vanaf hier is geen ElevenLabs-audio bewaard",
    "Female voices": "Vrouwenstemmen",
    "Male voices": "Mannenstemmen",
    "Other voices": "Andere stemmen",
    "Loading voices…": "Stemmen laden…",
    "No voices": "Geen stemmen",
    "Voices unavailable": "Stemmen niet beschikbaar",
    "Change the ElevenLabs API key…": "ElevenLabs-API-sleutel wijzigen…",
    "ElevenLabs narration": "ElevenLabs-vertelling",
    "≈{n} chars sent": "≈{n} tekens verstuurd",
    "Fetching…": "Ophalen…",
    /* the audio kept on the device */
    "{n} MB": "{n} MB",
    "Audio kept on this device: {size}": "Audio bewaard op dit apparaat: {size}",
    "Cached audio cleared": "Bewaarde audio gewist",
    "Couldn’t clear the audio": "Kan de audio niet wissen",
    /* the natural voices: Fast (Piper) and Best (Kokoro) */
    "Fast": "Snel",
    "Best": "Beste",
    "American": "Amerikaans",
    "British": "Brits",
    "{name} (woman)": "{name} (vrouw)",
    "{name} (man)": "{name} (man)",
    "Natural voice": "Natuurlijke stem",
    "Generating…": "Aanmaken…",
    "Natural voices speak English only; a text in another language is read by the device voice": "Natuurlijke stemmen spreken alleen Engels; een tekst in een andere taal leest de stem van je apparaat voor",
    "Natural voices are made on this device: the first sentence can take a minute on a phone, then it keeps reading": "Natuurlijke stemmen worden op dit apparaat gemaakt: de eerste zin kan op een telefoon een minuut duren, daarna gaat het vlot",
    "Natural voices are made on this device; the first sentence takes a few seconds.": "Natuurlijke stemmen worden op dit apparaat gemaakt; de eerste zin duurt een paar seconden.",
    "Natural voices couldn’t start (no response from the voice engine)": "De natuurlijke stemmen konden niet starten (geen reactie van de spraaksoftware)",
    "Natural voices need a connection to download": "Om de natuurlijke stemmen te downloaden heb je een verbinding nodig",
    "Natural voices: {error}": "Natuurlijke stemmen: {error}",
    "Couldn’t load the natural voices": "Kan de natuurlijke stemmen niet laden",
    "Natural voices couldn’t start in this browser": "De natuurlijke stemmen kunnen in deze browser niet starten",
    "Downloading voices {pct}%…": "Stemmen downloaden {pct}%…",
    "Downloading… {pct}%": "Downloaden… {pct}%",
    "Offline — this natural voice isn’t on the device yet": "Offline — deze natuurlijke stem staat nog niet op het apparaat",
    "Natural voices couldn’t make the audio": "De natuurlijke stemmen konden de audio niet maken",
    "Connect to the internet once to download the natural voices": "Maak één keer verbinding met internet om de natuurlijke stemmen te downloaden",
    "Natural voices are ready": "De natuurlijke stemmen zijn klaar",
    "Couldn’t download the natural voices": "Kan de natuurlijke stemmen niet downloaden",
    "Remove the {label} natural voices from this device (≈ {mb} MB)? They can be downloaded again.": "De natuurlijke stemmen ({label}) van dit apparaat verwijderen (≈ {mb} MB)? Je kunt ze later opnieuw downloaden.",
    "Natural voices were removed": "De natuurlijke stemmen zijn verwijderd",
    "Natural voices removed": "Natuurlijke stemmen verwijderd",
    "Natural voices speak English only — the device voice reads this {lang} text": "Natuurlijke stemmen spreken alleen Engels — de stem van je apparaat leest deze tekst in het {lang} voor",
    "Natural voices aren’t downloaded yet — the device voice reads until you’re online": "De natuurlijke stemmen zijn nog niet gedownload — de stem van je apparaat leest voor tot je online bent",
    "Download the {label} natural voices to this device (≈ {mb} MB, once)? Use Wi-Fi if you can. Until then the device voice reads.": "De natuurlijke stemmen ({label}) naar dit apparaat downloaden (≈ {mb} MB, eenmalig)? Gebruik liefst wifi. Tot die tijd leest de stem van je apparaat voor.",
    "The device voice reads. The natural voices can be downloaded in the Voices panel.": "De stem van je apparaat leest voor. Je kunt de natuurlijke stemmen downloaden in het paneel Voorleesstemmen.",
    "Ready · {size} on this device": "Klaar · {size} op dit apparaat",
    "Almost ready — the voice engine still needs a connection once": "Bijna klaar — de spraaksoftware heeft nog één keer een verbinding nodig",
    "Not ready — the voice engine needs a connection once": "Niet klaar — de spraaksoftware heeft één keer een verbinding nodig",
    "Not on this device yet": "Nog niet op dit apparaat",
    "Not on this device yet — needs a connection once": "Nog niet op dit apparaat — heeft één keer een verbinding nodig",
    "the {label} voices are here too ({size})": "ook op dit apparaat: {label} ({size})",
    /* the Dutch voices of Fast (a pack of their own, for Dutch books); Best stays English only */
    "Dutch voices": "Nederlandse stemmen",
    "Dutch voices (≈ {mb} MB)": "Nederlandse stemmen (≈ {mb} MB)",
    "Download Dutch voices (≈ {mb} MB, once)": "Nederlandse stemmen downloaden (≈ {mb} MB, eenmalig)",
    "Download the Dutch voices to this device (≈ {mb} MB, once)? Use Wi-Fi if you can. Until then the device voice reads.": "De Nederlandse stemmen naar dit apparaat downloaden (≈ {mb} MB, eenmalig)? Gebruik liefst wifi. Tot die tijd leest de stem van je apparaat voor.",
    "The Dutch voices are ready": "De Nederlandse stemmen zijn klaar",
    "Remove the Dutch voices from this device (≈ {mb} MB)? They can be downloaded again.": "De Nederlandse stemmen van dit apparaat verwijderen (≈ {mb} MB)? Je kunt ze later opnieuw downloaden.",
    "Dutch voices removed": "Nederlandse stemmen verwijderd",
    "the Dutch voices are here too ({size})": "ook op dit apparaat: Nederlandse stemmen ({size})",
    "the English voices are here too ({size})": "ook op dit apparaat: Engelse stemmen ({size})",
    "English only — Fast has Dutch voices": "alleen Engels — Snel heeft Nederlandse stemmen",
    "The Best natural voices speak English only; choose Fast for Dutch voices": "De natuurlijke stemmen van Beste spreken alleen Engels; kies Snel voor Nederlandse stemmen",
    "The Best natural voices speak English only — choose Fast for Dutch voices": "De natuurlijke stemmen van Beste spreken alleen Engels — kies Snel voor Nederlandse stemmen",
    "The Best natural voices speak English only — choose Fast for Dutch voices. The device voice reads this time.": "De natuurlijke stemmen van Beste spreken alleen Engels — kies Snel voor Nederlandse stemmen. Deze keer leest de stem van je apparaat voor.",
    "The Fast natural voices speak English and Dutch; a text in another language is read by the device voice": "De natuurlijke stemmen van Snel spreken Engels en Nederlands; een tekst in een andere taal leest de stem van je apparaat voor",
    "The Fast natural voices speak English and Dutch — the device voice reads this {lang} text": "De natuurlijke stemmen van Snel spreken Engels en Nederlands — de stem van je apparaat leest deze tekst in het {lang} voor",
    "The Fast natural voices speak English and Dutch, and this text is in {lang}": "De natuurlijke stemmen van Snel spreken Engels en Nederlands, en deze tekst is in het {lang}",
    /* playback, the smart start, Prepare book */
    "not ready": "niet klaar",
    "Couldn’t play the audio ({error})": "Kan de audio niet afspelen ({error})",
    "Couldn’t play the audio": "Kan de audio niet afspelen",
    "This phone makes speech slower than it reads. Tap Prepare book in the Voices panel for no pauses.": "Deze telefoon maakt de spraak niet snel genoeg. Tik op Boek voorbereiden in het paneel Voorleesstemmen om zonder pauzes te luisteren.",
    "Starts in {time}, then no pauses": "Begint over {time}, daarna zonder pauzes",
    "Start now": "Nu starten",
    "Start reading this PDF aloud, then prepare it (the pages loaded so far)": "Start eerst het voorlezen van deze PDF en bereid hem dan voor (de pagina’s die al geladen zijn)",
    "Natural voices speak English only, and this text is in {lang}": "Natuurlijke stemmen spreken alleen Engels, en deze tekst is in het {lang}",
    "Stop preparing": "Voorbereiden stoppen",
    "Audiobook ready · plays with no pauses, offline": "Luisterboek klaar · speelt zonder pauzes, offline",
    "Audiobook: {pct}% ready": "Luisterboek: {pct}% klaar",
    "the {size} kept for audio is full, the rest is made as you listen": "de {size} voor audio is vol, de rest wordt gemaakt terwijl je luistert",
    "about {part} of its {whole} fits on this device": "ongeveer {part} van de {whole} past op dit apparaat",
    /* the Cast panel (Voices for characters) */
    "Voices for characters": "Stemmen per personage",
    "Start reading aloud first to find who speaks on these pages.": "Start eerst het voorlezen om te zien wie er op deze pagina’s spreekt.",
    "Open a book first.": "Open eerst een boek.",
    "Finding who speaks…": "Uitzoeken wie er spreekt…",
    "everything outside the quotes": "alles buiten de aanhalingstekens",
    "Voice for the narrator": "Stem voor de verteller",
    "Voice for {name}": "Stem voor {name}",
    "Pitch for {name}": "Toonhoogte voor {name}",
    "Dialogue voice": "Dialoogstem",
    "{n} line": "{n} citaat",
    "{n} lines": "{n} citaten",
    "No dialogue found — the narrator reads everything.": "Geen dialogen gevonden — de verteller leest alles voor.",
    "Speakers are worked out on this device from the quoted lines, speech tags (“said Anna”, “he whispered”), who acts beside a line and who takes turns; the unnamed ones get voices of their own too. A change applies from the next sentence.":
      "Wie er spreekt, wordt op dit apparaat afgeleid uit de citaten, de woorden eromheen (“said Anna”, “he whispered”), wie iets doet naast een zin en wie om de beurt spreekt; ook de naamloze sprekers krijgen een eigen stem. Een wijziging geldt vanaf de volgende zin.",
    "Read aloud isn’t available in this browser.": "Voorlezen is niet beschikbaar in deze browser.",
    "Turn on “A voice per character” in Read-aloud voices first.": "Zet eerst “Een stem per personage” aan in Voorleesstemmen.",
    "Couldn’t work out who speaks": "Kan niet bepalen wie er spreekt",
    "Who’s who…": "Wie is wie…",
    /* Who's who */
    "{section} · page {n}": "{section} · pagina {n}",
    "Couldn’t read this document": "Kan dit document niet lezen",
    "Reading page {n} of {total}…": "Pagina {n} van {total} lezen…",
    "No characters yet": "Nog geen personages",
    "No speaking characters found in this document.": "Geen sprekende personages gevonden in dit document.",
    "{n} character": "{n} personage",
    "{n} characters": "{n} personages",
    "{chars} · pages 1–{upto}": "{chars} · pagina’s 1–{upto}",
    "{chars} · pages 1–{upto} of {of} (the pages loaded so far)": "{chars} · pagina’s 1–{upto} van {of} (de pagina’s die al geladen zijn)",
    "mentioned {n} time": "{n} keer genoemd",
    "mentioned {n} times": "{n} keer genoemd",
    "First appears: {where}": "Eerste optreden: {where}",
    "Also: {names}": "Ook: {names}",
    "First appearance": "Eerste optreden",
    "First appearance · {where}": "Eerste optreden · {where}",
    "Show all {n} lines": "Alle {n} citaten tonen",
    "Start reading aloud to choose a voice for each character.": "Start het voorlezen om voor elk personage een stem te kiezen.",
    "Worked out on this device from the quoted lines, speech tags, who acts beside a line and who takes turns; it can be wrong now and then.": "Op dit apparaat afgeleid uit de citaten, de woorden eromheen, wie iets doet naast een zin en wie om de beurt spreekt; het kan af en toe misgaan."
  });

  /* ==== 7. translate.js, sounds.js, and the labels of explain.js and morph.js ==== */
  add({
    /* --- translate.js: the card's translation line --- */
    "{lang} · translated on this device (Dutch ↔ English pack)": "{lang} · vertaald op dit apparaat (pakket Nederlands ↔ Engels)",
    "{lang} · translated on-device": "{lang} · vertaald op het apparaat",
    "{lang} · translated by MyMemory (free web service)": "{lang} · vertaald door MyMemory (gratis webdienst)",
    "{lang} · translated {how}": "{lang} · vertaald {how}",
    "translating…": "vertalen…",
    "Couldn’t translate ({error}).": "Vertalen is niet gelukt ({error}).",
    "Try again": "Opnieuw proberen",
    "no connection": "geen verbinding",
    "no translation": "geen vertaling",
    "MyMemory replied {status}": "MyMemory antwoordde met {status}",
    "Couldn’t reach a translator — download Dutch ↔ English under Translation in the settings to translate on this device.": "Geen vertaler bereikbaar — download Nederlands ↔ Engels onder Vertaling in de instellingen om op dit apparaat te vertalen.",
    "Offline — download Dutch ↔ English under Translation in the settings to translate without a connection.": "Offline — download Nederlands ↔ Engels onder Vertaling in de instellingen om zonder verbinding te vertalen.",
    "Nothing here can translate this — use Chrome or Edge for the built-in translator.": "Hier is geen vertaler beschikbaar — gebruik Chrome of Edge voor de ingebouwde vertaler.",
    "Offline — only cached translations are available.": "Offline — alleen bewaarde vertalingen zijn beschikbaar.",
    /* the pack offered in the card, once */
    "Download Dutch ↔ English for instant offline translation (≈ {mb} MB, once).": "Download Nederlands ↔ Engels om direct en offline te vertalen (≈ {mb} MB, eenmalig).",
    "Download": "Downloaden",
    "Downloading Dutch ↔ English…": "Nederlands ↔ Engels wordt gedownload…",
    "Dutch ↔ English is ready — instant, and offline.": "Nederlands ↔ Engels is klaar — vertaalt direct, ook offline.",
    "The download stopped ({error}).": "Het downloaden is gestopt ({error}).",
    /* --- Settings › Translation: the status line and the pack's row --- */
    "The Dutch ↔ English pack and the built-in translator run on your device and send nothing anywhere; the pack is downloaded once from this site. MyMemory, a free web service, receives the word or sentence you tap when neither of them can translate it.": "Het pakket Nederlands ↔ Engels en de ingebouwde vertaler werken op je apparaat en sturen niets door; het pakket download je één keer van deze site. MyMemory, een gratis webdienst, krijgt het woord of de zin waarop je tikt als geen van beide die kan vertalen.",
    "{lang} · Dutch ↔ English pack ready — instant and offline": "{lang} · pakket Nederlands ↔ Engels klaar — direct en offline",
    "{lang} · built-in translator ready": "{lang} · ingebouwde vertaler klaar",
    "{lang} · words and sentences via MyMemory; download Dutch ↔ English below for whole books, offline": "{lang} · woorden en zinnen via MyMemory; download hieronder Nederlands ↔ Engels voor hele boeken, offline",
    "{lang} · offline — only cached translations; download Dutch ↔ English below once you are online": "{lang} · offline — alleen bewaarde vertalingen; download hieronder Nederlands ↔ Engels zodra je online bent",
    "{lang} · built-in translator needs a download (about 30 MB) — Translate book starts it; words meanwhile via MyMemory": "{lang} · de ingebouwde vertaler moet eerst downloaden (ongeveer 30 MB) — Boek vertalen start dat; woorden gaan intussen via MyMemory",
    "{lang} · words and sentences via MyMemory; use Chrome / Edge for whole documents": "{lang} · woorden en zinnen via MyMemory; gebruik Chrome / Edge voor hele documenten",
    "{lang} · offline — only cached translations": "{lang} · offline — alleen bewaarde vertalingen",
    "{n} MB": "{n} MB",
    "Dutch ↔ English: this browser can’t run the pack (it needs WebAssembly SIMD — Chrome, Edge, Firefox or Safari 16.4 and newer)": "Nederlands ↔ Engels: deze browser kan het pakket niet gebruiken (het heeft WebAssembly SIMD nodig — Chrome, Edge, Firefox of Safari 16.4 en nieuwer)",
    "Downloading Dutch ↔ English (≈ {mb} MB)…": "Nederlands ↔ Engels wordt gedownload (≈ {mb} MB)…",
    "Dutch ↔ English: on this device, but it couldn’t run here ({error}) — the other translators stand in": "Nederlands ↔ Engels: staat op dit apparaat, maar werkt hier niet ({error}) — de andere vertalers nemen het over",
    "Dutch ↔ English · ready, works offline · {size} on this device": "Nederlands ↔ Engels · klaar, werkt offline · {size} op dit apparaat",
    "Dutch ↔ English: the download stopped ({error}) — try again": "Nederlands ↔ Engels: het downloaden is gestopt ({error}) — probeer het opnieuw",
    "Dutch ↔ English: not on this device yet": "Nederlands ↔ Engels: nog niet op dit apparaat",
    "Dutch ↔ English: not on this device yet — needs a connection once": "Nederlands ↔ Engels: nog niet op dit apparaat — eenmalig een verbinding nodig",
    "Dutch ↔ English is on this device — translations are instant, and work offline": "Nederlands ↔ Engels staat op dit apparaat — vertalingen zijn er meteen, ook offline",
    "Dutch ↔ English didn’t download — {error}": "Nederlands ↔ Engels is niet gedownload — {error}",
    "Dutch ↔ English removed from this device": "Nederlands ↔ Engels van dit apparaat verwijderd",
    /* the pack's reasons, shown in the lines above */
    "couldn’t start": "kon niet starten",
    "couldn’t start ({error})": "kon niet starten ({error})",
    "worker error": "fout in de vertaalmodule",
    "couldn’t run": "werkt hier niet",
    "the download failed": "het downloaden is mislukt",
    "couldn’t download {file} ({status})": "kon {file} niet downloaden ({status})",
    "the download of {file} was cut short": "het downloaden van {file} is afgebroken",
    "this browser can’t keep the pack (no Cache Storage)": "deze browser kan het pakket niet bewaren (geen Cache Storage)",
    "this browser can’t run the pack": "deze browser kan het pakket niet gebruiken",
    "the pack was removed": "het pakket is verwijderd",
    /* --- Translate book: the pill, the toasts --- */
    "couldn’t translate": "niet vertaald",
    "less than a minute left": "nog minder dan een minuut",
    "about {n} min left": "nog ongeveer {n} min",
    "about {h} h {m} min left": "nog ongeveer {h} u {m} min",
    "about {h} h left": "nog ongeveer {h} u",
    "Downloading the {lang} translator… {pct} %": "Vertaler voor het {lang} wordt gedownload… {pct} %",
    "Translating… {pct} % · {left}": "Vertalen… {pct} % · {left}",
    "Translating… {pct} %": "Vertalen… {pct} %",
    "Translation {pct} % done": "Vertaling {pct} % klaar",
    "{done} of {total} paragraphs translated": "{done} van {total} alinea’s vertaald",
    "This document is already in {lang}.": "Dit document is al in het {lang}.",
    "Nothing to translate here.": "Hier valt niets te vertalen.",
    "Translated into {lang} — from the cache": "Vertaald naar het {lang} — uit de bewaarde vertaling",
    "No translator for the rest — see Translation in the settings": "Geen vertaler voor de rest — zie Vertaling in de instellingen",
    "Offline — showing the cached translation": "Offline — de bewaarde vertaling wordt getoond",
    "Download Dutch ↔ English to translate this book on this device": "Download Nederlands ↔ Engels om dit boek op dit apparaat te vertalen",
    "Translating into {lang}…": "Vertalen naar het {lang}…",
    "stopped": "gestopt",
    "Translation paused — the Dutch ↔ English pack couldn’t run here ({error})": "Vertaling gepauzeerd — het pakket Nederlands ↔ Engels werkt hier niet ({error})",
    "Translation paused — no connection": "Vertaling gepauzeerd — geen verbinding",
    "Translation paused — {error}": "Vertaling gepauzeerd — {error}",
    "Translation paused — something went wrong": "Vertaling gepauzeerd — er ging iets mis",
    "Translation paused — what arrived stays; Translate the rest carries on": "Vertaling gepauzeerd — wat al vertaald is, blijft staan; met De rest vertalen ga je verder",
    "Translated into {lang} · 1 block couldn’t be translated": "Vertaald naar het {lang} · 1 alinea kon niet worden vertaald",
    "Translated into {lang} · {n} blocks couldn’t be translated": "Vertaald naar het {lang} · {n} alinea’s konden niet worden vertaald",
    "Translated into {lang}": "Vertaald naar het {lang}",
    "Translate works on text documents; PDFs are not translated yet.": "Vertalen werkt bij tekstdocumenten; PDF’s worden nog niet vertaald.",

    /* --- sounds.js: the background sounds panel --- */
    "Background sounds": "Achtergrondgeluiden",
    "Rain": "Regen",
    "Fire": "Haardvuur",
    "Café": "Café",
    "Forest night": "Bos bij nacht",
    "Waves": "Golven",
    /* the same names inside a sentence */
    "sound|Rain": "regen",
    "sound|Fire": "haardvuur",
    "sound|Café": "café",
    "sound|Forest night": "bos bij nacht",
    "sound|Waves": "golven",
    "{a} and {b}": "{a} en {b}",
    "Off — the switch plays {list} again.": "Uit — de schakelaar zet {list} weer aan.",
    "Off — tap a sound to start it.": "Uit — tik op een geluid om het te starten.",
    "{list} — plays while a book is open.": "{list} — te horen zolang er een boek open is.",
    "{list} — tap anywhere to start the sound.": "{list} — tik ergens om het geluid te starten.",
    "{list} is playing.": "{list} klinkt nu.",
    "{list} are playing.": "{list} klinken nu.",
    "Play background sounds": "Achtergrondgeluiden afspelen",
    "Sounds: tap to add or take out": "Geluiden: tik om toe te voegen of weg te halen",
    "Volume": "Volume",
    "Mix": "Mix",
    "How loud each sound is": "Hoe hard elk geluid klinkt",
    "off": "uit",
    "Tap a sound to start it, or to add it to what is playing; tap it again to take it out. Mix sets how loud each one is.": "Tik op een geluid om het te starten of toe te voegen aan wat er klinkt; tik er nog eens op om het weg te halen. Bij Mix stel je in hoe hard elk geluid klinkt.",
    "Made on this device as they play — no recordings, nothing to download. They play while a book is open, under read aloud too, and pause when you leave the page.": "Ze worden tijdens het afspelen op dit apparaat gemaakt — geen opnames, niets te downloaden. Ze spelen zolang er een boek open is, ook onder het voorlezen, en pauzeren als je de pagina verlaat.",
    "This browser can’t play sounds made on the device": "Deze browser kan geen geluiden afspelen die op het apparaat worden gemaakt",

    /* --- explain.js, drawn in the card's Explain panel (app.js: kindLabel, renderExplain, renderStyle) --- */
    /* what a joining word or a clause adds */
    "reason": "reden",
    "reason / time": "reden / tijd",
    "contrast": "tegenstelling",
    "time / contrast": "tijd / tegenstelling",
    "time": "tijd",
    "condition": "voorwaarde",
    "place": "plaats",
    "alternative": "alternatief",
    "purpose": "doel",
    "comparison": "vergelijking",
    "result": "gevolg",
    "manner": "manier",
    "addition": "toevoeging",
    "sub": "bijzin",
    /* a reported clause without "that": what is said, thought, … */
    "what is said": "wat er gezegd wordt",
    "what is thought": "wat er gedacht wordt",
    "what is known": "wat bekend is",
    "what is believed": "wat er geloofd wordt",
    "what is hoped": "wat er gehoopt wordt",
    "what is felt": "wat er gevoeld wordt",
    "what is suggested": "wat er voorgesteld wordt",
    "what is claimed": "wat er beweerd wordt",
    "what is admited": "wat er toegegeven wordt",
    "what is admitted": "wat er toegegeven wordt",
    "what is explained": "wat er uitgelegd wordt",
    "what is insisted": "waarop aangedrongen wordt",
    "what is remembered": "wat er onthouden wordt",
    "what is realised": "wat er beseft wordt",
    "what is realized": "wat er beseft wordt",
    "what is understood": "wat er begrepen wordt",
    "what is noticed": "wat er opgemerkt wordt",
    "what is heard": "wat er gehoord wordt",
    "what is decided": "wat er besloten wordt",
    "what is wished": "wat er gewenst wordt",
    "what is meant": "wat er bedoeld wordt",
    "what is promised": "wat er beloofd wordt",
    "what is feared": "wat er gevreesd wordt",
    "what is supposed": "wat er verondersteld wordt",
    "what is guessed": "wat er geraden wordt",
    "what is imagined": "wat men zich voorstelt",
    "what is agreed": "wat er afgesproken wordt",
    "what is argued": "wat er betoogd wordt",
    "what is replied": "wat er geantwoord wordt",
    "what is doubted": "wat er betwijfeld wordt",
    "what is assumed": "wat er aangenomen wordt",
    "what is expected": "wat er verwacht wordt",
    "what is learnt": "wat er geleerd wordt",
    "what is learned": "wat er geleerd wordt",
    "what is discovered": "wat er ontdekt wordt",
    "what is forgotten": "wat er vergeten wordt",
    "what is bet": "waarop gewed wordt",
    "what is reckoned": "wat er geschat wordt",
    "what is sworn": "wat er gezworen wordt",
    "what is pretended": "wat er voorgewend wordt",
    /* the extra parts of a clause */
    "when": "wanneer",
    "how": "hoe",
    "where": "waar",
    "detail": "detail",
    "in order to / what": "om te / wat",
    "doing": "bezig met",
    "how / what": "hoe / wat",
    "also": "ook",
    "to / for whom": "aan / voor wie",
    "for what": "waarvoor",
    "where to": "waarheen",
    "with whom": "met wie",
    "with what": "waarmee",
    "by whom": "door wie",
    "about what": "waarover",
    "like what": "zoals wat",
    "setting": "omstandigheid",
    "aside": "terzijde",
    "opener": "inleiding",
    /* tenses (app.js: tenseName, tenseNote) */
    "{tense}, passive voice": "{tense}, lijdende vorm",
    "imperative": "gebiedende wijs",
    "perfect participle (having + -ed)": "voltooide deelwoordvorm (having + -ed)",
    "future": "toekomende tijd",
    "future perfect": "voltooid toekomende tijd",
    "future continuous": "toekomende tijd, duurvorm",
    "future (“going to”)": "toekomende tijd (“going to”)",
    "modal “{word}”": "modaal werkwoord “{word}”",
    "modal “{word}” + perfect": "modaal werkwoord “{word}” + voltooid",
    "modal “{word}” + continuous": "modaal werkwoord “{word}” + duurvorm",
    "present simple": "tegenwoordige tijd",
    "past simple": "verleden tijd",
    "present continuous": "tegenwoordige tijd, duurvorm",
    "past continuous": "verleden tijd, duurvorm",
    "present perfect": "voltooid tegenwoordige tijd",
    "past perfect": "voltooid verleden tijd",
    "present perfect continuous": "voltooid tegenwoordige tijd, duurvorm",
    "past perfect continuous": "voltooid verleden tijd, duurvorm",
    "participle (-ing)": "onvoltooid deelwoord (-ing)",
    "participle (-ed)": "voltooid deelwoord (-ed)",
    "past habit (“used to”)": "gewoonte in het verleden (“used to”)",
    "an instruction, request or wish": "een opdracht, verzoek of wens",
    "done before the main action of the sentence": "gedaan vóór de hoofdhandeling van de zin",
    "will already be finished by a later point": "is op een later moment al klaar",
    "will be going on at a future moment": "is op een moment in de toekomst aan de gang",
    "something that is going to happen": "iets wat gaat gebeuren",
    "imagined, polite, or a repeated past action": "ingebeeld, beleefd, of een herhaalde handeling in het verleden",
    "ability or possibility": "kunnen of mogelijkheid",
    "advice, duty or expectation": "advies, plicht of verwachting",
    "a possibility": "een mogelijkheid",
    "possibility or permission": "mogelijkheid of toestemming",
    "necessity or a firm conclusion": "noodzaak of een stellige conclusie",
    "ability or permission": "kunnen of toestemming",
    "duty or expectation": "plicht of verwachting",
    "a modal shade of meaning": "een modale betekenisnuance",
    "{meaning} — looking back at something that did not, or may not, happen": "{meaning} — terugblik op iets wat niet, of misschien niet, is gebeurd",
    "had been going on for a while before another past moment": "was al een tijd aan de gang vóór een ander moment in het verleden",
    "started in the past and is still going on": "begon in het verleden en is nog steeds aan de gang",
    "finished before another moment in the past": "was klaar vóór een ander moment in het verleden",
    "happened before now and still matters now": "gebeurde eerder en doet er nu nog toe",
    "was in progress at that past moment": "was op dat moment in het verleden aan de gang",
    "is happening now or around now": "gebeurt nu of rond deze tijd",
    "a finished past event": "een afgeronde gebeurtenis in het verleden",
    "a general fact or regular event": "een algemeen feit of iets wat geregeld gebeurt",
    "a general fact, habit or present state": "een algemeen feit, een gewoonte of een toestand nu",
    "a state in the past": "een toestand in het verleden",
    "a state now": "een toestand nu",
    "possession in the past": "bezit in het verleden",
    "possession now": "bezit nu",
    "an action going on alongside the main one": "een handeling die tegelijk met de hoofdhandeling gebeurt",
    "describes the subject as affected by this action": "beschrijft het onderwerp als iets wat deze handeling ondergaat",
    "happened regularly in the past, but not any more": "gebeurde vroeger geregeld, maar nu niet meer",
    "a plan, or something about to happen": "een plan, of iets wat zo gaat gebeuren",
    /* expressions */
    "phrasal verb": "werkwoordcombinatie",
    "idiom": "uitdrukking",
    "possible idiom": "misschien een uitdrukking",
    "expression": "vaste combinatie",
    "compound term": "samenstelling",
    /* style: the register and the figures of speech (the notes are put together in explain.js) */
    "archaic": "ouderwets",
    "spoken": "spreektaal",
    "formal": "formeel",
    "literary": "literair",
    "neutral": "neutraal",
    "simile": "vergelijking",
    "metaphor": "metafoor",
    "personification": "personificatie",
    "hyperbole": "overdrijving",
    "compares {a} to {b}": "vergelijkt {a} met {b}",
    "says one thing is another to suggest a likeness": "noemt het ene het andere om een overeenkomst te suggereren",
    "gives a human action to a thing": "laat een ding iets menselijks doen",
    "exaggerates for effect": "overdrijft voor het effect",
    "an idiom — it means {meaning}": "een uitdrukking — het betekent {meaning}",
    "a set phrase with a meaning of its own": "een vaste uitdrukking met een eigen betekenis",
    "Archaic — {list}": "Ouderwets — {list}",
    "-eth verbs": "werkwoorden op -eth",
    "Spoken — {list}": "Spreektaal — {list}",
    "contractions": "samentrekkingen",
    "everyday fillers": "stopwoordjes",
    "an everyday filler": "een stopwoordje",
    "a question tag": "een vraagstaartje",
    "Formal — {list}": "Formeel — {list}",
    "no contractions": "geen samentrekkingen",
    "a passive": "een lijdende vorm",
    "nouns built from verbs": "zelfstandige naamwoorden van werkwoorden",
    "long Latin-based words": "lange woorden uit het Latijn",
    "“shall” or “one must”": "“shall” of “one must”",
    "Literary — {figure} and a written turn of phrase": "Literair — {figure} en een schrijftalige wending",
    "Literary — clauses joined by a semicolon or a dash": "Literair — zinsdelen verbonden door een puntkomma of een gedachtestreepje",
    "Neutral — everyday written English": "Neutraal — gewoon geschreven Engels",
    /* the simplifier's reasons (“was … — {why}”) */
    "rarer word": "zeldzaam woord",
    "shorter phrase": "korter gezegd",
    "connector": "verbindingswoord",
    "abbreviation": "afkorting",
    "passive to active": "van lijdend naar bedrijvend",
    "split long sentence": "lange zin gesplitst",
    "shortened": "ingekort",
    "aside removed": "uitweiding weggelaten",
    "glossed": "uitgelegd",

    /* --- morph.js, drawn in the card's Parts panel (the kinds and origins are in section 5) --- */
    "joins the parts": "verbindt de delen"
  });

  /* ==== 8. the review: additions ==== */
  add({
    "pos|noun": "zelfstandig naamwoord",
    "pos|verb": "werkwoord",
    "pos|adjective": "bijvoeglijk naamwoord",
    "pos|adverb": "bijwoord",
    "pos|interjection": "tussenwerpsel",
    "pos|phrase": "uitdrukking",
    "pos|preposition": "voorzetsel",
    "pos|pronoun": "voornaamwoord",
    "pos|conjunction": "voegwoord",
    "pos|determiner": "lidwoord",
    "pos|article": "lidwoord",
    "pos|numeral": "telwoord",
    "pos|number": "telwoord",
    "pos|exclamation": "uitroep",
    "pos|abbreviation": "afkorting",
    "pos|prefix": "voorvoegsel",
    "pos|suffix": "achtervoegsel",
    "pos|proper noun": "eigennaam"
  });

  /* ==== 9. themes: Mine, the maker, Previous, day and night ==== */
  add({
    "Mine": "Mijn thema's",
    "Make my own from this one": "Maak hier je eigen thema van",
    "Actions for {name}": "Acties voor {name}",
    "Edit, rename, duplicate or delete": "Bewerken, naam wijzigen, dupliceren of verwijderen",
    "Edit": "Bewerken",
    "Back to {name}": "Terug naar {name}",
    "Previous theme": "Vorig thema",
    "Day and night themes": "Dag- en nachtthema",
    "On a schedule": "Op schema",
    "Day theme": "Dagthema",
    "Night theme": "Nachtthema",
    "Switch": "Wisselen",
    "Now: {name} until {time}": "Nu: {name} tot {time}",
    "Now: {name}, while your phone is set to dark": "Nu: {name}, zolang je telefoon op donker staat",
    "Now: {name}, while your phone is set to light": "Nu: {name}, zolang je telefoon op licht staat",
    "Now: {name}, day and night": "Nu: {name}, dag en nacht",
    "Day and night is on: {name} is now your night theme.": "Dag en nacht staat aan: {name} is nu je nachtthema.",
    "Day and night is on: {name} is now your day theme.": "Dag en nacht staat aan: {name} is nu je dagthema.",
    "Turn off": "Uitzetten",
    "Day and night switching is off": "Wisselen tussen dag en nacht staat uit",
    "Deleted \u201C{name}\u201D": "\u201C{name}\u201D verwijderd",
    "Saved \u201C{name}\u201D": "\u201C{name}\u201D opgeslagen",
    "{what}: any colour": "{what}: elke kleur",
    "Chapter three": "Hoofdstuk drie",
    "The lamp hums quietly. One more chapter, she tells herself,": "De lamp zoemt zachtjes. Nog één hoofdstuk, zegt ze tegen zichzelf,",
    "Page 42 of 310": "Pagina 42 van 310",
    "Keep reading": "Verder lezen",
    "A note": "Een notitie",
    "Adjusted for readability": "Aangepast voor leesbaarheid",
    "Name": "Naam",
    "Edit theme": "Thema bewerken",
    "Your own theme": "Je eigen thema",
    "My {name}": "Mijn {name}"
  });

  /* ==== 10. songs in the book: the link in the text, the hold menu, Soundtrack ==== */
  add({
    "Soundtrack": "Muziek uit dit boek",
    "Play in Spotify · hold for more": "Afspelen in Spotify · vasthouden voor meer",
    "Play \u201C{title}\u201D": "\u201C{title}\u201D afspelen",
    "Copy song name": "Titel en artiest kopiëren",
    "Couldn’t open the music app": "De muziekapp openen lukte niet",
    "No songs found in this book.": "Geen muziek gevonden in dit boek.",
    "One song in this book. Tap it to play it in Spotify.": "Eén nummer in dit boek. Tik erop om het in Spotify af te spelen.",
    "{n} songs, in the order of the book. Tap one to play it in Spotify.": "{n} nummers, in de volgorde van het boek. Tik op een nummer om het in Spotify af te spelen.",
    "Play \u201C{title}\u201D by {artist} in Spotify": "\u201C{title}\u201D van {artist} afspelen in Spotify",
    "Play \u201C{title}\u201D in Spotify": "\u201C{title}\u201D afspelen in Spotify",
    "Go to the chapter": "Naar het hoofdstuk",
    "Copy list": "Lijst kopiëren"
  });

  /* ==== 11. example sentences in the dictionary card (Tatoeba) ==== */
  add({
    "Example sentences": "Voorbeeldzinnen",
    "Show example sentences (online)": "Voorbeeldzinnen tonen (online)",
    "Sentences from Tatoeba under the meaning. The word you tap is sent to Tatoeba; sentences you have seen stay on this device.": "Zinnen van Tatoeba onder de betekenis. Het woord waarop je tikt, gaat naar Tatoeba; zinnen die je al zag, blijven op dit apparaat."
  });

  /* ---------- the language in use ---------- */
  function norm(v){ return v === "nl" || v === "en" ? v : "auto"; }
  var choice = norm(get(KEY)), cur = "en", nl = false;
  function resolve(){
    cur = choice === "auto" ? (/^nl([-_]|$)/i.test(nav()) ? "nl" : "en") : choice;
    nl = cur === "nl";
  }
  resolve();

  /* ---------- lookups ---------- */
  var miss = {};
  function noteMiss(en){
    if (miss[en]) return;
    miss[en] = 1;
    if (HAS_WIN && window.console) console.warn("[i18n] no Dutch for: " + en);
  }
  function fill(s, vars){
    return String(s).replace(/\{(\w+)\}/g, function(m, k){ return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m; });
  }
  function t(en, vars){
    if (typeof en !== "string") return en;
    var s = en;
    if (nl){ var x = NL[en]; if (typeof x === "string") s = x; else if (debug) noteMiss(en); }
    else if (debug && typeof NL[en] !== "string") noteMiss(en);
    return vars ? fill(s, vars) : s;
  }
  function tc(ctx, en, vars){
    var k = ctx + "|" + en;
    if (typeof NL[k] === "string"){ var s = nl ? NL[k] : en; return vars ? fill(s, vars) : s; }
    return t(en, vars);
  }
  function tn(n, one, other, vars){
    var v = { n: n };
    if (vars) for (var k in vars) if (Object.prototype.hasOwnProperty.call(vars, k)) v[k] = vars[k];
    return t(Number(n) === 1 ? one : other, v);
  }

  /* ---------- Intl, in the interface's locale ---------- */
  /* the device's language as a tag Intl accepts: "en-US@posix" (a POSIX locale) or "nl_BE.UTF-8" would make
     every Intl call throw, and the numbers would lose their separators */
  function tag(d){
    d = String(d || "").replace(/_/g, "-").replace(/[@.].*$/, "");
    try { if (typeof Intl !== "undefined" && Intl.getCanonicalLocales) return Intl.getCanonicalLocales(d)[0] || ""; }
    catch(_){ return ""; }
    return d;
  }
  function locale(){
    var d = tag(nav());
    if (nl) return /^nl-/i.test(d) ? d : "nl-NL";
    return /^en(-|$)/i.test(d) ? d : "en-GB";
  }
  var cache = {};
  function fmt(kind, opts){
    var key = kind + "|" + locale() + "|" + (opts ? JSON.stringify(opts) : "");
    if (cache[key]) return cache[key];
    var f = null;
    try {
      if (kind === "num") f = new Intl.NumberFormat(locale(), opts);
      else if (kind === "rel" && Intl.RelativeTimeFormat) f = new Intl.RelativeTimeFormat(locale(), opts || { numeric: "always" });
      else if (kind === "list" && Intl.ListFormat) f = new Intl.ListFormat(locale(), opts || { style: "long", type: "conjunction" });
    } catch(_){ f = null; }
    cache[key] = f;
    return f;
  }
  function num(n, opts){ var f = typeof Intl !== "undefined" ? fmt("num", opts) : null; return f ? f.format(n) : String(n); }
  function asDate(d){ return d instanceof Date ? d : new Date(d); }
  function date(d, opts){
    try { return asDate(d).toLocaleDateString(locale(), opts || { day: "numeric", month: "short", year: "numeric" }); }
    catch(_){ return asDate(d).toLocaleDateString(); }
  }
  function time(d, opts){
    try { return asDate(d).toLocaleTimeString(locale(), opts || { hour: "2-digit", minute: "2-digit" }); }
    catch(_){ return asDate(d).toLocaleTimeString(); }
  }
  function dateTime(d, opts){
    try { return asDate(d).toLocaleString(locale(), opts); }
    catch(_){ return asDate(d).toLocaleString(); }
  }
  /* rel(-3, "hour") → "3 hours ago" / "3 uur geleden"; rel(2, "day") → "in 2 days" / "over 2 dagen" */
  /* where Intl.RelativeTimeFormat is missing (older browsers): the same words by hand */
  var REL_EN = { second: ["1 second", "{n} seconds"], minute: ["1 minute", "{n} minutes"], hour: ["1 hour", "{n} hours"],
                 day: ["1 day", "{n} days"], week: ["1 week", "{n} weeks"], month: ["1 month", "{n} months"], year: ["1 year", "{n} years"] };
  var REL_NL = { second: ["1 seconde", "{n} seconden"], minute: ["1 minuut", "{n} minuten"], hour: ["1 uur", "{n} uur"],
                 day: ["1 dag", "{n} dagen"], week: ["1 week", "{n} weken"], month: ["1 maand", "{n} maanden"], year: ["1 jaar", "{n} jaar"] };
  function rel(v, unit, opts){
    var f = typeof Intl !== "undefined" ? fmt("rel", opts) : null;
    if (f) try { return f.format(v, unit); } catch(_){}
    unit = String(unit).replace(/s$/, "");
    var n = Math.abs(v), w = (nl ? REL_NL : REL_EN)[unit] || ["1 " + unit, "{n} " + unit + "s"], s = (n === 1 ? w[0] : w[1]).replace("{n}", n);
    return nl ? (v < 0 ? s + " geleden" : "over " + s) : (v < 0 ? s + " ago" : "in " + s);
  }
  /* a moment in the past, told plainly */
  function ago(when, now){
    var then = +asDate(when), ms = (now === undefined ? Date.now() : +asDate(now)) - then;
    if (!(ms >= 0)) ms = 0;
    var m = Math.floor(ms / 60000);
    if (m < 1) return t("just now");
    if (m < 60) return rel(-m, "minute");
    var h = Math.floor(m / 60);
    if (h < 24) return rel(-h, "hour");
    var d = Math.floor(h / 24);
    if (d < 30) return rel(-d, "day");
    return date(then);
  }
  function list(arr, type){
    arr = (arr || []).map(String);
    var f = typeof Intl !== "undefined" ? fmt("list", type ? { style: "long", type: type } : null) : null;
    if (f) try { return f.format(arr); } catch(_){}
    if (arr.length < 2) return arr.join("");
    var last = type === "disjunction" ? (nl ? " of " : " or ") : (nl ? " en " : " and ");
    return arr.slice(0, -1).join(", ") + last + arr[arr.length - 1];
  }

  /* ---------- static markup ----------
     data-i18n: the element's own text nodes, each one a key (an element with an icon and a word
     keeps its icon). data-i18n-attr: the attributes named. The English is kept on the node, so the
     markup can be put into either language again; a value app.js has changed since is taken as
     the new English. */
  var WS = /[ \t\n\r\f]+/g, EDGE = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g;
  function keyOf(s){ return String(s).replace(WS, " ").replace(EDGE, ""); }
  function doText(node, ctx){
    var v = node.nodeValue, en = node.__llOut !== undefined && v === node.__llOut ? node.__llEn : null;
    if (en === null){
      var k = keyOf(v);
      if (!k || !/[A-Za-z]/.test(k)) return;
      en = v;
    }
    var key = keyOf(en), out = ctx ? tc(ctx, key) : t(key);
    var lead = /^[ \t\n\r\f]*/.exec(en)[0], trail = /[ \t\n\r\f]*$/.exec(en)[0];
    var val = out === key ? en : lead + out + trail;
    node.__llEn = en; node.__llOut = val;
    if (node.nodeValue !== val) node.nodeValue = val;
  }
  function doAttrs(el){
    var names = (el.getAttribute("data-i18n-attr") || "").split(/[\s,]+/), rec = el.__llAttr || (el.__llAttr = {});
    for (var i = 0; i < names.length; i++){
      var a = names[i]; if (!a) continue;
      var v = el.getAttribute(a); if (v === null) continue;
      var r = rec[a], en = r && v === r.out ? r.en : v, out = t(keyOf(en));
      if (out === keyOf(en)) out = en;
      rec[a] = { en: en, out: out };
      if (v !== out) el.setAttribute(a, out);
    }
  }
  function apply(root){
    if (!HAS_DOC) return;
    root = root || document;
    var els = root.querySelectorAll ? root.querySelectorAll("[data-i18n], [data-i18n-attr]") : [];
    var all = Array.prototype.slice.call(els);
    if (root.nodeType === 1 && (root.hasAttribute("data-i18n") || root.hasAttribute("data-i18n-attr"))) all.unshift(root);
    for (var i = 0; i < all.length; i++){
      var el = all[i];
      if (el.hasAttribute("data-i18n")){
        var ctx = el.getAttribute("data-i18n") || "";
        for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) doText(n, ctx);
      }
      if (el.hasAttribute("data-i18n-attr")) doAttrs(el);
    }
    /* words the stylesheet shows (app.css reads them from custom properties) */
    if (root === document && document.documentElement){
      var st = document.documentElement.style;
      if (nl) st.setProperty("--ll-drop", JSON.stringify(t("Drop to open"))); else st.removeProperty("--ll-drop");
    }
  }
  function markRoot(){
    if (!HAS_DOC || !document.documentElement) return;
    var h = document.documentElement;
    h.setAttribute("lang", cur);
    h.setAttribute("data-ui-lang", cur);
  }

  function setLang(v){
    v = norm(v);
    var before = cur;
    choice = v; put(KEY, v);
    resolve();
    cache = {};
    markRoot();
    apply();
    if (HAS_DOC && typeof CustomEvent === "function") try { document.dispatchEvent(new CustomEvent("ll:uilang", { detail: { lang: cur, setting: choice } })); } catch(_){}
    return cur !== before;
  }

  /* ---------- coverage (debugging and the tests) ---------- */
  var nlValues = null;
  function scan(root){
    if (!HAS_DOC) return [];
    root = root || document.body;
    if (!nlValues){ nlValues = {}; for (var k in NL) if (Object.prototype.hasOwnProperty.call(NL, k)) nlValues[keyOf(NL[k])] = 1; }
    var out = [], seen = {};
    function note(s, where){ s = keyOf(s); if (!s || !/[A-Za-z]{2,}/.test(s) || nlValues[s] || seen[s]) return; seen[s] = 1; out.push(where ? s + "  [" + where + "]" : s); }
    function skip(el){ return !!(el.closest && el.closest("#doc, #pdf, #printHead, script, style, svg, [data-no-i18n], .tts-mirror")); }
    function visible(el){ return !!(el.getClientRects && el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden"; }
    var w = document.createTreeWalker(root, 4, null), n;
    while ((n = w.nextNode())){ var p = n.parentElement; if (p && !skip(p) && visible(p)) note(n.nodeValue); }
    Array.prototype.forEach.call(root.querySelectorAll("[aria-label], [title], [placeholder], [alt]"), function(el){
      if (skip(el)) return;
      ["aria-label", "title", "placeholder", "alt"].forEach(function(a){ var v = el.getAttribute(a); if (v) note(v, a); });
    });
    return out;
  }
  function check(){
    var bad = [];
    for (var k in NL) if (Object.prototype.hasOwnProperty.call(NL, k)){
      var a = (k.match(/\{\w+\}/g) || []).sort().join(), b = (String(NL[k]).match(/\{\w+\}/g) || []).sort().join();
      if (a !== b) bad.push(k + "  →  " + NL[k]);
      if (/(^|[^\w’'])(u (kunt|kan|wilt|heeft|hebt|bent|moet|mag|zult|zich)|uw)\b/i.test(NL[k])) bad.push("formal u: " + NL[k]);
    }
    return bad;
  }

  var api = {
    t: t, tn: tn, tc: tc, lang: function(){ return cur; }, setting: function(){ return choice; }, setLang: setLang,
    locale: locale, num: num, date: date, time: time, dateTime: dateTime, rel: rel, ago: ago, list: list,
    apply: apply, NL: NL, add: add, KEY: KEY,
    missing: function(){ return Object.keys(miss); }, scan: scan, check: check
  };
  add({
    "This carries on in the background — you’ll see a message when it’s done": "Dit gaat op de achtergrond verder — je krijgt een melding als het klaar is",
    "The voices download in the background — the device voice reads until they’re ready": "De stemmen worden op de achtergrond gedownload — tot ze klaar zijn leest de apparaatstem",
    "Close all tabs": "Alle tabbladen sluiten"
  });
  if (HAS_WIN) window.LL_I18N = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  /* the markup is all there by now (this file is loaded at the end of <body>, before app.js) */
  markRoot();
  if (HAS_DOC){
    if (document.readyState === "loading" && !document.getElementById("main")) document.addEventListener("DOMContentLoaded", function(){ apply(); });
    else if (nl) apply();
  }
})();
