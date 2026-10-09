# Phone Reading Screen (Lamp Button and Dock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones, reading becomes the text plus one lamp button that opens a bottom dock with every reading tool. Day/Night becomes one switch that never loses the reader's pair. The Text sheet works with a thumb. The interface font becomes Atkinson Hyperlegible, with sentence-case labels, across the app.

**Architecture:** `PhoneBar` (app.js:10909-10979) grows into the owner of the phone reading chrome. It moves today's buttons (same ids, same wiring) into a new overlay dock outside `#dock`'s measured height, hides the header, and adds a footer strip with the lamp. A new `setDayNight` setter with an Auto-on hold replaces `toggleDayNight`'s path through `userPicked`. The shared type pane gets a phone-only layout. The font and casing are token changes in app.css.

**Tech Stack:** Static HTML, CSS and ES5-style JavaScript (IIFE modules, `var`), no build step. Tests are standalone Node 22 Playwright (Chromium) scripts in `tests/`, using `tests/lib.js`.

**Spec:** `docs/superpowers/specs/2026-10-08-phone-reading-screen-design.md` (version 2). Section numbers below ("§7.3") refer to it.

## Global Constraints

- No build step, no new dependencies, no new asset files. Atkinson Hyperlegible and Literata are already bundled and precached.
- ES5 style as in app.js: `var`, `function`, IIFE modules, no arrow functions or `let`/`const` in app code. Tests may use modern JS.
- Every existing id keeps its name. New ids exactly as named in this plan.
- Every new visible string gets a Dutch entry in i18n.js. Keys are the English text; tests/i18n.js fails otherwise.
- Desktop layout stays as it is, apart from the shared changes in §2 "What desktop sees".
- Gates:
  - phone reading chrome: `body.phonebar`, meaning `PhoneBar.on()` is true;
  - phone Text sheet: Pop's private `phone()`, i.e. `(max-width: 560px)`;
  - More sheet trimming: `body.phonebar`.
- Accessibility floors: touch targets ≥ 48 px; text ≥ 13 px (15 px in the contrast tone); text contrast ≥ 4.5:1; boundaries ≥ 3:1.
- Pinned values:
  - layout: `FOOT = 92px + env(safe-area-inset-bottom)`, 92 px when the strip sits on the player; lamp 56 px at right 20 px and bottom 28 px; dock top radius 24 px, `max-height: 85dvh`; dock slide 200 ms;
  - text sheet: line spacing 1.5 / 1.75 / 2.0; margins 0 / 12 / 28; font row `serif`, `literata`, `hyper`, `sans`;
  - stacking: `#readFoot` z-index 15, `#phoneDockScrim` and `#phoneDock` 28;
  - Follow-phone hold cap: 12 h.
- Tests:
  - run `cd /home/user/Lamplight && NODE_PATH=$(npm root -g) node tests/<file>.js`, checking with `R.check(name, ok, detail)` from `makeReport()`;
  - `tests/all.js` runs every `tests/*.js`;
  - set `LL_SHOTS` to a scratch directory so screenshots stay out of the repo.
- One commit per task on `claude/relaxed-hawking-ltsxdy`:
  - message: one line saying what changes for the reader, then a short body;
  - trailers: `Co-Authored-By: Claude <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S84CT7SXHnTF63as5uaRsZ`;
  - push after each milestone.
- After each milestone, run the full suite and compare it with the baseline from Task 0. No check that passed in the baseline may fail, except the checks a task explicitly rewrites.
- Bump `sw.js` `VERSION` once, in Task 17.

## Review Focus

Inputs and conditions the spec implies but no other test exercises, most likely to bite first. Each is pinned by a test in the task named.

1. A custom theme with a light accent: the filled Read aloud label (`--on-fill` on `--accent`) and the ring (`--lamp-mark`) must stay readable and visible. If panel-on-accent is under 4.5:1, the label uses `--ink` (Task 13).
2. Greek or Cyrillic text in Pages flow: the dictionary sees no words there, so every middle tap opens the dock. The edges must still turn the page (Task 13).
3. A first book with no reading history: the note shows an estimate from the prior, or nothing. Never "0 min", "NaN" or "undefined" (Task 12).
4. Rotating past 560 px while a sheet opened from the dock is up: the sheet keeps working, the dock is closed, and the header comes back (Task 11).
5. Dutch at 320 px in the contrast tone: tool labels at 15 px wrap to two lines without clipping, and the note fits (Task 16).

---

## Task 0: Record the baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-08-phone-reading-screen-baseline.txt`

- [ ] **Step 1: Run every suite on its own and keep its log**

```bash
cd /home/user/Lamplight && export NODE_PATH=$(npm root -g) LL_SHOTS=/tmp/claude-0/-home-user-Lamplight/3f79000a-6d37-5f6d-adcb-02c1a3d4678e/scratchpad/shots
L=/tmp/claude-0/-home-user-Lamplight/3f79000a-6d37-5f6d-adcb-02c1a3d4678e/scratchpad/baseline; mkdir -p $L
for f in tests/*.js; do b=$(basename $f); case $b in lib.js|all.js|screenshots.js) continue;; esac; timeout 900 node $f > $L/$b.log 2>&1; echo "$b exit $?"; done
```

- [ ] **Step 2: Write the baseline file**

For each suite, record "<file>: <passed>/<total>" (from the "checks passed" line) and every `  FAIL ` line verbatim. It must agree with spec §12.1: themes-browser 11/16, qol 33/35, type2 60/62, ui-a 113/114, fonts 83/85, i18n 11/12, ui-c 46/50; ui-b 117/117, regression 64/64, zen 40/40. Record the other suites as found.

