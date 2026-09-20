# Lamplight

**A quiet, offline-first reader for PDF, EPUB, DOCX, TXT, Markdown and HTML — with a built-in dictionary, word parts, a sentence explainer and simplifier, translation, and a read-aloud voice that all work without an internet connection.**

Lamplight is a progressive web app made of plain static files: no server, no accounts, no build step. Everything you open stays on your device.

**Live:** https://oofguy3.github.io/Lamplight/

<p align="center">
  <img src="docs/screenshots/explain-phone.png" alt="Lamplight on a phone in the Dusk theme, with the sentence explainer open" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/spread.png" alt="A Markdown book in Pages flow, two pages side by side, Sepia theme" width="560">
</p>
<p align="center">
  <img src="docs/screenshots/library.png" alt="The start screen with the library of recent files" width="410">
  &nbsp;&nbsp;
  <img src="docs/screenshots/notes.png" alt="Highlights in the text and the Bookmarks & notes panel" width="410">
</p>
<p align="center">
  <img src="docs/screenshots/themes.png" alt="The settings sheet with thirty themes in groups and the custom theme editor with its contrast meter" width="410">
  &nbsp;&nbsp;
  <img src="docs/screenshots/fonts.png" alt="The Fonts panel, every family shown in its own face" width="410">
</p>
<p align="center">
  <img src="docs/screenshots/wordparts.png" alt="The dictionary card for 'unexpected' with its word parts: un, expect, ed" width="410">
  &nbsp;&nbsp;
  <img src="docs/screenshots/about.png" alt="The About this text panel: word counts, reading level and vocabulary" width="410">
</p>
<p align="center">
  <img src="docs/screenshots/voices.png" alt="The Read-aloud voices panel with narrator, dialogue voice and expression" width="410">
  &nbsp;&nbsp;
  <img src="docs/screenshots/stats.png" alt="The Reading stats panel: today's minutes, the streak, four weeks of bars" width="410">
</p>
<p align="center">
  <img src="docs/screenshots/translate.png" alt="A document translated into Spanish, each paragraph's translation shown beneath it" width="410">
  &nbsp;&nbsp;
  <img src="docs/screenshots/simplify.png" alt="The Simpler card: a sentence rewritten in plainer words with the swapped words underlined" width="410">
</p>

## Features

**Reading**
- Opens **PDF, EPUB, DOCX, TXT, Markdown and HTML**. Saved web pages are reduced to clean reader text (menus, cookie banners, share bars and ads stripped).
- **Scroll** or **Pages** flow (tap the edges or swipe to turn); two pages side by side on wide screens, for PDFs too.
- **Thirty themes** in three groups — light (Day, Sepia, Paper, Parchment, Linen, Sage, Lavender, Sky, Peach, Newsprint, Mint…), dark (Dusk, Forest, Ocean, Plum, Midnight, Graphite, Ember, Moss, Cocoa, Slate, Candle, Terminal, Amber, Noir…) and two high-contrast ones — every one checked for 4.5:1 text contrast. **Auto theme** follows the system setting or a night schedule.
- A **custom theme editor**: colour pickers with hex fields for the background, text, accent and (under Advanced) the panel and secondary text, quick swatches and tint / brightness sliders, a **live contrast meter** that rates every pairing AAA / AA / Low and can fix a failing colour in one tap, and **as many saved custom themes as you like** (rename, duplicate, save as new, delete). The installed app's title bar follows the theme.
- **Twenty-four fonts** in four groups — easy reading (**OpenDyslexic**, **Lexend**, **Atkinson Hyperlegible**, **Andika**), serif (Georgia, Palatino, Times, Literata, Source Serif, Lora, Merriweather, EB Garamond, Crimson Pro, Libre Baskerville, Bitter), sans (system, Helvetica / Arial, Verdana, Inter, IBM Plex Sans, Nunito) and mono (system, JetBrains Mono, IBM Plex Mono). Sixteen families are bundled as compact woff2 files and **loaded only when chosen**; the *Browse fonts…* panel shows each name in its own face. Text size, line spacing, column width, margins, justification and hyphenation; every size is in `rem`, so the phone's font-size setting scales the whole app.
- PDF zoom, and "soften" for PDF pages in dark themes.
- **Zen mode** (`z`): only the text and the thin progress line, fullscreen where the browser allows it; Escape or `z` brings everything back.
- **Print**: a print stylesheet turns any text document into clean black-on-white pages (title line, link addresses, highlights kept as a grey wash); PDFs open in a new tab for the browser's own print.

