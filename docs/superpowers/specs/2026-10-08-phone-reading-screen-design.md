# Phone reading screen: the lamp button and the dock

- **Status:** design approved in conversation on 2026-10-08 (three parts, each approved). Version 2, after an independent review (completeness, code truth, fidelity to the approved parts); the decisions taken during that review are marked "review" in section 14.
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
- The library and start screen layout, including its header (it keeps today's "Aa" and bulb glyphs).
- The layout of the other panels and sheets (word card, explainer, settings sheet, More sheet beyond removing duplicates).
- The phone's Back gesture closing the dock or leaving a book.
- Landscape phones and tablets, which keep today's top bar (they only gain safe-area padding, 7.15).

**What desktop sees.** Desktop layout stays as it is. Through shared code, desktop still gets:

- the interface font and sentence-case labels (9.1, 9.2; text asked at weight 600 renders bold, 500 regular);
- the Day/Night changes for `t` and the lamp hold: they no longer rewrite the pair or add a Recent entry, `t` shows the same toast as the hold, and the Auto-on hold (6.2–6.5);
- the day and night pickers in the theme popover and settings sheet with Auto off, marked by the theme on screen (6.4);
- the corrected toast for a tile picked while Auto is on (6.7);
- the label "Line spacing" in the settings sheet (8.7);
- windows 560 px and narrower, mouse included, get the phone Text sheet (3).

## 3. Where each part applies

| Part | Applies when |
|---|---|
| Phone reading chrome: no header, footer strip, lamp, dock, the new icons | `PhoneBar.on()`: `(pointer: coarse) and (max-width: 560px)` and a document or PDF is open (app.js:10917-10920). Also the "Opening …" status screen while a book is loading from an open book (7.12). Written below as "under phonebar" (`body.phonebar`). |
| New Text sheet layout | Wherever the type pane is already a bottom sheet: Pop's private `phone()` (app.js:1408), the same `(max-width: 560px)` query as the global `isPhone()` (app.js:41). This includes the phone library screen and narrow desktop windows. |
| More sheet without the dock's entries | Under phonebar only. The library screen and narrow mouse windows keep the full menu. |
| Interface font, sentence case | Everywhere. |

## 4. The reading screen, dock closed

### 4.1 Layout

- **No header.** Under phonebar the `<header>` is `display: none`, after PhoneBar has moved its live children out (7.2).
- **Top inset.** The text starts `max(20px, env(safe-area-inset-top))` from the top, in both flows. Zen keeps its own `max(14px, env(safe-area-inset-top))` (app.css:1397).
- **Footer strip** (new `#readFoot`), fixed to the bottom, full width, background `var(--bg)`:
  - height `FOOT = 92px + env(safe-area-inset-bottom)`; while the read-aloud player shows, the strip sits on the player and its height is 92 px (the player already pads the safe area, app.css:1659);
  - text never shows under it (7.5);
  - it holds the note on the left and the lamp button on the right.
- **Lamp button** (new `#dockBtn`):
  - 56 × 56 px circle, 20 px from the right edge, 28 px from the bottom of the strip (plus `env(safe-area-inset-bottom)` when the strip sits at the screen edge);
  - surface `var(--panel)`, 1 px `var(--line)` border;
  - icon: the new `lamp` line icon (9.3), its bulb filled with `var(--lamp)`;
  - **progress ring**: an SVG circle on the button's edge, 2 px stroke in `var(--lamp-mark)` (9.4), starting at 12 o'clock, showing progress through the book. It is updated inside `setProgressBar` (app.js:1987-1991), from the value its callers pass (`updateProgress`, 1978-1985; the scroll listener, 11779);
  - accessible name "Reading controls", `aria-describedby` a visually hidden "{p}% through the book", `aria-expanded` mirroring the dock, `aria-controls="phoneDock"`;
  - a tap, Enter or Space opens the dock; a hold switches Day/Night (6.2) through the existing `longPress` helper (app.js:57).
- **Note** (new `#leftNote`), bottom-left, vertically centred on the lamp, 13 px `var(--muted)`, `aria-live="off"`:
  - shows the time left in the chapter (4.2), e.g. "4 min left in chapter";
  - books without chapters show the whole-book time, e.g. "4 min left";
  - the note always starts with a capital: its first letter is upper-cased for the interface language ("Under a minute left", "Nog 4 min");
  - empty when there is no estimate yet; hidden while read aloud plays (7.10) and in zen (7.11).
- **Hidden under phonebar, zen included:** the 3 px `#progress` line (the ring replaces it), the `#progressInfo` pill and `#pager`. `#pgInfo` keeps being written: Section's MutationObserver (app.js:11255) and the tests read it.

### 4.2 Time left in the chapter

- **Chapter** = from the last top-level contents entry at or before the reading position to the next top-level entry, or to the end. Levels as `Toc.docEntries` gives them (app.js:4112-4131: an EPUB's nav entries, otherwise h1–h4 levelled to the shallowest); for PDFs, top-level entries of `Toc.pdfEntries` (4132-4158, which resolves asynchronously; `currentSection` caches it, 1938-1955).
- If the only entry is the book's own title, or there are no entries, the note uses the whole-book time.
- The dock's title line keeps showing the nearest entry at any depth, as today.
- **Text documents:** words from the reading position (top of the view in Scroll flow, first word of the page in Pages flow) to the chapter's end offset, divided by `Pace.docWpm()`.
- **PDFs:** pages to the next top-level outline entry, divided by `Pace.docPpm()`.
- **Format** (new strings, built like Progress's private `fmt()`, app.js:8004-8010): "Under a minute left in chapter", "{n} min left in chapter", "{h} h {m} min left in chapter", "{h} h left in chapter". The whole-book form reuses `fmt()`.
- Recomputed from `Progress.tick` (every scroll and page turn).
- **New hooks:** the top-level entry offsets for text (from Toc's levels through Section's offsets, app.js:11214-11223), the next top-level outline page for PDFs, and a Pace helper that counts words between two offsets (Pace's word index exists but is not exported).

## 5. The dock

### 5.1 Opening

| Route | Scroll flow | Pages flow | E-ink | Zen |
|---|---|---|---|---|
| Tap, Enter or Space on the lamp | yes | yes | yes | no, it leaves zen (7.11) |
| Tap on blank space in the middle band (0.35–0.65 of the width), at any height | no | yes | no (taps turn pages) | no |
| Tap in the bottom strip (`BAR_STRIP`, app.js:11648-11652), or on a blank part of `#readFoot` | no | yes | no | no |
| Vertical swipe up (> 55 px) starting on the page | no | yes | no | no |

In Pages flow the top strip loses its special role and behaves like the rest of the page: the left and right edges turn the page, a blank tap in the middle opens the dock, and a word there is looked up.

A tap on a word keeps opening the dictionary in every flow. In Scroll flow nothing but the lamp opens the dock.

### 5.2 Closing

- A tap anywhere outside the dock. A transparent catcher (`#phoneDockScrim`) covers the page; that tap does nothing else: no lookup, no page turn, no highlight menu.
- A swipe down that starts on the dock or on the catcher, in every flow, e-ink included. These have their own touch handlers: today's swipe handler only sees touches that start on `#docView` or `#pdf` (app.js:11676).
- Escape (7.7).
- Back, the title, Search or any of the tools: the dock closes first, then that action runs.
- `PhoneBar.place()`: rotation across 560 px, a pointer change, leaving the book, switching books.

**The Day/Night switch and the position slider act in place: the dock stays open.**

### 5.3 While it is open

- The page stays visible and undimmed but holds still: no scrolling, no reaction except closing.
- The dock overlays the page. It never changes `availHeight()`, the page count or `#dock`'s measured height.
- The dock covers `#readFoot` (the lamp and the note) and the read-aloud player. They stay where they are, so nothing re-paginates.
- The dock is `role="dialog"`, `aria-modal="true"`, labelled "Reading controls". Everything else is inert while it is open, as Side does with its `BEHIND` list (app.js:2762-2766).
- Focus moves to the dock container (`tabindex="-1"`). Tab order follows the visual order. On close, focus returns to `#dockBtn`.

### 5.4 Layout, top to bottom

As in *Mix: dock open*:

1. A decorative grab handle.
2. **Header row**, 48 px:
   - new `#dockHome`: the existing `chevronL` icon, name "Back to library", calls `Library.home()`;
   - `#fname`, moved here: the title in 'LL Title' 17 px with the section line under it (today's `data-sec` mechanism), a 16 px chevron-down after the title; it keeps opening the Open books switcher (app.js:10937-10974);
   - `#searchBtn`, moved here.
3. **Position row**:
   - new `#dockPos` (`input type=range`, label "Position in book", visually hidden), with `aria-valuetext` equal to its caption;
   - Pages flow, and PDFs in both flows: min 1, max = page count, step 1;
   - Scroll flow for text: 0–100, step 1 (percent of the document);
   - caption under it: left "Page {n} of {m}" (or "{p}%" in Scroll flow for text), right the chapter time from 4.2;
   - the caption follows the thumb while dragging; the jump happens on release (`change`): `gotoPage(value − 1)` for text (it takes a 0-based page, app.js:1793), `state.pdfPageNum = value; renderPdfSingle()` for a PDF in Pages flow (as the End key does, app.js:11699), `Toc.goPdfPage` for a PDF in Scroll flow, or a scroll to the fraction; then `Journal.jumped()`;
   - arrow keys move one page, or 1 %.
4. **Day/Night switch**: two buttons, Day (`sun` icon) and Night (`moon` icon), in a group labelled "Day or night", each with `aria-pressed` per 6.1. Hidden in e-ink mode.
5. **Tool row**: `#actRow`, moved from `#dock` into `#phoneDock`. It holds `#tocBtn`, `#gear`, `#speakBtn`, `#lamp`, `#more`, same ids, same order. Each shows an icon above a visible label: Contents, Text, Read aloud, Theme, More.
   - `#speakBtn` is the filled one, as in the mockup: background `var(--accent)`, text `var(--on-fill)`. While reading aloud its label reads "Stop" and its name "Stop reading aloud" (existing, app.js:10885-10892).
   - Without speech synthesis `#speakBtn` is hidden (app.js:13635), leaving four tools.
6. Bottom padding 24 px + `env(safe-area-inset-bottom)`.

**Visual:** background `var(--panel)`, 1 px `var(--line)` top border, 24 px top corner radius, no shadow. `max-height: 85dvh` with internal scroll.

### 5.5 What each control does

Back, the title, Search and the tools close the dock first, then do today's action:

| Control | Action |
|---|---|
| Back | `Library.home()` (stops read aloud and auto-scroll, leaves zen, keeps the tabs) |
| Title | Open books switcher |
| Search | Search |
| Contents | Contents panel |
| Text | The Text sheet (section 8) |
| Read aloud | Start or stop reading; the player appears at the foot (7.10) |
| Theme | Today's theme sheet, with the day and night pickers always shown (6.4) |
| More | Today's More sheet without the four entries the dock now has (below) |

**The More sheet under phonebar** drops:

- Read aloud and Contents from the quick row (app.js:6806, 4224);
- Search from the Reading group (4828);
- Library from the Lamplight group (10674).

The quick row keeps Bookmark here and Previously…, as two tiles side by side. On a device without speech synthesis, where `#speakBtn` is hidden, the More sheet keeps its Read aloud tile, which stays enabled for the natural and ElevenLabs voices (app.js:6807).

**Holds:** a hold on `#speakBtn` opens Voices (app.js:6798), unchanged. Under phonebar `#lamp` (the Theme tool) has no hold, because the Day/Night switch sits right above it; desktop keeps the hold on `#lamp`.

## 6. Day/Night

### 6.1 The pair and the highlighted half

- The pair is `state.autoDay` / `state.autoNight` (Day / Dusk by default), whether or not Auto is on.
- New helper `dnOf(themeId)`, checked in this order:
  1. `'day'` if it is the day theme, `'night'` if it is the night theme (if both are the same theme, `'day'`);
  2. otherwise, Contrast (`hicon`) counts as `'day'` and Contrast dark (`hidark`) as `'night'` (6.3);
  3. otherwise `null`: neither half is highlighted.

### 6.2 One setter

New `setDayNight('day' | 'night')`, used by the dock switch, the `t` key and the holds:

- **target:** the pair's theme for that half. When the theme on screen is Contrast or Contrast dark and not in the pair, the target is Contrast or Contrast dark (6.3). When the pair is collapsed (`autoDay === autoNight`, left in saved prefs by the bug or set in the pickers), Night goes to Dusk from a light theme and Day goes to Day from a dark one, as today's fallback does (app.js:10905);
- goes through `crossFade` as `pickTheme` does (app.js:11306-11312);
- **never calls `AutoTheme.userPicked`**. This fixes the bug: today `toggleDayNight` → `selectTheme` → `userPicked` (app.js:10900-10907, 11292-11297, 892-897) writes the other theme into the current period's slot, so the pair collapses;
- does not add a Recent entry (`noteTheme`);
- `t` and the hold show the "{name} theme" toast (today only the hold does, app.js:10976). The dock switch shows no toast; its pressed half is the feedback.

`toggleDayNight()` becomes: the opposite half of `dnOf(current)`; when that is `null`, a light theme goes to Night and a dark theme to Day (today's rule, pinned by tests/themes-browser.js).

### 6.3 High contrast

When Contrast or Contrast dark is on screen and is not part of the reader's pair (for example a first-run high-contrast reader on the default Day/Dusk pair), Day means Contrast and Night means Contrast dark, so they never leave high contrast by accident. A pair that includes a contrast theme is used as it is.

### 6.4 Theme sheet

- The day and night pickers are shown whatever Auto is set to. Today they are hidden while Auto is off (app.js:1588, 881).
- They stay two pickers: a tap opens the list to choose that half's theme.
- The half on screen is marked by `dnOf()`, with Auto on or off (today only with Auto on, app.js:1580).

### 6.5 With Auto on (Follow phone or On a schedule)

A tap holds until the next automatic switch, then Auto carries on:

- `setDayNight` stores an override `{ theme, period: 'day' | 'night', until }` as a new, validated `ll_prefs` field, so it survives closing the app;
- `period` is the period at the time of the tap (`AutoTheme.isNight()`);
- `until` is the next schedule boundary (On a schedule), or now + 12 hours (Follow phone): the app cannot see the phone switch while it is closed, so with Follow phone the hold ends at the first switch the app sees or after 12 hours, whichever comes first;
- AutoTheme's private `wanted()` (app.js:847) returns the override's theme while `now < until` and the current period equals `period`; otherwise it clears the override and returns the pair's theme;
- the boundary timer, the 30 s poll, the media-query change, `visibilitychange` and boot all go through `wanted()`;
- **only `setDayNight` writes the override.** Every other theme choice clears it before applying: a tile pick (`pickTheme` / `selectTheme`), a change of the day or night theme (`setPair`), a change of Auto mode (`setMode`) and a change of the schedule hours.

### 6.6 E-ink

The dock's switch is hidden. `t` and the hold keep changing the theme used once e-ink is off, and show the "{name} theme" toast, as the hold does today.

### 6.7 Tile picks with Auto on

Unchanged in this stage: picking a theme tile while Auto is on still makes it that period's theme (`userPicked`). Its toast, which today promises the opposite ("this theme lasts until the next switch", app.js:11320), is corrected to say what happens: "Day and night is on: {name} is now your night theme." and a day variant.

## 7. Architecture

The approach: grow `PhoneBar` (app.js:10909-10979) into the owner of the phone reading chrome and reuse today's buttons, ids and wiring. Rejected: a separate phone shell with its own markup, which would add a third copy of every control binding and rewrite most phone tests.

### 7.1 Owner

`PhoneBar` keeps `on()` and the placeholder-move mechanism, and gains `openDock()`, `closeDock()`, `toggleDock()` and `isDockOpen()`, a `body.dock-open` class, and the moves in 7.2. All are exported on `window.__ll.PhoneBar` for tests.

### 7.2 DOM moves under phonebar

Comment placeholders as today:

- the five tools into `#actRow`, which now lives in `#phoneDock`;
- `#searchBtn` and `#fname` into the dock header;
- `#moreMenu` to body level, because a `display: none` header hides it (probe: `.open` with 0 client rects). `#moreScrim` does not exist until the first `Menu.open`, which today appends it to `#moreWrap` (app.js:2912-2916): it now appends the scrim next to `#moreMenu`'s current parent, and `place()` moves an existing scrim together with the menu. Menu's outside-click test (app.js:2931) becomes `closest('#moreWrap, #moreMenu')`.

Leaving phone reading moves everything back and closes the dock.

### 7.3 New elements and stacking

`#readFoot` (holding `#leftNote` and `#dockBtn`), `#phoneDockScrim` and `#phoneDock`:

- direct children of `body`, after `#dock`, outside `#dock`'s and the header's stacking contexts;
- hidden unless `body.phonebar`;
- added to Side's inert list `BEHIND` (app.js:2762).

Stacking, bottom to top, with today's values unchanged and the new layers in brackets:

| z-index | Layer |
|---|---|
| — | the page |
| [15] | `#readFoot`, below `#dock`, so the player's speed popover and status pill (drawn above `#tts` inside `#dock`, app.css:1699-1700, 1732) stay on top of the strip |
| 16 | `#dock` (the read-aloud player) |
| 17 | `#autoBar` |
| 18 | `#progressInfo` (hidden under phonebar) |
| 19 | `#ruler` (a film that dims what is under it) |
| 20 | the header (desktop) |
| 26, 27 | `#finish`, `#recap` |
| [28] | `#phoneDockScrim`, then `#phoneDock` (later in the DOM). The open dock covers the Finished card and the Recap; they are back when it closes. |
| 29, 30 | `#sheetScrim`, `#sheet`; `#moreScrim`, `#moreMenu` |
| 31, 32 | `#popScrim`, `#pop` |
| 40 | `#progress` |
| 44, 45 | `#sideScrim`, `#side` |
| 57 | `#trStatus` |
| 58 | `#markPop`, `#songPop`, `#dictPill` |
| 59, 60 | `#dictScrim`, `#dictCard`; `#rsvp` |
| 70–72 | the toasts, above everything, as today |

### 7.4 Header

- `display: none` under phonebar. It stays the first `<header>` and a direct child of `body`, since `headVar`, the header ResizeObserver, `availHeight` and `Library.headerHeight` query it (app.js:1717, 1739, 1744, 3050), so `--headH` becomes 0.
- The hide-on-scroll logic (app.js:11788-11799) is skipped under phonebar. `setProgressBar`, `Progress.tick` and `Library.notePosition` still run.

### 7.5 Layout maths

- `#dock` keeps `#tts` and `#pager`; `#actRow` has moved out. Under phonebar `#pager` is `display: none !important` (its display is set inline at app.js:1879; zen uses the same override), so `--dockH` is the player's height while it shows and 0 otherwise.
- `availHeight()` (app.js:1742-1751) under phonebar: `innerHeight − (main's computed top padding) − --dockH − strip − 14 px`, where strip is `FOOT` without the player and 92 px on top of it. It skips today's +56 px "no pager" allowance (1749) and the fixed 26 px (1750, which assumes the 12 px top padding of app.css:1341). The player is counted once, through `--dockH`.
- Scroll flow: `main` gets a bottom padding of the strip + 24 px, so the last line clears it.
- Zen keeps the strip reserve, so text never runs under the faint lamp.

### 7.6 Gestures

**Pages flow, under phonebar** (`tapNav`, app.js:11653-11668; swipes, 11673-11689):

- the top strip check goes; the bottom strip check opens the dock instead of toggling bars;
- a blank tap in the middle band opens the dock; the left and right edges turn the page;
- a swipe up that starts on the page opens the dock;
- horizontal swipes still turn pages, but are ignored when they start inside `#phoneDock`, `#readFoot`, any sheet or scrim, or a range input (today a drag on a slider turns the page);
- `#readFoot` gets its own tap listener for its blank parts (tapNav is bound to `#docView` and `#pdf` only, app.js:11667-11668);
- `#phoneDock` and `#phoneDockScrim` get their own swipe-down listener (5.2);
- e-ink and zoomed-PDF exceptions stay as they are; in zen none of the openers act.

**Scroll flow:** no new taps.

Desktop keeps today's gestures.

### 7.7 Escape and focus

The open dock sits above the Finished card and the Recap, so the rule is one-way:

- the dock's Escape listener runs in the capture phase on `document`. It acts only when none of these is open: `#sheet`, Pop, Menu, Side, `#dictCard`. It then closes the dock and stops propagation, so the same key press does nothing else;
- Zen's private `somethingOpen()` (app.js:9448-9452) and the Finished-card and Recap Escape guards (9163-9167, 10288-10292) count the open dock, so Escape closes the dock first;
- one helper redirects focus-return targets that sit inside a closed dock to `#dockBtn`. `Pop.close`, `Menu.close`, `Side.close` and `setSheet` use it. Today they would focus a hidden button and focus would fall to `<body>`.

### 7.8 Pace

Pace's private `overlayOpen()` (app.js:7077) and `softBlockers()` (7119-7130) count the open dock (`body.dock-open`): time with the dock open is not reading time, and moves made while it is open (the slider) count as navigation (`burstNav`, 7086). Opening and closing call `Pace.noteBlock('dock')` (7946). Under phonebar Pace's bottom edge of the visible text (`dockHeight()`, 6956, used by `bottomCharOffset` 6958-6971, `guessVisibleWords` 7008-7013 and the PDF page limit at 7047) and `Library.bottomCharOffset` (3086-3105) use the strip plus `--dockH`, so text hidden under the strip never counts as read.

### 7.9 Things that float above the bottom

On phones these sit above the strip (and the player when it shows):

- the toasts (including Undo), `#updateToast`, `#trStatus`, `#autoBar` (right-aligned above the lamp) and `#finish`, through `--aboveDock` and `--toastRow`;
- while the dock is open, the toasts move above the dock, so an Undo toast never covers the tools;
- `#recap` hangs from the top: on phones its top becomes `max(10px, env(safe-area-inset-top))` and its max-height ends 12 px above the strip;
- the reading-ruler grip stays above the strip;
- Speak's private `ensureVisible()` (app.js:5963-5974) keeps the spoken sentence above the strip and the player.

Desktop values stay as they are (pinned by tests/ui-b.js:251-272).

### 7.10 Read aloud

- `#tts` stays a full-width bar at the very bottom.
- `#readFoot` sits directly on it, 92 px tall, and `#leftNote` hides.
- The open dock covers `#tts`. It is not hidden or resized, because a change in `#dock`'s height re-paginates (app.js:1736-1740).

### 7.11 Zen on phones

- Entering zen closes the dock and hides `#leftNote` and the ring. The 3 px line stays hidden (4.1).
- `#dockBtn` stays at 40 % opacity (100 % on focus). A tap on it leaves zen; it does not open the dock. The dock's other openers do nothing in zen.
- The strip stays reserved (7.5). The top padding is zen's `max(14px, env(safe-area-inset-top))`.
- Zen's two toasts get a phone wording: "Zen mode — tap the lamp to leave" (app.js:9432) and "Tap the lamp to leave zen mode" (9467).

### 7.12 Switching books

- `on()` stays true while `state.opening` is true after an open book, so the "Opening …" status screen keeps the phone chrome: no header flash (today place() turns phonebar off for about 260 ms).
- During loading the dock is closed and `#readFoot` is hidden.
- A failed open (`fail()`, app.js:2028-2034, `state.opening` false) turns phonebar off, so the header, the wordmark and Open come back.

### 7.13 Rotation and other flips

`place()` closes the dock, moves every part back, and keeps the Scroll-flow position the way zen does (note `Library.topCharOffset()` before, `revealOffset` after; app.js:9418-9441), since the header's 57 px now appear and disappear.

### 7.14 Status bar colour

Under phonebar, `meta[name=theme-color]` takes the theme's `--bg` (the page); otherwise `--panel`, as today (app.js:809-811). Re-run from `place()` and `applyTheme()`.

### 7.15 Safe areas

- The viewport meta gains `viewport-fit=cover` (index.html:5), which also brings the 15 existing `env()` rules to life.
- Top inset as in 4.1. The strip, the dock and `#tts` use `env(safe-area-inset-bottom)`.
- In landscape (today's bar), the elements anchored to a side keep their padding and grow to clear the notch, with `max(<today's value>, env(safe-area-inset-left))` and the same on the right: `header .bar` (app.css:146, 1334, 1346), `main` (851-852, 1340-1341), `#pager` (1316), `#tts` (1659), `#autoBar` (1639) and `#side` (1505).

### 7.16 Other screens

- **Phone library screen:** same layout and glyphs as today (wordmark, Aa, bulb, ⋯, Open), with the new font, casing and Text sheet.
- **PDFs:** same chrome. The chapter is the top-level outline entry, time is pages over pages-per-minute, and the slider counts pages in both flows.

## 8. The Text sheet (phone layout)

Applies under Pop's `phone()`. Desktop keeps today's popover. Rows have labels above their controls, every target is at least 48 px, and the `.prow` class stays.

### 8.1 Head

The title "Text" and a 48 px close button, "Close text settings", as in the mockup.

### 8.2 Size

- `#smaller` (A−), the value `#qSizeV` (in the reading font, without "px", `aria-live="polite"`), `#bigger` (A+): 56 px buttons, with their existing names.
- `bump()` is unchanged (14–28 px; PDF zoom 60–250 % in 10 % steps).
- At an end the button gets `aria-disabled="true"`: it stays focusable and a press does nothing. The ends are size 14 or 28, and zoom when `Math.round(state.zoom * 100)` is 60 or 250 (the steps drift in floating point).
- The sliders `#qSize` and `#qZoom` are hidden in this layout. Desktop keeps them.

### 8.3 Line spacing

Three choice buttons with a pictogram and a label, `aria-pressed`, in a group labelled "Line spacing":

| Choice | `state.lh` |
|---|---|
| Tight | 1.5 |
| Normal (default) | 1.75 |
| Airy | 2.0 |

A tap sets `state.lh` and calls `applyType()`. A choice is pressed when `|lh − value| < 0.001`. The Spacing slider row (`#qLh`) is hidden in this layout.

### 8.4 Margins

Three choice buttons, same pattern, in a group labelled "Margins":

| Choice | `state.margin` |
|---|---|
| Narrow (default, today's look) | 0 |
| Medium | 12 |
| Wide | 28 |

The Width slider row (`#qW`) is hidden in this layout. If the saved `state.width` is narrower than the text column on this screen (320 or 340 on most phones), a tap on a margin choice also resets `width` to its default (720), so the choice is what the reader sees.

### 8.5 Values between the choices

A saved value that matches no choice (from the full settings, or an older version) shows no choice pressed, and the row shows "Custom 1.6" for line spacing (two decimals with a trailing zero dropped, through `dec()`, which also gives the Dutch comma) or just "Custom" for margins. Nothing changes until a tap. Prefs never snap these values.

### 8.6 Fonts

- A row of four buttons. Each shows "Aa" in its font's face, with the font's name below in the interface font, 13 px, centred, up to two lines, as in *Dock: text settings*. A one-word name too wide for its button breaks at an inner capital (Open / Dyslexic) or ends in an ellipsis.
- The four: Georgia (`serif`), Literata (`literata`), Atkinson Hyperlegible (`hyper`), System sans (`sans`). None needs a download.
- If `state.font` is another font, it takes the fourth slot, so the current font is always shown and pressed.
- **All fonts** opens the Fonts panel through a new option on `Fonts.openPanel` (today it takes no arguments and passes its own `closed()`, app.js:1367-1368). Side.open closes the Text sheet (2783); the panel's close reopens it.
- Font previews are requested when the sheet opens, never at startup.
- `#fontQuick` (the select) stays for desktop.

### 8.7 The rest

- **Flow:** `#qFlow`, unchanged.
- **Fine-tune:** `#qMore`, relabelled "Fine-tune" in the phone layout, closed by default, with a second line "Weight, letter and word spacing, focus reading". Inside: weight, letter spacing, word spacing, focus reading. Same ids. Desktop keeps "More".
- **All text settings:** `#typeMore`. For a PDF it opens the PDF section (`#pdfGroup`) instead of the dimmed Text group, in both layouts.
- **PDF:** the sheet holds the Zoom stepper, Soften pages, Flow and All text settings.
- **Focus:** on open, to `#smaller`; on close, back to the opener (a closed dock's opener redirects to `#dockBtn`, 7.7).
- **Height:** fits 85 dvh at 390 × 844 with Fine-tune closed, and scrolls inside otherwise.
- **Settings sheet:** its label "Spacing" (index.html:276) becomes "Line spacing", a new i18n key (10).

## 9. Look

### 9.1 Interface font

- A new alias `'LL UI'` for the bundled Atkinson Hyperlegible files: 400, 700, 400 italic, 700 italic. They are already precached in sw.js, so nothing new is bundled.
- `--ui-font: 'LL UI', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, app-wide, including the dictionary card's injected CSS.
- The alias keeps the interface's family name apart from the reading font "Atkinson Hyperlegible", whose @font-face rules (app.css:86-89) point at the same four files (`FONTS.hyper` has no files of its own, app.js:341).
- Titles stay 'LL Title' (Literata). Reading fonts are unaffected.
- Only 400 and 700 exist, so rules asking for 500 render at 400 and 600 at 700.

### 9.2 Sentence case

- Remove `text-transform: uppercase` and the letter-spacing from the 15 rules in app.css and the 2 in the injected card CSS (app.css:335, 407, 417, 699, 830, 993, 1539, 1812, 1831, 1858, 1966, 1969, 1998, 2123, 2200; app.js:11938, 12033).
- Each keeps its colour, weight and background. Their size moves from `--fs-eyebrow` (12 px) to `--fs-small` (13 px; 15 px in the contrast tone).

### 9.3 Icons

New entries in the `ICONS` table (24 px box, 1.75 stroke, round caps):

- `type`, an "Aa" drawn in strokes, for Text (`ICONS.aa`, the settings sheet's "Aa" heading glyph, app.js:1395, 11035, stays as it is);
- `bulb` for Theme, its glass filled `var(--lamp)`;
- `lamp`, a desk lamp, for `#dockBtn`;
- six pictograms: `lhTight`, `lhNormal`, `lhAiry`, `mgNarrow`, `mgMedium`, `mgWide`.

Under phonebar, `#gear` shows `type` and `#lamp` shows `bulb` (with their labels). The desktop bar and the library header keep today's "Aa" text and CSS bulb (app.css:202, 255-261). The existing `chevronL`, `sun` and `moon` serve Back and Day/Night.

### 9.4 Colours

- Themes are unchanged in this stage.
- New derived token `--lamp-mark`, set in `applyTheme()`: `--lamp` mixed toward `--ink` in 5 % steps until it reaches 3:1 against `--panel` (the surface under the ring and the slider). Every built-in theme already passes, since tests/themes.js holds the lamp at 4.5:1 on bg, panel and raise; in practice it only changes custom themes, whose lamp is their accent (app.js:801).
- The dock and the lamp use existing tokens: `--panel`, `--line`, `--ink`, `--muted`, `--accent` for selection, focus and the filled Read aloud, `--on-fill` for text on it.

### 9.5 Modes

- **Contrast tone:** 2 px borders on `#dockBtn`, the dock edge, the Day/Night switch and the choice buttons; nothing under 15 px, so tool labels are 15 px and may wrap.
- **Forced colours:** the ring stroke is Highlight; borders are ButtonText; the filled Read aloud gets a 2 px Highlight border.
- **E-ink:** no motion; everything black on white; the ring stays an SVG stroke; the new parts join the e-ink rules (app.css:2248-2370).
- **Reduced motion:** the dock appears without sliding.
- **Print:** `#readFoot`, `#phoneDockScrim`, `#phoneDock` and the body-level `#moreMenu` and `#moreScrim` join the print hide list (app.css:2381-2382).

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
| Under a minute left in chapter | Nog geen minuut in dit hoofdstuk |
| {n} min left in chapter | Nog {n} min in dit hoofdstuk |
| {h} h {m} min left in chapter | Nog {h} u {m} min in dit hoofdstuk |
| {h} h left in chapter | Nog {h} u in dit hoofdstuk |
| Line spacing | Regelafstand (new key; today the word exists only under "Spacing") |
| Tight / Normal / Airy | Krap / Normaal / Ruim |
| Narrow / Wide | Smal / Breed ("Medium" → "Gemiddeld" and "Margins" → "Marges" exist) |
| Custom {v} | Aangepast {v} |
| Custom | Aangepast (a new key for this sheet; "Custom" → "Eigen" stays for custom themes) |
| Fine-tune | Fijnafstelling |
| Weight, letter and word spacing, focus reading | Gewicht, letter- en woordafstand, focuslezen |
| All fonts | Alle lettertypen |
| Close text settings | Tekstinstellingen sluiten |
| Tap a word for its meaning. Tap the lamp for your reading controls. | Tik op een woord voor de betekenis. Tik op de lamp voor je leesbediening. |
| Scroll: tap the lamp for your reading controls. Pages: tap the left or right edge, or swipe sideways, to turn; swipe up or tap the lamp for your reading controls. | Scrollen: tik op de lamp voor je leesbediening. Pagina’s: tik op de linker- of rechterrand of veeg opzij om om te slaan; veeg omhoog of tik op de lamp voor je leesbediening. |
| While reading, tap the lamp for read aloud, stats, zen mode and more. | Tik tijdens het lezen op de lamp voor voorlezen, statistieken, zenmodus en meer. |
| Zen mode — tap the lamp to leave | Zenmodus — tik op de lamp om te stoppen |
| Tap the lamp to leave zen mode | Tik op de lamp om de zenmodus te verlaten |
| Day and night is on: {name} is now your night theme. | Dag en nacht staat aan: {name} is nu je nachtthema. |
| Day and night is on: {name} is now your day theme. | Dag en nacht staat aan: {name} is nu je dagthema. |
| You can add it later: More › Mark as finished | Je kunt het later toevoegen: Meer › Als uitgelezen markeren |

Existing strings reused: Day, Night, Day or night, Stop ("Stoppen"), Stop reading aloud, Contents, Text, Read aloud, Theme, More, Search in the document, Smaller text or zoom out, Larger text or zoom in, Flow, Margins, Medium.

Where they appear:

- The first-document tip ("Tip: tap any word for its meaning", app.js:11260-11277) uses the new two-sentence line on phones; desktop keeps the old tip.
- `#flowHint` (index.html:155, the settings sheet's flow hint) gets the phone line; desktop keeps the old one.
- The start screen's third tip (index.html:346) gets the phone line on phones.
- The two zen toasts get the phone lines on phones (7.11).
- The tile-pick toast (6.7) and "You can add it later: More › Mark as finished" (app.js:9135) replace today's strings everywhere; the old keys go.

## 11. Docs and release

- README:
  - the shell paragraph (README.md:48), the phone reading row (49), the Pages-flow gestures (51), the Day ⇄ Night paragraph and holding the lamp (52), and zen (62);
  - the "thirty themes" alt text (20);
  - regenerate docs/screenshots/explain-phone.png, the one phone picture (tests/screenshots.js:168-179), by hand: all.js skips screenshots.js.
- Bump `VERSION` in sw.js, since app.js, app.css, index.html and i18n.js change.
- Update the stale comments the change touches: the tip copy and the hold comment at app.js:10975.

## 12. Testing

### 12.1 Baseline before any change

Recorded in this session with `NODE_PATH=$(npm root -g) node tests/<file>.js`.

**Already red:**

| File | Result | Failures |
|---|---|---|
| themes-browser.js | 11/16 | :38, :41, :57, :79, then a TypeError at :80 that ends the run |
| qol.js | 33/35 | :171-172, then a 30 s tap timeout at :176 that skips 6 checks |
| type2.js | 60/62 | |
| ui-a.js | 113/114 | |
| fonts.js | 83/85 | |
| i18n.js | 11/12 | |
| ui-c.js | 46/50 | :312, plus three timeout blocks |

**Green:** ui-b.js 117/117, regression.js 64/64, zen.js 40/40.

The plan starts by re-running the full suite and saving the list of failing checks, by name.

### 12.2 Existing tests to change

Checks that tap the old phone row or assert behaviour this design changes. Each is rewritten for the new behaviour; checks for removed behaviour (the bars hiding and showing) become checks of the dock.

- qol.js:58-99 (the bar, the row, the title, the speaker), 131-178 (More, the theme sheet, Day/Night), 213-239 (Pages-flow taps and swipes: the bottom edge and a blank middle tap now open the dock, the top edge does nothing special). Its single try-block (46-201) is split, so one failure no longer skips the rest.
- ui-a.js:351-378, 399-410, 426-428 (392 runs on the start screen and needs no change).
- ui-b.js:108-134 (the phone More sheet, its quick row of two tiles and the first-focused tile), 323 (`--headH` is 0 under phonebar), 409.
- type2.js:388-392 (the 390 px screenshot pass). type2.js:127-145 and :204 are desktop checks and must keep passing unchanged.
- i18n.js:63-77 (the phone More sheet's Dutch entries; "Voorlezen" is no longer in it).
- zen.js:170-176 (phone zen: the page height now leaves the strip).
- print.js:58 (the new parts are hidden in print).
- regression.js:303.
- fonts.js:32, 46, 67 (the interface font loads at start).

Suites that run with `hasTouch` also get phonebar but touch none of the moved chrome (library2, notes2, stats2, print:127, reading:75/104, about:189, explain2:198, simplify:195, ui-c:297/335); they must stay as they are.

### 12.3 New tests/phonedock.js

Phone 390 × 844 with touch, plus 320 × 568 where noted. tests/all.js picks it up by itself (tests/all.js:9-10).

1. Reading state:
   - no header box;
   - `#readFoot` and `#dockBtn` at the specified places, with safe-area emulation;
   - the ring's dash follows progress;
   - `#leftNote` reads "… left in chapter" at a top-level chapter, and the whole-book form for a book without chapters;
   - no text visible under the strip in either flow.
2. Each opening route in 5.1, and each one that must not work: a Scroll-flow tap on blank space, an e-ink middle tap, a tap in zen.
3. Each closing route in 5.2. The closing tap must not look up a word or turn a page. The switch and the slider leave the dock open.
4. The dock never changes the page count in Pages flow.
5. The tools open their sheets, and focus returns to `#dockBtn`. The phone More sheet no longer lists Read aloud, Contents, Search or Library; its quick row has two tiles.
6. Position slider: Pages flow, Scroll flow and PDF jumps; keyboard steps; captions and `aria-valuetext`.
7. Day/Night:
   - pressed states for the day theme, the night theme and neither;
   - `t`, the switch and the hold agree;
   - with Auto on, the pair is never overwritten; the override survives a restart before the boundary and is gone after a restart past it (fake clock); with Follow phone it ends after 12 hours;
   - with an override active, a tile pick is still on screen after the 30 s poll;
   - Contrast / Contrast dark, both on the default pair and in a pair that contains Contrast dark;
   - a collapsed pair;
   - hidden in e-ink;
   - no Recent entry.
8. Text sheet:
   - stepper limits and `aria-disabled`;
   - the spacing and margin choices set the documented values;
   - a custom value shows "Custom 1.6", margins "Custom";
   - the font row with a fifth font in use;
   - All fonts returns to the sheet;
   - the PDF variant;
   - the 320 px fit.
9. Read aloud: the player at the foot, the lamp on top of it, the note hidden, the speed popover not covered by the strip, and the player covered (not resized) while the dock is open.
10. Zen: a faint lamp, a tap leaves zen, the openers do nothing.
11. Switching books (no header flash; a failed open brings the header back); rotation with the dock open (closed, parts back, position kept).
12. Escape order: Escape with the dock open over the Finished card closes the dock only.
13. Floating pieces: where the toasts, `#autoBar` and `#finish` sit with the dock closed and open.
14. Modes: contrast tone (2 px, 15 px), forced colours (`page.emulateMedia({ forcedColors: 'active' })`), e-ink, reduced motion.
15. Dutch: labels and captions present, nothing clipped at 320 px.

### 12.4 Acceptance

- No check that passed in the saved baseline fails, except the ones rewritten under 12.2.
- tests/phonedock.js passes.
- The parse checks in .github/workflows/deploy.yml pass.
- Lighthouse accessibility (desktop preset, start page; lighthouserc.json:6) stays at 0.9 or higher. The phone reading screen's accessibility is covered by tests/phonedock.js (names, focus, Dutch).

### 12.5 Order of work

The plan delivers four milestones, each ending with a full test run compared with the saved baseline, so a new failure points at one change:

1. Day/Night: the setter, the override, the pickers, the toasts (desktop too).
2. The interface font and sentence case.
3. The phone Text sheet.
4. The phone reading chrome: the strip, the lamp, the dock, the More sheet, gestures, zen, read aloud, the rest.

## 13. Risks

- **Tests on the phone gate.** Contexts with only `hasTouch` match `pointer: coarse` in Chromium, so more suites than expected see the phone chrome (12.2).
- **Missed moves.** Moving `#moreMenu` and `#actRow` out of their containers can break code that assumes `closest('#moreWrap')` or `#dock` contains them. Grep for both before the move.
- **Taps and keys reaching two layers.** Capture-phase listeners (the dictionary, marks, translation, songs) must not see the closing tap. The catcher sits above the page and swallows it. Escape ordering is explicit (7.7).
- **Layout jumps.** Pages-flow pagination is sensitive to `--headH` and `--dockH`. The dock is an overlay and the strip reserve is constant, so opening and closing never re-paginates; a test pins this.
- **Fragile chapter time.** The time-left figure depends on Pace's estimate, which needs a little reading time first. The note stays empty rather than guessing.

## 14. Decision log

| Decision | Choice | From |
|---|---|---|
| Direction | C's lamp button with B's dock, plus C's Day/Night switch | user |
| Scroll flow | Only the lamp opens the dock; tapping a word still looks it up | user |
| Closing | Tap the page, swipe down, Escape, or pick a tool | user |
| Read aloud | Player stays at the foot; the lamp sits above it | user |
| Zen | A faint lamp leaves zen; the note and the ring hide | user |
| Day/Night meaning | Always the reader's day and night themes, also with Auto off; the pair is visible in the Theme sheet | user |
| Day/Night with Auto on | Holds until the next automatic switch, survives a restart, never overwrites the pair | user |
| Text sheet | Stepper; Tight/Normal/Airy; Narrow/Medium/Wide; defaults unchanged; "Custom" for in-between values | user |
| Font row | Georgia, Literata, Atkinson Hyperlegible, System sans, with the current font in the fourth slot | user |
| Interface font and sentence case | Whole app now | user |
| Landscape, tablets, Back gesture, themes, library | Later stages | user |
| Switch and slider | Act in place; the dock stays open | review |
| Pages-flow top strip | No special role: edges turn, the middle opens the dock | review |
| Zen details | No progress line in zen; the strip stays reserved; the openers do nothing; phone wording for the zen toasts | review |
| Follow phone hold | Ends at the first phone switch the app sees, or after 12 hours | review |
| What a chapter is | Top-level contents entries; the title line still shows the nearest entry | review |
| New icons | Only in the phone reading screen; the desktop bar and the library header keep "Aa" and the bulb | review |
| Sentence case | Each label keeps its colour, weight and background | review |
| Read aloud fill | The accent colour, as in the mockup | review |
| Text sheet extras | A close button in its head; a second line under Fine-tune | review |
| More sheet | Quick row keeps Bookmark here and Previously…; Read aloud stays in More where `#speakBtn` is hidden | review |
| Holds and `t` | No hold on the dock's Theme tool (desktop keeps it); `t` shows the hold's toast; e-ink keeps today's hold behaviour | review |
| Tile pick with Auto on | Behaviour unchanged this stage; its toast now says what happens | review |
| Narrow windows | Windows 560 px and narrower, mouse included, get the phone Text sheet | review |
| Margins and a narrow Width | A tap on a margin choice resets a Width of 320 or 340 to 720 | review |