- [ ] **Step 3: Commit** (`Record the test baseline before the phone redesign`)

---

## Milestone 1: Day/Night (shared with desktop)

### Task 1: One Day/Night setter that never rewrites the pair

**Files:**
- Modify: `app.js`:
  - `toggleDayNight` (10898-10907) becomes `dnOf`, `setDayNight` and a new `toggleDayNight`;
  - `selectTheme` (11292-11297) gains `opts`;
  - the hold (10976) and the `t` key (11710) call `toggleDayNight({ toast: true })`;
  - `window.llThemes` (11567) gains `dnOf` and `setDayNight`.
- Create: `tests/daynight.js`

**Interfaces:**
- Produces:
  - `dnOf(id: string) -> "day" | "night" | null`, rules in spec §6.1;
  - `setDayNight(which: "day" | "night", opts?: { toast?: boolean })`;
  - `toggleDayNight(opts?: { toast?: boolean })`;
  - `selectTheme(id: string, opts?: { dayNight?: boolean })`: with `dayNight`, it calls neither `AutoTheme.userPicked` nor `noteTheme`;
  - `window.llThemes.dnOf` and `window.llThemes.setDayNight`.

- [ ] **Step 1: Write the failing tests**

`tests/daynight.js` (1200×800 desktop context, page clock installed at 12:00). Helpers:
- `st(page)` → `window.__ll.state`;
- `prefs(page)` → `JSON.parse(localStorage.ll_prefs)`;
- `recent(page)` → `localStorage.ll_theme_recent`;
- `toasts`, as in tests/zen.js.

```js
R.check("t: day → dusk → day", a === "dusk" && b === "day");
R.check("Auto on schedule: two t presses keep the pair", p.autoDay === "day" && p.autoNight === "dusk");
R.check("t adds no Recent entry", recentAfter === recentBefore);
R.check("t shows the '{name} theme' toast", (await toasts(page, /Dusk theme/)).length === 1);
R.check("light theme that is neither (paper): t goes to the night theme", th === "dusk");
R.check("dark theme that is neither (ember): t goes to the day theme", th === "day");
R.check("Contrast on the default pair: t → hidark → hicon", x === "hidark" && y === "hicon");
R.check("pair day/hidark: from hidark t goes to day", th === "day");
R.check("collapsed pair day/day: from day t goes to dusk", th === "dusk");
R.check("dnOf(day/dusk/paper/hicon) = day/night/null/day", JSON.stringify(r) === '["day","night",null,"day"]');
R.check("no page errors", !(page._errors || []).length, (page._errors || []).join(" | "));
```

Turn Auto on with `window.__ll.AutoTheme.setMode("time")`, after setting `state.nightFrom = "21:00"` and `state.nightTo = "07:00"`.

- [ ] **Step 2: Run and see it fail**

Run: `node tests/daynight.js`. Expected: FAIL on the pair, Recent, toast and `dnOf` checks.

- [ ] **Step 3: Implement**

In app.js, per spec §6.1–6.3:
- `setDayNight` picks its target:
  1. the pair's theme for that half;
  2. Contrast or Contrast dark when one is on screen and not in the pair;
  3. the collapsed-pair fallback (Night → `dusk` from a light theme, Day → `day` from a dark one).
- It then runs `crossFade(function(){ selectTheme(target, { dayNight: true }); })` and toasts `_t("{name} theme", …)` when `opts.toast` is set.
- `toggleDayNight`: opposite of `dnOf(state.theme)`; when `null`, `isDarkColor(currentTheme().bg) ? "day" : "night"`.

- [ ] **Step 4: Run, and check nothing regressed**

Run `node tests/daynight.js`: PASS. Then `node tests/themes-browser.js` and `node tests/qol.js`: no failure that the baseline does not have.

- [ ] **Step 5: Commit** (`Day and night: t and the lamp hold no longer overwrite your day or night theme`)

### Task 2: The Auto-on hold

**Files:**
- Modify: `app.js`:
  - Prefs `FIELDS` (417) and its validation (431-500);
  - AutoTheme (833-925): `wanted`, `apply`, the poll (900), `setMode`, `setPair`, the `nightFrom` / `nightTo` listeners;
  - `selectTheme`;
  - `window.llThemes`.
- Test: `tests/daynight.js`

**Interfaces:**
- Consumes: `setDayNight`, `selectTheme(id, { dayNight })` (Task 1).
- Produces:
  - `state.dnHold: { theme: string, period: "day" | "night", until: number } | null`, saved as the ll_prefs field `"dnHold"`, invalid values dropped on load;
  - `AutoTheme.hold(id: string)`;
  - `AutoTheme.clearHold()`;
  - `window.llThemes.hold()` returns `state.dnHold`.

- [ ] **Step 1: Write the failing tests** (page clock; schedule 21:00–07:00; pair `sepia` / `ember` so each switch is visible)

```js
R.check("22:00: the night theme is on", th === "ember");
R.check("setDayNight('day') at 22:00 → sepia, still after 31 s", a === "sepia" && b === "sepia");
R.check("hold saved: period night, until next 07:00", h.period === "night" && h.until === next0700);
R.check("reload at 23:00 keeps sepia", th === "sepia");
R.check("07:00 passes: hold cleared", (await hold(page)) === null);
R.check("21:00 next evening: ember again", th === "ember");
R.check("reload past the boundary: no hold", p.dnHold == null);
R.check("Follow phone (dark): Day holds, and after 12 h + 31 s night returns", a === "sepia" && b === "ember");
R.check("tile pick during a hold clears it (candle stays after 31 s)", th === "candle" && h === null);
R.check("setPair during a hold clears it", h === null);
R.check("setMode during a hold clears it", h === null);
R.check("nightFrom change during a hold clears it", h === null);
R.check("Auto off: setDayNight stores no hold", h === null);
R.check("a malformed dnHold in ll_prefs is dropped on load", h === null);
```