**Understanding the text**
- **Tap a word** for its meaning from the built-in 170 000-entry dictionary (with an online fallback when a word is missing and you are online).
- **Word parts** under every definition: the word broken into **prefix, root and suffix** with the meaning and origin of each part and a plain "so: not able to be broken" reading — from tables of 111 prefixes, 97 suffixes and endings and 357 Latin, Greek and Old English roots (`morph.js`, loaded on demand). Tapping a base looks it up in turn.
- **Hold a sentence** (right-click on desktop, or select text) for an offline **Explain** card: the sentence split into clauses, who / did what / to whom, where and when, the tense with a one-line meaning, phrasal verbs and idioms found in the dictionary, and the sentence rewritten in plainer words. Key words are glossed underneath.
- **About this text** (`i`): word, unique-word and sentence counts, reading time at your own speed, **reading level** (Flesch reading ease with a plain-English band, Flesch–Kincaid grade and age, Coleman–Liau as a second opinion), vocabulary richness, dialogue share, and the **thirty hardest words** in the document — tap one for its definition or find it in the text. Works for PDFs too.
- **Simplify** any selected sentence or passage (the pill's *Simplify* button, or from the Explain card): an offline, rule-based rewrite that swaps rarer words for common ones, replaces idioms and wordy phrases, splits over-long sentences and turns clear passives into actives, with every change underlined and explained ("was 'extraordinary' — rarer word") so nothing is hidden; copy it, hear it read aloud, or ask for an AI rewrite with your key.
- **Translate** a tapped word, a selected sentence, or the **whole document** into any of 36 languages. Three engines, used in this order: the browser's **built-in on-device translator** (Chrome and Edge; private, free, and offline once its language pack is downloaded), your own **Anthropic API key**, or the free **MyMemory** web service for single words and sentences. A translated document shows each paragraph's translation beneath it without touching the original text, so highlights, search, positions and read aloud keep working; translations are cached on the device, so a translated book reopens translated, even offline.
- Optional **Explain with AI** button (shown only when online) using an Anthropic API key you paste into settings; the key stays in local storage.

**Keeping your place**
- **Library**: every file you open is kept on the device with its progress; reopen and you are exactly where you left off — across font, width and flow changes.
- **Highlights, bookmarks and notes**, exportable as Markdown or JSON.
- **Tabs** for several open documents (Ctrl/⌘+Tab switches; × closes).
- **Contents** panel: PDF outline, EPUB navigation or document headings. **Search** inside the document, PDFs included.
- **Reading stats and streaks** (`g`): minutes, words and pages per day, a daily goal you choose, the current and longest **streak** of days you kept it, four weeks of bars, all-time totals and your measured reading speed. The start screen shows your streak; everything can be exported as JSON or reset.

**Reading aids**
- **Read aloud** (Web Speech API) sentence by sentence, with the voices on your device grouped into **women's and men's voices**, a **separate voice for dialogue** (by default the other voice, so quoted speech is easy to tell from narration) and **expression read off the text**: questions lift, exclamations quicken, ellipses and paragraph ends pause, headings slow down, and "whispered" / "shouted" / "sighed" around a quote change how it is spoken. Off, Natural or Dramatic. **Lock-screen and headphone controls** (play, pause, previous and next sentence) through the Media Session API, and a **sleep timer** that stops at the end of the sentence after 15 to 60 minutes or at the end of the chapter.
- Reading **ruler**, **auto-scroll** at your pace (timed page turns in Pages flow), and a progress readout with **time left** from your measured reading speed.
- Screen wake lock while reading; keyboard shortcuts (`?` shows them all); works with reduced-motion and forced-colour settings.

**As an app**
- Installs as a PWA, works fully offline (a versioned service worker precaches everything — fonts and word-part tables included — and offers a one-tap reload when a new version is ready).
- "Open with" from the file manager, share files or text to Lamplight from other apps, app shortcuts (Continue reading, Library).

## Install / use

You can use Lamplight in the browser at the live link, or install it:

- **Android / Chrome:** open the link → menu ⋮ → *Install app* (or *Add to Home screen*).
- **iPhone / iPad:** open the link in Safari → Share → *Add to Home Screen*.
- **Desktop (Chrome, Edge):** click the install icon in the address bar.

After the first visit everything is cached; the app, the dictionary, the fonts and the read-aloud voices your device provides work with no connection at all.

### Self-hosting

Lamplight is plain static files. Copy the repository to any static host (GitHub Pages, Netlify, a folder on a web server) — it must be served over **HTTPS** (or `localhost`) for the service worker and installation to work. There is nothing to build:

```
index.html              the shell
app.js  app.css         the reader
explain.js              the offline sentence explainer
morph.js                word parts: prefixes, roots and suffixes with meanings
translate.js            translation engines, the bilingual page view and its cache
sw.js                   service worker (bump VERSION on every release)
manifest.webmanifest    PWA manifest
dict1–6.json, dict-index.json   the offline dictionary (alphabetical chunks + index)
vendor/                 pdf.js, mammoth, marked, DOMPurify, JSZip
workers/                the DOCX worker
fonts/                  the bundled reading fonts (Latin woff2 subsets) and their licences
tests/                  browser tests (not needed to run the app)
```

Opening `index.html` straight from a folder (`file://`) works for reading, but browsers block `fetch()` on `file://` URLs, so the offline dictionary, the bundled fonts (and the service worker) are only available when the folder is served over HTTP(S).

### Explain with AI (optional)

Settings → Dictionary → *Anthropic API key…* Paste a key from https://console.anthropic.com. It is stored only in your browser's local storage and sent only to `api.anthropic.com` when you press *Explain with AI*. Nothing else in the app talks to the network.

## Keyboard shortcuts

`o` open · `s` settings · `t` next theme · `+` / `−` text size or zoom · `p` scroll / pages · `/` or Ctrl+F search · `c` contents · `b` bookmark here · `n` bookmarks & notes · `r` read aloud · `l` reading ruler · `a` auto-scroll · `z` zen mode · `i` about this text · `g` reading stats · `h` library · `?` this list · arrows / PgUp / PgDn / Space turn pages, Home / End first / last page · Esc closes anything.

## Privacy

Files, positions, highlights, notes and cached translations live in your browser's IndexedDB; settings, saved themes and reading stats in local storage. Nothing is uploaded anywhere. The only network requests the app makes are for its own files (cached after the first visit), the free `api.dictionaryapi.dev` lookup when a word is not in the offline dictionary and you are online, and — only when you press the button — the Anthropic API (with your key) or MyMemory (`api.mymemory.translated.net`, which receives the word or sentence you translate). The built-in translator runs on your device. Read aloud uses the speech voices installed on your device; some browsers list "online" voices that the browser itself fetches.

## Development

Everything is hand-written ES5-style JavaScript in `app.js` (with `explain.js` and `morph.js` loaded on demand); there is no bundler and no dependencies to install. To work on it, serve the folder over HTTPS or `localhost` (for example `python3 -m http.server`) and open it in a browser.

Releasing: bump `VERSION` in `sw.js` — every file, `index.html` included, is served from that version's cache, so the shell and its scripts always match; installed copies pick the new version up in the background and show a *Reload* toast. Without the bump, a deployed change is not picked up by installed copies. The deploy workflow also runs Lighthouse against the published site and requires an accessibility score of at least 0.9.

### Tests

`tests/` holds browser tests that drive the real app in headless Chromium through [Playwright](https://playwright.dev) (the only development dependency; install it globally with `npm i -g playwright` and `npx playwright install chromium`, or point `PLAYWRIGHT_BROWSERS_PATH` at an existing install):

```
python3 tests/make-fixtures.py        # builds sample.txt/.md/.html/.epub/.docx/.pdf in tests/fixtures
NODE_PATH=$(npm root -g) node tests/smoke.js        # every format, both flows, a dictionary tap
NODE_PATH=$(npm root -g) node tests/regression.js   # library, tabs, marks, search, contents, explain, PDF, offline, update toast, install
NODE_PATH=$(npm root -g) node tests/themes.js       # contrast audit of every built-in theme (node only)
NODE_PATH=$(npm root -g) node tests/wordparts.js    # 300 word decompositions (node only)
```

plus `themes-browser.js`, `fonts.js`, `speak.js` (with a stubbed speech engine and media session), `wordparts-browser.js`, `about.js`, `stats.js` (with Playwright's fake clock), `zen.js`, `print.js` (print media emulation), `translate.js` (stubbed translator, MyMemory and Anthropic routes) and `simplify.js` for the newer features. Each script starts its own server on a free port and exits non-zero on failure.

The `explain.js` analyser is rule-based: a tokeniser that splits contractions, a part-of-speech tagger that combines the dictionary with built-in word lists, clause splitting on conjunctions, subordinators and relative pronouns, and a small grammar for verb groups (tense, aspect, modals, passives, questions and imperatives). It runs in well under a millisecond per sentence. `morph.js` works the same way: tables of affixes and bound roots, spelling repairs (a dropped *e*, a doubled consonant, *y* to *i*), and a scorer that prefers readings whose parts are all known and leaves common words alone.

## Credits

Lamplight bundles these open-source projects; each keeps its own licence (in `vendor/` and `fonts/`):

- [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174 — Mozilla, Apache-2.0 — renders PDFs.
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) 1.6.0 — Michael Williamson, BSD-2-Clause — converts DOCX to HTML.
- [marked](https://marked.js.org/) 9.1.6 — MIT — renders Markdown.
- [DOMPurify](https://github.com/cure53/DOMPurify) 3.0.8 — Cure53, Apache-2.0 / MPL-2.0 — sanitises every document before it is shown.
- [JSZip](https://stuk.github.io/jszip/) 3.10.1 — Stuart Knightley, MIT — unpacks EPUB files.
- Fonts, all under the SIL Open Font License 1.1, each with its copyright holders, reserved font name and upstream project listed in `fonts/LICENSES.md`: [Atkinson Hyperlegible](https://brailleinstitute.org/freefont) (Braille Institute of America), [OpenDyslexic](https://opendyslexic.org/) (Abbie Gonzalez), [Lexend](https://github.com/googlefonts/lexend), [Andika](https://software.sil.org/andika/) (SIL International), [Literata](https://github.com/googlefonts/literata), [Source Serif](https://github.com/adobe-fonts/source-serif) (Adobe), [Lora](https://github.com/cyrealtype/Lora-Cyrillic), [Merriweather](https://github.com/EbenSorkin/Merriweather4), [EB Garamond](https://github.com/octaviopardo/EBGaramond12), [Crimson Pro](https://github.com/Fonthausen/CrimsonPro), [Libre Baskerville](https://github.com/impallari/Libre-Baskerville), [Bitter](https://github.com/solmatas/BitterPro), [Inter](https://github.com/rsms/inter), [IBM Plex Sans and Mono](https://github.com/IBM/plex) (IBM), [Nunito](https://github.com/googlefonts/nunito) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (JetBrains). The Latin woff2 subsets are the ones published by [Fontsource](https://fontsource.org/).
- The offline dictionary (`dict1–6.json`) combines public-domain definitions from *Webster's Revised Unabridged Dictionary* (1913) with WordNet-style glosses, synonyms and IPA pronunciations. [WordNet](https://wordnet.princeton.edu/) is © Princeton University, used under the WordNet License.
- The word-frequency list inside `explain.js` (used to decide which words need glossing, and by *About this text* to find the hardest words) is derived from [google-10000-english](https://github.com/first20hours/google-10000-english), MIT.
- The affix and root tables in `morph.js` were written for Lamplight from the classic school lists of Latin and Greek word roots.
- The optional online word lookup uses the [Free Dictionary API](https://dictionaryapi.dev/).

Lamplight itself is released under the [MIT License](LICENSE).
