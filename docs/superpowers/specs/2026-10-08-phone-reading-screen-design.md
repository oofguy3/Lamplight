# Phone reading screen: the lamp button and the dock

- **Status:** design approved in conversation on 2026-10-08 (three parts, each approved); this document is the written spec for review.
- **Stage:** 1 of the whole-app restyle. The user chose to start with the phone reading screen. Later stages: a new curated theme set and theme picker, the library and start screen, then the remaining panels and sheets.
- **Mockups:** https://claude.ai/artifact/HvE747TezMCc2LzCNQGqrd. The chosen design is the top row, "Your mix": *Mix: reading* and *Mix: dock open*. The Text sheet is *Dock: text settings*. The mockups use a placeholder palette; the app keeps its own themes in this stage.

## 1. Why

On a phone today:

- the top bar spends its space on the wordmark;
- the bottom row mixes four kinds of glyph (line icons, a serif "Aa", a glowing dot for themes and "⋯") with no labels, so the theme button is hard to find;
- changing the theme takes four or five taps, and the theme sheet is a tall list of mixed controls;
- the Text sheet squeezes the Size slider between A− and A+, shows developer units ("720 px"), uses a native select for the font and puts a "More" accordion mid-list;
- zen mode has no on-screen way out on a phone;
- the app ignores the notch and the home bar;
- a bug: with Day and night switching automatically, pressing `t` or holding the lamp overwrites the saved day or night theme (reproduced; see 6.2).

## 2. Goals and non-goals

**Goals**

1. While reading on a phone, the screen is the text plus one control: the lamp button.
2. Every reading tool sits in thumb reach, with a visible label, one tap away once the dock is open.
3. A one-tap Day/Night switch that never loses the reader's chosen pair.
4. A Text sheet that works with one thumb.
5. Across the whole app: the interface font becomes Atkinson Hyperlegible, and spaced-out capital labels become sentence case.

**Non-goals (later stages)**

- New themes, the theme picker and gallery, the custom-theme editors.
- The library and start screen layout.
- The layout of the other panels and sheets (word card, explainer, settings sheet, More sheet beyond removing duplicates).
- The phone's Back gesture closing the dock or leaving a book.
- Landscape phones and tablets, which keep today's top bar.
- Desktop layout. Desktop changes only in font, label casing and the two new icons on its bar (9.1–9.3).

## 3. Where each part applies

| Part | Applies when |
|---|---|
| Phone reading chrome: no header, footer strip, lamp, dock | `PhoneBar.on()`: `(pointer: coarse) and (max-width: 560px)` and a document or PDF is open (app.js:10917-10920). Also the "Opening …" status screen when it is reached from an open book (7.12). |
| New Text sheet layout | Wherever the type pane is already a bottom sheet: `Pop.phone()`, i.e. `max-width: 560px` (app.js:1408). This includes the phone library screen and narrow desktop windows. |
| Interface font, sentence case | Everywhere. |

## 4. The reading screen, dock closed

### 4.1 Layout

- **No header.** Under `body.phonebar` the `<header>` is `display: none`, after PhoneBar has moved its live children out (7.2).
- **Top inset.** The text starts `max(20px, env(safe-area-inset-top))` from the top, in both flows.
- **Footer strip** (new `#readFoot`), fixed to the bottom, full width, background `var(--bg)`:
  - height `FOOT = 92px + env(safe-area-inset-bottom)`;
  - text never runs under it: Pages flow reserves `FOOT` in `availHeight()`; Scroll flow gives `main` a bottom padding of `FOOT + 24px`;
  - it holds the note on the left and the lamp button on the right.
- **Lamp button** (new `#dockBtn`):
  - 56 × 56 px circle, 20 px from the right edge, 28 px + `env(safe-area-inset-bottom)` from the bottom;
  - surface `var(--panel)`, 1 px `var(--line)` border;
  - icon: the new desk-lamp line icon (9.3), its bulb filled with `var(--lamp)`;
  - **progress ring**: an SVG circle on the button's edge, 2 px stroke in `var(--lamp-mark)` (9.4), starting at 12 o'clock, showing progress through the book (the value `setProgressBar` computes, app.js:1986-1991);
  - accessible name "Reading controls", `aria-describedby` a visually hidden "{p}% through the book", `aria-expanded` mirroring the dock, `aria-controls="phoneDock"`;
  - a tap, Enter or Space opens the dock; a hold switches Day/Night (6.2) with today's toast, through the existing `longPress` helper (app.js:57).