For Follow phone, use `page.emulateMedia({ colorScheme: "dark" })` and `setMode("system")`.

- [ ] **Step 2: Run, expect FAIL** (no `hold` API, and the pick is reverted)

- [ ] **Step 3: Implement**, per spec §6.5:
  - `until`: the next boundary from `state.nightFrom` / `nightTo` ("time"), or `Date.now() + 12 * 3600e3` ("system");
  - `wanted()` honours the hold while `Date.now() < until` and the current period equals `period`, otherwise clears it;
  - the 30 s poll also runs while `state.dnHold` is set (Follow phone has no other trigger);
  - `selectTheme` without `dayNight`, `setPair`, `setMode` and both time listeners call `clearHold()` before applying.

- [ ] **Step 4: Run, expect PASS**; themes-browser and qol show no new failures.

- [ ] **Step 5: Commit** (`Day and night: a switch while Auto is on holds until the next automatic change`)

### Task 3: Pickers always shown and marked; an honest tile-pick toast

**Files:**
- Modify: `app.js`:
  - `AutoTheme.syncUI` (877-890): `#autoRow` is always shown;
  - the theme pane's `syncTheme` (1573-1590): `#qDayNight` is never hidden for Auto off; `.on` and `aria-pressed` come from `dnOf`;
  - `pickTheme`'s toast (11319-11323).
- Modify: `i18n.js`: add "Day and night is on: {name} is now your night theme." and "…day theme." (Dutch in spec §10); remove the old "this theme lasts until the next switch" key.
- Test: `tests/daynight.js`

- [ ] **Step 1: Failing tests**

```js
R.check("Auto off: the settings sheet shows the day/night pickers", await shown(page, "#autoRow"));
R.check("Auto off: the theme popover shows the pair", await shown(page, "#qDayNight"));
R.check("Auto off on dusk: Night marked, Day not", n === "true" && d !== "true");
R.check("on paper: neither half marked", n !== "true" && d !== "true");
R.check("Auto on, tile pick at night: honest toast", (await toasts(page, /Candle is now your night theme/)).length === 1);
```

- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS;** `node tests/i18n.js` shows no new failures.

- [ ] **Step 5: Commit** (`Day and night: the pair is always shown, and the tile toast says what happens`)

- [ ] **Milestone 1 check:** full suite, compared with the baseline. Push.

---

## Milestone 2: Interface font and sentence case (app-wide)

### Task 4: Atkinson Hyperlegible as the interface font

**Files:**
- Modify: `app.css`: four `@font-face` rules for `'LL UI'` after app.css:86-89, using the same four files; `--ui-font` (app.css:11) becomes `'LL UI', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- Modify: `app.js`: the dictionary card's injected CSS (11830-12146) uses `var(--ui-font)` wherever it names a UI stack.
- Modify: `tests/fonts.js`: `TITLE_FACE` (:32) and the start-up checks (:46, :67) allow the four Atkinson files.
- Create: `tests/look.js`

- [ ] **Step 1: Failing tests** (`tests/look.js`: desktop 1200×800 and phone 390×844 with touch)

```js
R.check("body font is LL UI", ff.startsWith('"LL UI"'));
R.check("LL UI is loaded", await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "LL UI"'); }));
R.check("reading text keeps its font", docFF === docFFBefore);
R.check("word card uses LL UI", cardFF.startsWith('"LL UI"'));
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Also run `node tests/fonts.js`: its updated checks pass, and nothing new fails.

- [ ] **Step 5: Commit** (`The interface is set in Atkinson Hyperlegible`)

### Task 5: Sentence case for every label

**Files:**
- Modify: `app.css` (the 15 rules: 335, 407, 417, 699, 830, 993, 1539, 1812, 1831, 1858, 1966, 1969, 1998, 2123, 2200) and `app.js` (11938, 12033): remove `text-transform: uppercase` and the letter-spacing; the size becomes `var(--fs-small)`; colour, weight and background stay.
- Test: `tests/look.js`

- [ ] **Step 1: Failing test.** Open, in turn: the library with books, the settings sheet, the More menu, the About panel and the word card. Scan every element:

```js
const upper = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getClientRects().length && getComputedStyle(e).textTransform === "uppercase").map((e) => e.id || e.className));
R.check("no uppercase labels: " + where, upper.length === 0, upper.slice(0, 5).join(", "));
R.check("labels at --fs-small (13px)", fs === "13px");
R.check("contrast tone: labels 15px", fsHi === "15px");
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** (`Labels in sentence case instead of spaced capitals`)
- [ ] **Milestone 2 check:** full suite, compared with the baseline. Push.

---

## Milestone 3: The phone Text sheet

### Task 6: Phone layout, close button and size stepper

**Files:**
- Modify: `index.html`: in `#typePop .pop-head`, add `<button class="ctl" id="typeClose" aria-label="Close text settings" data-i18n-attr="aria-label title">` with `ICONS.close`, shown only under `(max-width:560px)`.
- Modify: `app.css`: the phone layout of `#typePop` under `@media (max-width:560px)`:
  - labels above their controls;
  - `#qSize`, `#qZoom`, the `#qLh` row and the `#qW` row hidden;
  - `#smaller` and `#bigger` 56 px.
- Modify: `app.js`:
  - `Pop.open` (1447-1449) focuses `#smaller` in the phone layout;
  - `syncType` (1470-1488) writes `#qSizeV` without "px" in the phone layout and sets `aria-disabled` on the stepper ends (size 14/28; zoom when `Math.round(state.zoom*100)` is 60/250);
  - `bump()` (11618-11632) ignores a press on an `aria-disabled` button;
  - `#typeClose` calls `Pop.close()`.
- Modify: `i18n.js`: "Close text settings" → "Tekstinstellingen sluiten".
- Create: `tests/textsheet.js`

**Interfaces:**
- Produces: `#typeClose`; the phone layout is keyed on the media query alone, with no class.

- [ ] **Step 1: Failing tests** (390×844 with touch, library screen; open with `#gear`)

```js
R.check("phone: size slider hidden, steppers 56px", !(await shown(page, "#qSize")) && w1 >= 56 && w2 >= 56);
R.check("phone: value reads 19 without px", (await text(page, "#qSizeV")) === "19");
R.check("phone: focus starts on A−", await page.evaluate(() => document.activeElement.id) === "smaller");
R.check("A+ to 28: A+ aria-disabled and still focused", dis === "true" && focus === "bigger");
R.check("A− to 14: A− aria-disabled", dis2 === "true");
R.check("close button closes the sheet", !(await page.evaluate(() => window.llPop.is("type"))));
R.check("desktop: slider shown, '19 px', no close button", deskOk);
R.check("PDF phone: zoom 60% disables A−", zDis === "true");
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** (`Text sheet on phones: a big A−/A+ stepper and a close button`)

### Task 7: Line spacing and margin choices

**Files:**
- Modify: `index.html`, in `#typePop` (phone layout only):
  - `<div class="seg choices" id="qLhChoices" role="group" aria-labelledby="qLhChoicesL">` with buttons `data-lh="1.5|1.75|2"`;
  - `#qMgChoices` with buttons `data-mg="0|12|28"`;
  - each button holds a pictogram and a label;
  - captions `#qLhCustom` and `#qMgCustom`.
- Modify: `app.js`:
  - `ICONS` (1376-1397) gains `lhTight`, `lhNormal`, `lhAiry`, `mgNarrow`, `mgMedium`, `mgWide`;
  - click handlers set `state.lh` / `state.margin` and call `applyType()`; a margin tap also sets `state.width = 720` when the saved width is narrower than the column;
  - `syncType` sets `aria-pressed` (|lh − v| < 0.001; margin exact) and the custom caption: lh through `dec(v, 2)` with a trailing zero dropped; margin shows just "Custom".
- Modify: `i18n.js`: Line spacing, Tight, Normal, Airy, Narrow, Wide, "Custom {v}", Custom (as in §10).
- Test: `tests/textsheet.js`

- [ ] **Step 1: Failing tests**

```js
R.check("Tight sets lh 1.5", lh === 1.5);
R.check("Airy sets lh 2", lh === 2);
R.check("Wide sets margin 28", m === 28);
R.check("saved lh 1.6: nothing pressed, 'Custom 1.6'", pressed === 0 && cap === "Custom 1.6");
R.check("saved lh 1.55: 'Custom 1.55'", cap === "Custom 1.55");
R.check("saved margin 20: 'Custom'", capM === "Custom");
R.check("width 320 then Medium: width 720, margin 12", w === 720 && m === 12);
R.check("Reset presses Normal and Narrow", pN === "true" && pNarrow === "true");
R.check("Dutch: 'Aangepast 1,6'", capNl === "Aangepast 1,6");
```

Seed values with `window.llType` (1188-1194) or `ll_prefs` before load.

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); `node tests/i18n.js` shows no new failures.
- [ ] **Step 5: Commit** (`Text sheet on phones: line spacing and margins as three choices each`)

### Task 8: The font row and All fonts

**Files:**
- Modify: `index.html`: `<div id="fontRow" role="group" aria-labelledby="fontRowL">` and `<button id="allFonts">` (phone layout only).
- Modify: `app.js`:
  - `syncType` renders four `button[data-font]`: `serif`, `literata`, `hyper`, `sans`; if `state.font` is another font, it takes the fourth slot. Each holds an "Aa" span in the face (`FONTS[id].stack`) and the name from `fontName()`; a tap sets `state.font` and calls `applyType()`;
  - `Fonts.openPanel(opts?: { back?: function })` (1367-1368): on close it runs `opts.back` (reopening the Text sheet on `#gear`) instead of its own `closed()`;
  - previews: `Fonts.load(id, true)` for the row's fonts when the sheet opens, never at start-up.
- Modify: `app.css`: four equal tiles, the name 13 px centred, up to two lines; a one-word name breaks at an inner capital or ellipsizes.
- Modify: `i18n.js`: "All fonts" → "Alle lettertypen".
- Test: `tests/textsheet.js` and `tests/fonts.js` (a phone start-up check)

- [ ] **Step 1: Failing tests**