- **Note** (new `#leftNote`), bottom-left, vertically centred on the lamp, 13 px `var(--muted)`, `aria-live="off"`:
  - shows the time left in the chapter (4.2), e.g. "4 min left in chapter";
  - books without contents entries show today's whole-book form, e.g. "4 min left";
  - empty when there is no estimate yet; hidden while read aloud plays (7.10) and in zen (7.11).
- **Hidden on phones while reading:** the 3 px `#progress` line (except in zen), the `#progressInfo` pill and `#pager`. `#pgInfo` keeps being written: Section's MutationObserver (app.js:11255) and the tests read it.

### 4.2 Time left in the chapter

- **Chapter** = the span from the current contents entry to the next one, in the same list the dock's title line uses (Section's entries: an EPUB's nav entries at any depth, otherwise h1–h4 levelled to the shallowest; for PDFs, outline entries; app.js:11205-11258).
- **Text documents:** words from the reading position (top of the view in Scroll flow, first word of the page in Pages flow) to the next entry's offset, or to the end, divided by `Pace.docWpm()`.
- **PDFs:** pages to the next outline entry, divided by `Pace.docPpm()`.
- **Format** (new strings, built like `Progress.fmt`, app.js:8004-8010): "under a minute left in chapter", "{n} min left in chapter", "{h} h {m} min left in chapter", "{h} h left in chapter".
- Recomputed from `Progress.tick` (every scroll and page turn).
- Needs two small exports: Section's next-entry offset, and a Pace helper that counts words between two offsets (Pace's word index already exists, not exported).

## 5. The dock

### 5.1 Opening

| Route | Scroll flow | Pages flow | E-ink |
|---|---|---|---|
| Tap, Enter or Space on the lamp | yes | yes | yes |
| Tap on blank space in the middle band (0.35–0.65 of the width) | no | yes | no (taps turn pages) |
| Tap in the bottom strip (`BAR_STRIP`, app.js:11648-11652) | no | yes | no |
| Vertical swipe up (> 55 px) starting on the page | no | yes | no |

A tap on a word keeps opening the dictionary in every flow. In Scroll flow nothing but the lamp opens the dock.

### 5.2 Closing

- A tap anywhere outside the dock. A transparent catcher (`#phoneDockScrim`) covers the page; that tap does nothing else: no lookup, no page turn, no highlight menu.
- A swipe down on the dock (the shared `dragToClose`, app.js:81) or starting on the page.
- Escape, but only when no sheet, menu, drawer, popover or card is open (7.7).
- Choosing anything in the dock: the dock closes first, then the tool opens.
- `PhoneBar.place()` (rotation across 560 px, a pointer change, leaving the book, switching books).

### 5.3 While it is open

- The page stays visible and undimmed but holds still: no scrolling, no reaction except closing.
- The dock overlays the page. It never changes `availHeight()`, the page count or `#dock`'s measured height.
- `#dockBtn`, `#leftNote` and the read-aloud player are hidden.
- Focus moves to the dock container (`tabindex="-1"`, labelled "Reading controls"). Tab order follows the visual order. On close, focus returns to `#dockBtn`.

### 5.4 Layout, top to bottom

As in *Mix: dock open*:

1. A decorative grab handle.
2. **Header row**, 48 px:
   - new `#dockHome`: chevron-left icon, name "Back to library", calls `Library.home()`;
   - `#fname`, moved here: the title in 'LL Title' 17 px with the section line under it (today's `data-sec` mechanism), a 16 px chevron-down after the title; it keeps opening the Open books switcher (app.js:10937-10974);
   - `#searchBtn`, moved here.
3. **Position row**:
   - new `#dockPos` (`input type=range`, label "Position in book", visually hidden);
   - Pages flow, and PDFs in both flows: min 1, max = page count, step 1;
   - Scroll flow for text: 0–100, step 1 (percent of the document);
   - caption under it: left "Page {n} of {m}" (or "{p}%" in Scroll flow for text), right the chapter time from 4.2;
   - the caption follows the thumb while dragging; the jump happens on release (`change`), through `gotoPage`, `renderPdfSingle`, `Toc.goPdfPage` or a scroll to the fraction; then `Journal.jumped()`, and Pace records it as navigation (7.8);
   - arrow keys move one page, or 1 %.
4. **Day/Night switch**: two buttons, Day (sun icon) and Night (moon icon), in a group labelled "Day or night", each with `aria-pressed` per 6.1. Hidden in e-ink mode.
5. **Tool row**: `#actRow`, moved from `#dock` into `#phoneDock`. It holds `#tocBtn`, `#gear`, `#speakBtn`, `#lamp`, `#more`, same ids, same order. Each shows an icon above a visible label: Contents, Text, Read aloud, Theme, More.
   - `#speakBtn` uses the existing primary style (`.ctl.primary`). While reading aloud its label reads "Stop" and its name "Stop reading aloud" (existing, app.js:10885-10892).
   - Without speech synthesis `#speakBtn` is hidden (app.js:13635), leaving four tools.
6. Bottom padding 24 px + `env(safe-area-inset-bottom)`.

**Visual:** background `var(--panel)`, 1 px `var(--line)` top border, 24 px top corner radius, no shadow. `max-height: 85dvh` with internal scroll.

### 5.5 What each control does

Each closes the dock, then does today's action:

| Control | Action |
|---|---|
| Back | `Library.home()` (stops read aloud and auto-scroll, leaves zen, keeps the tabs) |
| Title | Open books switcher |
| Search | Search |
| Contents | Contents panel |
| Text | The Text sheet (section 8) |
| Read aloud | Start or stop reading; the player appears at the foot (7.10) |
| Theme | Today's theme sheet, with the day and night themes always shown (6.4) |
| More | Today's More sheet, minus the phone quick-row entries that the dock now has: Read aloud, Contents, Search, Library |

Unchanged: a hold on `#speakBtn` opens Voices (app.js:6798); a hold on `#lamp` switches Day/Night (now through 6.2), on desktop and in the dock.

## 6. Day/Night

### 6.1 The pair and the highlighted half

- The pair is `state.autoDay` / `state.autoNight` (Day / Dusk by default), whether or not Auto is on.
- New helper `dnOf(themeId)`:
  - `'day'` if it is the day theme, `'night'` if it is the night theme;
  - Contrast (`hicon`) counts as `'day'` and Contrast dark (`hidark`) as `'night'` (6.3);
  - otherwise `null`: neither half is highlighted;
  - if the day and night themes are the same, a match counts as `'day'`.

### 6.2 One setter

New `setDayNight('day' | 'night')`, used by the dock switch, the `t` key and both holds:

- target: the pair's theme for that half, or Contrast / Contrast dark per 6.3;
- goes through `crossFade` as `pickTheme` does (app.js:11306-11312);
- **never calls `AutoTheme.userPicked`**. This fixes the bug: today `toggleDayNight` → `selectTheme` → `userPicked` (app.js:10900-10907, 11292-11297, 892-897) writes the other theme into the current period's slot, so the pair collapses;
- does not add a Recent entry (`noteTheme`);
- `t` and the holds show today's "{name} theme" toast.

`toggleDayNight()` becomes: the opposite half of `dnOf(current)`; when that is `null`, a light theme goes to Night and a dark theme to Day (today's rule, pinned by tests/themes-browser.js).

### 6.3 High contrast

When the theme on screen is Contrast or Contrast dark, Day means Contrast and Night means Contrast dark, so a high-contrast reader never leaves high contrast by accident.

### 6.4 Theme sheet

The day and night theme pickers are shown whatever Auto is set to. Today they are hidden while Auto is off (app.js:1588, 881).

### 6.5 With Auto on (Follow phone or On a schedule)

A tap holds until the next automatic switch, then Auto carries on:

- `setDayNight` stores an override `{ theme, period: 'day' | 'night', until }` as a new, validated `ll_prefs` field, so it survives closing the app;
- `period` is the period at the time of the tap (`AutoTheme.isNight()`);
- `until` is the next schedule boundary (On a schedule) or now + 12 h (Follow phone);
- `AutoTheme.wanted()` returns the override's theme while `now < until` and the current period equals `period`; otherwise it clears the override and returns the pair's theme;
- the boundary timer, the 30 s poll, the media-query change, `visibilitychange` and boot all go through `wanted()`.

### 6.6 E-ink

The dock's switch is hidden. `t` and the holds keep today's behaviour (they change the theme used once e-ink is off) and their toast.

### 6.7 Unchanged in this stage

Picking a theme tile while Auto is on still makes it that period's theme (`userPicked`). Revisit in the theme stage.

## 7. Architecture

The approach: grow `PhoneBar` (app.js:10909-10980) into the owner of the phone reading chrome and reuse today's buttons, ids and wiring. Rejected: a separate phone shell with its own markup, which would add a third copy of every control binding and rewrite most phone tests.

### 7.1 Owner

`PhoneBar` keeps `on()` and the placeholder-move mechanism, and gains `openDock()`, `closeDock()`, `toggleDock()` and `isDockOpen()`, a `body.dock-open` class, and the moves in 7.2. All are exported on `window.__ll.PhoneBar` for tests.

### 7.2 DOM moves under phonebar

Comment placeholders as today:

- the five tools into `#actRow`, which now lives in `#phoneDock`;
- `#searchBtn` and `#fname` into the dock header;
- `#moreMenu`, and `#moreScrim` when it exists, to body level, because a `display: none` header hides them (probe: `.open` with 0 client rects). Menu's outside-click test (app.js:2931) becomes `closest('#moreWrap, #moreMenu')`.

Leaving phone reading moves everything back and closes the dock.

### 7.3 New elements

`#readFoot` (holding `#leftNote` and `#dockBtn`), `#phoneDockScrim` and `#phoneDock`:

- direct children of `body`, after `#dock`, so they sit outside `#dock`'s and the header's stacking contexts;
- hidden unless `body.phonebar`;
- added to Side's inert list `BEHIND` (app.js:2762).

Introduce named z-index tokens for the layers involved, first mapped one-to-one onto today's values. Order, bottom to top: page, `#dock`, `#readFoot`, `#phoneDockScrim`, `#phoneDock`, toasts, then the sheets and their scrims (`#pop`, `#sheet`, `#side`, `#moreMenu`, `#dictCard`).

### 7.4 Header

- `display: none` under `body.phonebar`. It stays the first `<header>` and a direct child of `body`, since `headVar`, `availHeight` and `Library.headerHeight` query it (app.js:1717, 1744, 3050), so `--headH` becomes 0.
- The hide-on-scroll logic (app.js:11788-11799) is skipped under phonebar. `setProgressBar`, `Progress.tick` and `Library.notePosition` still run.

### 7.5 Layout maths

- `#dock` keeps `#tts` and `#pager`; `#actRow` has moved out.
- Under phonebar `#pager` is `display: none !important` (its display is set inline at app.js:1879; zen uses the same override).
- `availHeight()` (app.js:1742-1751) skips its +56 px "no pager" allowance when phonebar hides the pager on purpose, and reserves `FOOT`, plus the `#tts` height while reading aloud.

### 7.6 Gestures

**Pages flow, under phonebar** (`tapNav`, app.js:11653-11668; swipes, 11673-11689):

- a blank tap in the middle band or in the bottom strip opens the dock; the top strip does nothing;
- a swipe up opens the dock; a swipe down closes it;
- horizontal swipes still turn pages, but are ignored when they start inside `#phoneDock`, `#readFoot`, any sheet or scrim, or a range input (today a drag on a slider turns the page);
- e-ink and zoomed-PDF exceptions stay as they are.

**Scroll flow:** no new taps.

Desktop keeps today's gestures.

### 7.7 Escape and focus

- The dock's Escape handler acts only when none of these is open: `#sheet`, Pop, Menu, Side, `#dictCard`, the Finished card, the Recap. The sheet's own Escape listener (app.js:11692) does not stop propagation.
- `Zen.somethingOpen` (app.js:9448-9452) and the Journal and Recap Escape guards count the dock.
- One helper redirects focus-return targets that sit inside a closed dock to `#dockBtn`. `Pop.close`, `Menu.close`, `Side.close` and `setSheet` use it. Today they would focus a hidden button and focus would fall to `<body>`.

### 7.8 Pace

An open dock is a soft blocker (`softBlockers`, app.js:7119-7130). Slider jumps count as navigation (`navUntil`, app.js:7175), so neither skews the words-per-minute figure behind every time-left estimate.

### 7.9 Things that float above the bottom

On phones `--aboveDock` lifts these above `FOOT`, plus `#tts` when shown, and above the open dock while it is open:

- the toasts (including Undo, so it never covers the tools), `#updateToast` and `#trStatus`;
- `#finish` and `#recap`;
- `#autoBar`, right-aligned above the lamp.

Also:

- the reading-ruler grip stays above `FOOT`;
- `Speak.ensureVisible` (app.js:5963-5974) keeps the spoken sentence above `FOOT` and `#tts`.

Desktop values stay as they are (pinned by tests/ui-b.js:251-272).

### 7.10 Read aloud

- `#tts` stays a full-width bar at the very bottom.
- `#readFoot` sits directly above it (its bottom offset is the player's height), and `#leftNote` hides.
- Opening the dock hides `#tts` until the dock closes.

### 7.11 Zen on phones

- Entering zen closes the dock and hides `#leftNote` and the ring.
- `#dockBtn` stays at 40 % opacity (100 % on focus). A tap on it leaves zen; it does not open the dock.
- The 3 px `#progress` line shows in zen, as the README promises.

### 7.12 Switching books

The "Opening …" status screen reached from an open book keeps the phone chrome: no header flash (today place() turns phonebar off for about 260 ms). The dock is closed.

### 7.13 Rotation and other flips

`place()` closes the dock, moves every part back, and keeps the Scroll-flow position the way zen does (note `Library.topCharOffset()` before, `revealOffset` after; app.js:9418-9441), since the header's 57 px now appear and disappear.

### 7.14 Status bar colour

Under phonebar, `meta[name=theme-color]` takes the theme's `--bg` (the page); otherwise `--panel`, as today (app.js:809-811). Re-run from `place()` and `applyTheme()`.

### 7.15 Safe areas

- The viewport meta gains `viewport-fit=cover` (index.html:5), which also brings the 15 existing `env()` rules to life.
- Top inset as in 4.1. `FOOT`, the dock and `#tts` use `env(safe-area-inset-bottom)`.
- In landscape (today's bar), `header .bar` and `main` get `padding-inline: env(safe-area-inset-left) env(safe-area-inset-right)`.

### 7.16 Other screens

- **Phone library screen:** same layout as today (wordmark, Aa, theme, ⋯, Open), with the new font, casing and Text sheet.
- **PDFs:** same chrome. The chapter is the outline entry, time is pages over pages-per-minute, and the slider counts pages in both flows.

## 8. The Text sheet (phone layout)

Applies under `Pop.phone()`. Desktop keeps today's popover. Rows have labels above their controls, every target is at least 48 px, and the `.prow` class stays.

### 8.1 Size

- `#smaller` (A−), the value `#qSizeV` (in the reading font, `aria-live="polite"`), `#bigger` (A+): 56 px buttons.
- `bump()` is unchanged (14–28 px; PDF zoom 60–250 % in 10 % steps). The buttons are disabled at the ends.
- The sliders `#qSize` and `#qZoom` are hidden in this layout. Desktop keeps them.
- The value shows without "px".

### 8.2 Line spacing

Three choice buttons with a pictogram and a label, `aria-pressed`, in a group labelled "Line spacing":

| Choice | `state.lh` |
|---|---|
| Tight | 1.5 |
| Normal (default) | 1.75 |
| Airy | 2.0 |

A tap sets `state.lh` and calls `applyType()`. A choice is pressed when `|lh − value| < 0.001`.

### 8.3 Margins

Three choice buttons, same pattern, in a group labelled "Margins":

| Choice | `state.margin` |
|---|---|
| Narrow (default, today's look) | 0 |
| Medium | 12 |
| Wide | 28 |

If the saved `state.width` is narrower than the text column on this screen (320 or 340 on most phones), a tap on a margin choice also resets `width` to its default (720), so the choice is what the reader sees.

### 8.4 Values between the choices

A saved value that matches no choice (from the full settings, or an older version) shows no choice pressed, and the row shows "Custom: 1.6" (`dec()` gives the Dutch comma). Nothing changes until a tap. Prefs never snap these values.

### 8.5 Fonts

- A row of four buttons, each naming its font in its own face: Georgia (`serif`), Literata (`literata`), Atkinson Hyperlegible (`hyper`), System sans (`sans`). None needs a download.
- If `state.font` is another font, it takes the fourth slot, so the current font is always shown and pressed.
- **All fonts** opens the Fonts panel (`Fonts.openPanel`). Closing it reopens the Text sheet.
- Font previews are requested when the sheet opens, never at startup.
- `#fontQuick` (the select) stays for desktop.

### 8.6 The rest

- **Page flow:** `#qFlow`, unchanged.
- **Fine-tune:** `#qMore` relabelled "Fine-tune", closed by default: weight, letter spacing, word spacing, focus reading. Same ids.
- **All text settings:** `#typeMore`. For a PDF it opens the PDF section (`#pdfGroup`) instead of the dimmed Text group.
- **PDF:** the sheet holds the Zoom stepper, Soften pages, Page flow and All text settings.
- **Focus:** on open, to `#smaller`; on close, back to the opener (a closed dock's opener redirects to `#dockBtn`, 7.7).
- **Height:** fits 85 dvh at 390 × 844 with Fine-tune closed, and scrolls inside otherwise.
- **Settings sheet:** the English label "Spacing" becomes "Line spacing" (the Dutch is already "Regelafstand").

## 9. Look

### 9.1 Interface font

- A new alias `'LL UI'` for the bundled Atkinson Hyperlegible files: 400, 700, 400 italic, 700 italic. They are already precached in sw.js, so nothing new is bundled.
- `--ui-font: 'LL UI', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, app-wide, including the dictionary card's injected CSS.
- The alias keeps the interface apart from the reading font of the same family that the Fonts module can load.
- Titles stay 'LL Title' (Literata). Reading fonts are unaffected.
- Only 400 and 700 exist, so rules asking for 500 render at 400 and 600 at 700.

### 9.2 Sentence case

- Remove `text-transform: uppercase` and the letter-spacing from the 15 rules in app.css and the 2 in the injected card CSS (app.css:335, 407, 417, 699, 830, 993, 1539, 1812, 1831, 1858, 1966, 1969, 1998, 2123, 2200; app.js:11938, 12033).
- These labels become sentence case, 13 px, bold, `var(--muted)`.

### 9.3 Icons

New entries in the `ICONS` table (24 px box, 1.75 stroke, round caps):

- `aa` for Text;
- `bulb` for Theme, its glass filled `var(--lamp)`;
- `lamp`, a desk lamp, for `#dockBtn`;
- six pictograms: `lhTight`, `lhNormal`, `lhAiry`, `mgNarrow`, `mgMedium`, `mgWide`.

`#gear`'s "Aa" text glyph and `#lamp`'s CSS bulb are replaced by `aa` and `bulb` everywhere, so the desktop bar shows them too, without labels. The existing `chevronL`, `sun` and `moon` serve Back and Day/Night.

### 9.4 Colours

- Themes are unchanged in this stage.
- New derived token `--lamp-mark`, set in `applyTheme()`: `--lamp` mixed toward `--ink` in 5 % steps until it reaches 3:1 against `--bg`. Used for the ring and the slider fill (in Day, raw `--lamp` is about 2.5:1).
- The dock and the lamp use existing tokens: `--panel`, `--line`, `--ink`, `--muted`, `--accent` for selection and focus, and `.ctl.primary` for Read aloud.

### 9.5 Modes

- **Contrast tone:** 2 px borders on `#dockBtn`, the dock edge, the Day/Night switch and the choice buttons; nothing under 15 px, so tool labels are 15 px and may wrap.
- **Forced colours:** the ring stroke is Highlight; borders are ButtonText; the primary Read aloud gets a 2 px Highlight border.
- **E-ink:** no motion; everything black on white; the ring stays an SVG stroke; the new parts join the e-ink rules (app.css:2248-2370).
- **Reduced motion:** the dock appears without sliding.

### 9.6 Motion

The dock slides up in 200 ms (ease-out) while the lamp fades. That is the only animation.

### 9.7 Label lengths

- Tool labels may wrap to two lines, centred.
- The widest are "Read aloud" (65 px at 13 px) and the contrast tone's 15 px labels.
- Checked at 320, 360 and 390 px wide, in English and Dutch, and in the contrast tone.

## 10. Copy

New strings, each with Dutch in i18n.js (tests/i18n.js fails otherwise):

| English | Dutch |
|---|---|
| Reading controls | Leesbediening |
| Back to library | Terug naar de bibliotheek |
| Position in book | Positie in het boek |
| Page {n} of {m} | Pagina {n} van {m} |
| {p}% through the book | {p}% van het boek gelezen |
| under a minute left in chapter | nog geen minuut in dit hoofdstuk |
| {n} min left in chapter | nog {n} min in dit hoofdstuk |
| {h} h {m} min left in chapter | nog {h} u {m} min in dit hoofdstuk |
| {h} h left in chapter | nog {h} u in dit hoofdstuk |
| Line spacing | Regelafstand (exists) |
| Tight / Normal / Airy | Krap / Normaal / Ruim |
| Narrow / Wide | Smal / Breed ("Medium" → "Gemiddeld" and "Margins" → "Marges" exist) |
| Custom: {v} | Aangepast: {v} |
| Fine-tune | Fijnafstelling |
| All fonts | Alle lettertypen |
| Tap any word for its meaning. Your reading controls are behind the lamp. | Tik op een woord voor de betekenis. Je leesbediening zit achter de lamp. |
| Tap the left or right side to turn the page. Swipe up or tap the lamp for your controls. | Tik links of rechts om te bladeren. Veeg omhoog of tik op de lamp voor je bediening. |
| While reading, tap the lamp for read aloud, stats, zen mode and more. | Tik tijdens het lezen op de lamp voor voorlezen, statistieken, zenmodus en meer. |

Existing strings reused: Day, Night, Day or night, Stop ("Stoppen"), Stop reading aloud, Contents, Text, Read aloud, Theme, More, Search in the document, Smaller text or zoom out, Larger text or zoom in.

Where they appear:

- The first-document tip ("Tip: tap any word for its meaning", app.js:11260-11276) uses the new combined line on phones.
- `#flowHint` (index.html:155) gets the phone line.
- The start screen's third tip (index.html:346) gets the phone line on phones.
- Desktop keeps the old copy in all three places.

## 11. Docs and release

- README:
  - the phone reading row (README.md:49), the Day ⇄ Night paragraph and holding the lamp (52), the Pages-flow gestures (48) and zen;
  - the "thirty themes" alt text;
  - regenerate the phone screenshots with tests/screenshots.js. all.js skips it, so it is run by hand.
- Bump `VERSION` in sw.js, since app.js, app.css, index.html and i18n.js change.
- Update the stale comments the change touches: the tip copy and the hold comment at app.js:10975.

## 12. Testing

### 12.1 Baseline before any change

Recorded in this session with `NODE_PATH=$(npm root -g) node tests/<file>.js`.

**Already red:**

| File | Result | Failures |
|---|---|---|
| themes-browser.js | 11/16 | aborts at :80 |
| qol.js | 33/35 | :171-172, then a 30 s tap timeout at :176 that skips 6 checks |
| type2.js | 60/62 | |
| ui-a.js | 113/114 | |
| fonts.js | 83/85 | |
| i18n.js | 11/12 | |
| ui-c.js | 46/50 | :312, plus three timeout blocks |

**Green:** ui-b.js 117/117, regression.js 64/64, zen.js 40/40.

The plan starts by re-running the full suite and saving the list of failing checks. "Done" means no check fails that passed before.

### 12.2 Existing tests to update

They tap the old phone row or assert the old phone layout. Known so far:

- qol.js:58-61, 83-88, 131-178, 217, 239;
- ui-a.js:351-368, 373, 392, 399-410, 404, 426;
- ui-b.js:123-131, 323;
- type2.js:127-145, 204, 388-392;
- regression.js:303;
- fonts.js:32, 46, 67 (the interface font now loads at start);
- tests run with `hasTouch` also get phonebar (library2.js, notes2.js, stats2.js).

The checks keep their intent: they open the dock first, or read the new layout. qol.js's single try-block (46-201) is split, so one failure no longer skips the rest.

### 12.3 New tests/phonedock.js

Phone 390 × 844 with touch, plus 320 × 568 where noted:

1. Reading state:
   - no header box;
   - `#readFoot` and `#dockBtn` at the specified places, with safe-area emulation;
   - the ring's dash follows progress;
   - `#leftNote` reads "… left in chapter", and the whole-book form for a book without contents;
   - text never under `FOOT` in either flow.
2. Each opening route in 5.1, and each one that must not work: a Scroll-flow tap on blank space, an e-ink middle tap.
3. Each closing route in 5.2. The closing tap must not look up a word or turn a page.
4. The dock never changes the page count in Pages flow.
5. The tools open their sheets. Focus returns to `#dockBtn`. The More quick row no longer repeats the dock's entries.
6. Position slider: Pages flow, Scroll flow and PDF jumps; keyboard steps; captions.
7. Day/Night:
   - pressed states for the day theme, the night theme and neither;
   - `t`, the switch and the hold agree;
   - with Auto on, the pair is never overwritten and the override expires at the boundary (fake clock) and after a restart;
   - Contrast / Contrast dark;
   - hidden in e-ink;
   - no Recent entry.
8. Text sheet:
   - stepper limits;
   - the spacing and margin choices set the documented values;
   - a custom value shows "Custom";
   - the font row with a fifth font in use;
   - All fonts returns to the sheet;
   - the PDF variant;
   - the 320 px fit.
9. Read aloud: the player at the foot, the lamp above it, the note hidden, and the player hidden while the dock is open.
10. Zen: a faint lamp, and a tap leaves zen.
11. Switching books (no header flash); rotation with the dock open (closed, parts back, position kept).
12. Modes: contrast tone (2 px, 15 px), forced colours (`page.emulateMedia({ forcedColors: 'active' })`), e-ink, reduced motion.
13. Dutch: labels and captions present, nothing clipped at 320 px.

Register it in tests/all.js.

### 12.4 Acceptance

- No previously passing check fails.
- tests/phonedock.js passes.
- The parse checks in .github/workflows/deploy.yml pass.
- Lighthouse accessibility stays at 0.9 or higher.

## 13. Risks

- **Tests on the phone gate.** Contexts with only `hasTouch` match `pointer: coarse` in Chromium, so more suites than expected see the phone chrome (12.2).
- **Missed moves.** Moving `#moreMenu` and `#actRow` out of their containers can break code that assumes `closest('#moreWrap')` or `#dock` contains them. Grep for both before the move.
- **Taps and keys reaching two layers.** Capture-phase listeners (the dictionary, marks, translation, songs) must not see the closing tap. The catcher sits above the page and swallows it. Escape ordering is explicit (7.7).
- **Layout jumps.** Pages-flow pagination is sensitive to `--headH` and `--dockH`. The dock is an overlay and the footer reserve is constant, so opening and closing never re-paginates; a test pins this.
- **Fragile chapter time.** The time-left figure depends on Pace's estimate, which needs a little reading time first. The note stays empty rather than guessing.

## 14. Decision log

| Decision | Choice |
|---|---|
| Direction | C's lamp button with B's dock, plus C's Day/Night switch |
| Scroll flow | Only the lamp opens the dock; tapping a word still looks it up |
| Closing | Tap the page, swipe down, Escape, or pick a tool |
| Read aloud | Player stays at the foot; the lamp sits above it |
| Zen | A faint lamp leaves zen |
| Day/Night meaning | Always the reader's day and night themes, also with Auto off; the pair is visible in the Theme sheet |
| Day/Night with Auto on | Holds until the next automatic switch, survives a restart, never overwrites the pair |
| Text sheet | Stepper; Tight/Normal/Airy; Narrow/Medium/Wide; defaults unchanged; "Custom" for in-between values |
| Font row | Georgia, Literata, Atkinson Hyperlegible, System sans, with the current font in the fourth slot |
| Interface font and sentence case | Whole app now |
| Landscape, tablets, Back gesture, themes, library | Later stages |