```js
R.check("font row: serif, literata, hyper, sans", ids.join() === "serif,literata,hyper,sans");
R.check("with lora in use: fourth is lora, pressed", ids[3] === "lora" && p3 === "true");
R.check("tap Literata sets the font", (await st(page)).font === "literata");
R.check("All fonts opens the panel; closing returns to the Text sheet, focus on All fonts", back && focus === "allFonts");
R.check("phone start-up loads no reading-font file", fetched.length === 0);   // in tests/fonts.js
R.check("320px: the row stays inside the sheet", right <= sheetRight);
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** (`Text sheet on phones: four fonts at a tap, and All fonts brings you back`)

### Task 9: Fine-tune, the PDF target and the Line spacing label

**Files:**
- Modify: `index.html`:
  - `#qMore summary` holds two spans: desktop "More", and phone "Fine-tune" with a second line "Weight, letter and word spacing, focus reading";
  - the settings sheet's label at :276 becomes "Line spacing" (the popover's desktop "Spacing" at :64 stays).
- Modify: `app.js`: `#typeMore` (1505) opens `#pdfGroup` when `state.mode === "pdf"`.
- Modify: `i18n.js`: Fine-tune, the second line, Line spacing (§10).
- Test: `tests/textsheet.js`

- [ ] **Step 1: Failing tests**

```js
R.check("phone: Fine-tune with its second line", s === "Fine-tune" && l2 === "Weight, letter and word spacing, focus reading");
R.check("desktop: still More", sDesk === "More");
R.check("PDF: All text settings opens the PDF section", openGroup === "pdfGroup");
R.check("settings sheet: 'Line spacing'", lbl === "Line spacing");
R.check("390×844 with Fine-tune closed: the sheet fits 85% of the screen", sheetH <= 844 * 0.85 + 1 && noInnerScroll);
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); `node tests/i18n.js` shows no new failures.
- [ ] **Step 5: Commit** (`Text sheet on phones: Fine-tune, and PDFs open their own settings`)
- [ ] **Milestone 3 check:** full suite, compared with the baseline. Push.

---

## Milestone 4: The phone reading chrome

### Task 10: The lamp, the strip and the dock

**Files:**
- Modify: `index.html`. After `#dock`:
  - `<div id="readFoot">` holding `<p id="leftNote" aria-live="off">` and `<button class="ctl" id="dockBtn" aria-label="Reading controls" aria-expanded="false" aria-controls="phoneDock">`, with the ring `<svg>` and `ICONS.lamp`;
  - `<div id="phoneDockScrim">`;
  - `<div id="phoneDock" role="dialog" aria-modal="true" aria-label="Reading controls" tabindex="-1" hidden>`, holding:
    - a grab handle;
    - `.pd-head` with `#dockHome` and slots for `#fname` and `#searchBtn`;
    - `.pd-pos` with `#dockPos` (`<label class="vh" for="dockPos">Position in book</label>`), `#dockPage` and `#dockLeft`;
    - `.pd-dn` (`role="group"`, label "Day or night") with `#dockDay` and `#dockNight`;
    - `#actRow`, moved here from `#dock`.
- Modify: `app.js`:
  - `PhoneBar` (10909-10979):
    - moves: tools into `#actRow`; `#fname` and `#searchBtn` into `.pd-head`; `#moreMenu` and any `#moreScrim` to body;
    - `openDock` / `closeDock` / `toggleDock` / `isDockOpen` and `body.dock-open`;
    - inert: everything but `#phoneDock` while open;
    - focus: into the dock, back to `#dockBtn`;
    - a capture-phase click on `.pd-head` / `#actRow` buttons calls `closeDock({ focus: false })` before their own handlers;
    - the capture-phase Escape rule (§7.7);
    - a new `returnTarget(el)`;
  - `Menu.open` (2912-2916) creates the scrim next to `#moreMenu`'s parent; the outside-click test (2931) becomes `closest('#moreWrap, #moreMenu')`;
  - `Pop.close` (1451-1460), `Menu.close` (2924-2929), `Side.close` (2794-2806) and `setSheet` (11017-11026) route their focus targets through `PhoneBar.returnTarget`;
  - Side's `BEHIND` (2762) adds `#readFoot`, `#phoneDockScrim` and `#phoneDock`;
  - `ICONS` gains `type`, `bulb` and `lamp`;
  - under phonebar, `#gear` and `#lamp` show `type` and `bulb`, and the five tools show a `.tool-l` label span (Contents, Text, Read aloud, Theme, More);
  - under phonebar, `#fname` shows a 16 px chevron-down after the title;
  - `#dockHome` calls `Library.home()`.
- Modify: `app.css`:
  - `body.phonebar > header { display: none }`;
  - z-index 15 for `#readFoot`, 28 for the scrim and the dock;
  - the strip, the lamp and the ring;
  - the dock: `--panel`, a 1 px `--line` top border, 24 px top radius, `85dvh`, the 200 ms slide;
  - tool labels (13 px, up to two lines);
  - `#speakBtn` under phonebar: `--accent` fill with `--on-fill` text, or `--ink` text when panel-on-accent is under 4.5:1 (Review Focus 1).
- Modify: `i18n.js`: Reading controls, Back to library, Position in book.
- Test: create `tests/phonedock.js`. Rewrite qol.js:58-99, ui-a.js:351-378, 399-410 and 426-428, type2.js:388-392, and regression.js:303 to open the dock with `window.__ll.PhoneBar.openDock()` before tapping a tool.

**Interfaces:**
- Produces:
  - `PhoneBar.openDock()`, `PhoneBar.closeDock(opts?: { focus?: boolean })`, `PhoneBar.toggleDock()`, `PhoneBar.isDockOpen() -> boolean`, `PhoneBar.returnTarget(el: Element) -> Element`;
  - `body.dock-open`;
  - the ids `#readFoot`, `#leftNote`, `#dockBtn`, `#phoneDockScrim`, `#phoneDock`, `#dockHome`, `#dockPos`, `#dockPage`, `#dockLeft`, `#dockDay` and `#dockNight`.

- [ ] **Step 1: Failing tests** (`tests/phonedock.js`: 390×844, `isMobile`, `hasTouch`; open sample.epub; dictionary on "tap")

```js
R.check("no header box under phonebar", (await page.evaluate(() => document.querySelector("header").getClientRects().length)) === 0);
R.check("lamp at right 20, bottom 28, 56px", near(b.right, 370) && near(b.bottom, 816) && near(b.width, 56));
R.check("tap lamp opens the dock, focus inside", open && expanded === "true" && inDock);
R.check("tools in order with labels", labels.join() === "Contents,Text,Read aloud,Theme,More");
R.check("while open the page does not scroll (wheel and touch drag)", y1 === y0);
R.check("tap on the page closes it, focus to the lamp, no word card", !open2 && focus === "dockBtn" && !card);
R.check("Escape closes it", !open3);
R.check("Contents closes the dock and opens contents; closing returns focus to the lamp", sideOpen && f === "dockBtn");
R.check("More sheet is visible at body level with its scrim", menuRect.height > 0 && scrimParent === "BODY");
R.check("library screen: header back, chrome gone", hdr > 0 && !(await shown(page, "#readFoot")));
R.check("custom theme with a light accent: Read aloud label ≥ 4.5:1", ratio >= 4.5);   // Review Focus 1
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Then run qol, ui-a, type2 and regression: the rewritten checks pass, and nothing else regresses.
- [ ] **Step 5: Commit** (`Phones: reading is the text and a lamp; the lamp opens a dock with every tool`)

### Task 11: Layout maths, safe areas, status bar and rotation

**Files:**
- Modify: `app.js`:
  - `availHeight` (1742-1751), per §7.5;
  - the hide-on-scroll block (11788-11799) is skipped under phonebar;
  - `place()` keeps the Scroll position (`Library.topCharOffset()` before, `revealOffset` after, as in 9418-9441) and re-sets `meta[name=theme-color]`;
  - `applyTheme` (809-811) uses `--bg` under phonebar and `--panel` otherwise.
- Modify: `app.css`:
  - `#pager { display: none !important }` under phonebar;
  - `#progress` and `#progressInfo` hidden under phonebar, zen included (the ring replaces them, spec §4.1);
  - `main` top padding `max(20px, env(safe-area-inset-top))`;
  - Scroll-flow bottom padding = strip + 24 px;
  - side insets `max(<today>, env(safe-area-inset-left/right))` on header .bar, main, #pager, #tts, #autoBar and #side.
- Modify: `index.html`: the viewport meta gains `viewport-fit=cover`.
- Test: `tests/phonedock.js`. Rewrite ui-b.js:323 (`--headH` is `0px` under phonebar).

- [ ] **Step 1: Failing tests**

```js
R.check("Pages: page count unchanged by opening and closing the dock", n1 === n0 && n2 === n0);
R.check("Pages: text column ends above the strip", viewBottom <= stripTop + 1);
R.check("Scroll: last line clears the strip at the end", lastBottom <= stripTop + 1);
R.check("theme-color = page colour in a book, panel colour on the library", metaBook === bg && metaLib === panel);
R.check("viewport-fit=cover", /viewport-fit=cover/.test(meta));
R.check("no progress line or pill under phonebar, in zen too", !line && !pill && !lineZen);
R.check("rotate to 844×390 with the dock open: dock closed, header back, position kept", !open && hdr > 0 && Math.abs(off1 - off0) < 80);
R.check("rotate while the Contents panel (opened from the dock) is up: it still works", sideStillOpen && clickedEntryNavigates);   // Review Focus 4
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Then run ui-b: the rewritten check passes, and nothing else regresses.
- [ ] **Step 5: Commit** (`Phones: the text gets the whole screen, clear of the notch and the lamp`)

### Task 12: The ring, the note and the position slider

**Files:**
- Modify: `app.js`:
  - `setProgressBar` (1986-1991) also sets the ring's dash and the hidden "{p}% through the book";
  - `applyTheme` (787-821) sets `--lamp-mark`: `--lamp` mixed toward `--ink` in 5 % steps until it reaches 3:1 against `--panel` (§9.4); the ring and the slider fill use it;
  - `Progress.tick` (8023-8050) writes `#leftNote` and `#dockLeft` from `Progress.chapterLeft()`;
  - Toc/Section: top-level entry offsets for text (from `Toc.docEntries` levels through Section's offsets, 11214-11223) and the next top-level outline page for PDFs (`Toc.pdfEntries` / the cache at 1938-1955);
  - Pace exports `wordsBetween(a, b)`;
  - `#dockPos`: ranges, caption, `aria-valuetext`, the jump on `change` (`gotoPage(v - 1)`, or `state.pdfPageNum = v; renderPdfSingle()`, or `Toc.goPdfPage`, or a scroll to the fraction), then `Journal.jumped()`; arrow keys step;
  - Pace's private `overlayOpen()` (7077) and `softBlockers()` (7119-7130) count `body.dock-open`; open and close call `Pace.noteBlock("dock")`; `dockHeight()` (6956) and `Library.bottomCharOffset` (3086-3105) use the strip + `--dockH` under phonebar.
- Modify: `i18n.js`: the four "… left in chapter" strings, "Page {n} of {m}", "{p}% through the book".
- Test: `tests/phonedock.js`

**Interfaces:**
- Produces: `Pace.wordsBetween(a: number, b: number) -> number`; `Progress.chapterLeft() -> string` (`""` when unknown; first letter upper-cased).

- [ ] **Step 1: Failing tests**

```js
R.check("ring follows progress (scroll to ~50%)", Math.abs(ringPct - barPct) < 1);
R.check("note in a chapter", /^(Under a minute|\d+ min|\d+ h( \d+ min)?) left in chapter$/.test(note));
R.check("sample.txt (no chapters): whole-book form, capitalised", /^(Under a minute left|\d+ min left|\d+ h( \d+ min)? left)$/.test(noteTxt));
R.check("fresh profile: note is empty or an estimate, never 0/NaN", !/\b0 min|NaN|undefined/.test(noteFresh));   // Review Focus 3
R.check("Pages: slider max = page count; set 3 → page 3", max === total && /^3 \//.test(pg));
R.check("Scroll: slider 50 → about half way", Math.abs(frac - 0.5) < 0.05);
R.check("PDF: slider jump to page 2", pdfPage === 2);
R.check("aria-valuetext equals the caption", vt === cap);
R.check("the dock stays open after a slider jump", stillOpen);
R.check("Dutch: 'Nog 4 min in dit hoofdstuk' form", /^Nog (geen minuut|\d+ min|\d+ u( \d+ min)?) in dit hoofdstuk$/.test(noteNl));
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** (`Phones: the lamp's ring shows progress, the note shows time left in the chapter`)

### Task 13: Gestures, the dock's Day/Night switch and the holds

**Files:**
- Modify: `app.js`:
  - `tapNav` and `inBarStrip` (11648-11668) under phonebar: no top strip; the bottom strip and a blank middle tap call `PhoneBar.openDock()`; edges turn; nothing in zen or e-ink;
  - the swipe handler (11673-11689): a swipe up opens; a horizontal swipe is ignored when it starts in `#phoneDock`, `#readFoot`, a sheet, a scrim or `input[type=range]`;
  - new listeners: a tap on `#readFoot`'s blank area opens (Pages flow); a swipe down on `#phoneDock` or `#phoneDockScrim` closes (every flow);
  - `#dockDay` / `#dockNight` call `setDayNight(which)` (no toast), are synced from `applyTheme` via `dnOf`, stay in the open dock, and are hidden in e-ink;
  - `longPress($("#dockBtn"), …)` calls `toggleDayNight({ toast: true })`; the `#lamp` hold binds only when not under phonebar.
- Test: `tests/phonedock.js`. Rewrite qol.js:131-178 and 213-239, and split qol's try block (46-201).

- [ ] **Step 1: Failing tests**

```js
R.check("Pages: blank middle tap opens the dock", open);
R.check("Pages: bottom-strip tap opens", open);
R.check("Pages: tap on the strip's blank part opens", open);
R.check("Pages: swipe up opens, swipe down on the scrim closes", a && !b);
R.check("Pages: top corners turn the page", pgAfterTopRight === pgBefore + 1);
R.check("Pages: a sideways drag on the slider does not turn the page", pg === pgBefore);
R.check("Scroll: blank tap does not open", !open);
R.check("e-ink: middle tap turns, lamp opens", turned && openByLamp);
R.check("Greek text in Pages flow: middle tap opens, edges turn", openGreek && turnedGreek);   // Review Focus 2
R.check("switch marks the half on screen; Night → dusk; dock stays open", n0 === "false" && th === "dusk" && stillOpen);
R.check("hold on the lamp switches with a toast", th2 === "day" && toastSeen);
R.check("no hold on the Theme tool in the dock", th3 === th2);
R.check("switch hidden in e-ink", !(await shown(page, ".pd-dn")));
R.check("custom theme with a light accent: ring ≥ 3:1 on the panel", ringRatio >= 3);   // Review Focus 1
```

Inject the Greek text with `page.evaluate` into a paragraph of `#doc`, then call `window.__ll.relayoutPages()`.

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Then run qol: the rewritten checks pass, and its previously skipped checks now run.
- [ ] **Step 5: Commit** (`Phones: open the dock with a tap or a swipe; Day and Night are one tap inside it`)

### Task 14: The More sheet under phonebar

**Files:**
- Modify: `app.js`: `Menu.render` (2862-2899), under `body.phonebar`:
  - skips Read aloud (6806) and Contents (4224) in the quick row, Search (4828) and Library (10674);
  - keeps Read aloud when `#speakBtn` is hidden;
  - the quick row is two tiles.
- Modify: `app.css`: a two-tile quick row.
- Test: `tests/phonedock.js`. Rewrite ui-b.js:108-134 (quick row "Bookmark here / Previously…", first focus on "Bookmark here") and :409, and i18n.js:63-77 (Dutch phone menu without "Voorlezen").

- [ ] **Step 1: Failing tests**

```js
R.check("phone More: no Read aloud, Contents, Search or Library", !items.some((t) => /^(Read aloud|Contents|Search|Library)/.test(t)));
R.check("quick row: Bookmark here, Previously…", quick.join() === "Bookmark here,Previously…");
R.check("library screen on a phone: full menu", libItems.includes("Library") || libItems.some((t) => /Search/.test(t)) === false);
R.check("no speech synthesis: Read aloud stays in More", noSpeechHasRead);
```

The last check runs in a context with `delete window.speechSynthesis` in an init script.

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); ui-b and i18n show no new failures.
- [ ] **Step 5: Commit** (`Phones: the More sheet no longer repeats what the dock has`)

### Task 15: Read aloud, floating pieces and Escape order

**Files:**
- Modify: `app.css`:
  - `#readFoot` sits on `#tts` while `body.tts-on` (bottom = `--ttsH`, height 92 px);
  - `#leftNote` is hidden while `tts-on`;
  - `--aboveDock` / `--toastRow` under phonebar = strip (+ player), and above the dock while `dock-open` (toasts only);
  - `#autoBar` right-aligned above the lamp;
  - `#recap` top is `max(10px, env(safe-area-inset-top))`, with its max-height ending 12 px above the strip;
  - the ruler grip range ends above the strip.
- Modify: `app.js`:
  - Speak's private `ensureVisible()` (5963-5974) keeps the sentence above the strip + player;
  - Zen's `somethingOpen()` (9448-9452) and the Finished (9163-9167) and Recap (10288-10292) Escape guards count `body.dock-open`.
- Test: `tests/phonedock.js`

- [ ] **Step 1: Failing tests**

```js
R.check("read aloud: player at the foot, strip on it, note hidden", near(ttsBottom, 844) && near(stripBottom, ttsTop) && !noteShown);
R.check("speed popover is on top of the strip", topElIsPopover);
R.check("dock open covers the player; player height and page count unchanged", covered && h1 === h0 && n1 === n0);
R.check("toast while the dock is open sits above it", toastBottom <= dockTop);
R.check("auto-scroll pill above the lamp, right-aligned", pillBottom <= lampTop && near(pillRight, 378, 12));
R.check("Finished card above the strip", finishBottom <= stripTop);
R.check("Escape with the dock over the Finished card closes the dock only", !open && finishShown);
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** (`Phones: read aloud, toasts and cards make room for the lamp`)

### Task 16: Zen, switching books, modes and copy

**Files:**
- Modify: `app.js`:
  - Zen (9400-9475) under phonebar: entering closes the dock; a tap on `#dockBtn` calls `Zen.exit()`; the openers do nothing; the toasts at 9432 and 9467 use the phone wording;
  - `PhoneBar.on()` (10920) is also true while `state.opening` is true and the previous mode was doc or pdf; `fail()` (2028-2034) re-runs `place()`;
  - the first-document tip (11260-11277) uses the phone wording on phones;
  - the "add it later" toast (9135) becomes "You can add it later: More › Mark as finished".
- Modify: `app.css`:
  - zen under phonebar: `#dockBtn` at 0.4 opacity (1 on focus); note and ring hidden;
  - contrast tone: 2 px borders, 15 px labels;
  - forced colours: ring Highlight, ButtonText borders, a Highlight border on Read aloud;
  - e-ink: the new parts join the rules at 2248-2370;
  - reduced motion: no slide;
  - print: `#readFoot`, `#phoneDockScrim`, `#phoneDock`, `#moreMenu` and `#moreScrim` join 2381-2382.
- Modify: `index.html`: `#flowHint` (155) and the start-screen tip (346) gain phone-only spans.
- Modify: `i18n.js`: the remaining §10 strings; remove the replaced keys.
- Test: `tests/phonedock.js`. Rewrite zen.js:170-176 (the page height leaves the strip) and print.js:58 (the new parts hidden).

- [ ] **Step 1: Failing tests**

```js
R.check("zen: faint lamp, no note, no ring, no progress line", op === "0.4" && !note && !ring && !line);
R.check("zen: tap the lamp leaves zen", !(await zenOn(page)));
R.check("zen: bottom-strip tap does nothing", !open && zenStill);
R.check("zen toast: 'Zen mode — tap the lamp to leave'", t.length === 1);
R.check("switching books: no header box at any frame", maxHeaderH === 0);
R.check("failed open: header back", hdr > 0);
R.check("contrast tone: lamp border 2px, tool labels 15px", bw === "2px" && fs === "15px");
R.check("forced colours: ring stroke is Highlight", stroke === hl);
R.check("e-ink: dock has no transition", tr === "none" || /0s/.test(tr));
R.check("print: strip and dock hidden", printHidden);
R.check("Dutch 320px contrast tone: tool labels wrap without clipping", noClip && lines <= 2);   // Review Focus 5
R.check("English 320px, normal and contrast tone: 'Read aloud' wraps without clipping", noClipEn && linesEn <= 2);
R.check("first-document tip on phones", /Tap the lamp for your reading controls/.test(tip));
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Then run zen and print: the rewritten checks pass, and nothing else regresses.
- [ ] **Step 5: Commit** (`Phones: zen has a way out, switching books stays calm, every mode covered`)
- [ ] **Milestone 4 check:** full suite, compared with the baseline. Push.

---

## Task 17: Docs and release

**Files:**
- Modify: `README.md`: lines 20, 48, 49, 51, 52 and 62, per spec §11.
- Regenerate: `docs/screenshots/explain-phone.png` with `NODE_PATH=$(npm root -g) node tests/screenshots.js`; commit only the pictures that should change.
- Modify: `sw.js`: bump `VERSION` (:4) to `2026.10.08-1`.
- Modify: `app.js`: the comments at 10975 and around the tip.

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** Full suite, compared with the baseline. Expected: no regressions; daynight, look, textsheet and phonedock are green.
- [ ] **Step 3:** Run the CI parse check from .github/workflows/deploy.yml locally (the `node -e "…new Function(…)"` line). Expected: "scripts parse" and "json ok".
- [ ] **Step 4: Commit** (`Phone reading screen: README, screenshot and version`) and push.
