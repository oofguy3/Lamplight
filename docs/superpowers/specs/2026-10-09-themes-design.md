# Themes: twelve themes in six looks, and a picker that sets day and night in one tap

- **Status:** decided on 2026-10-09 without approval gates. The owner asked for no more questions ("Don't ask me questions"), so every open choice is settled here as a ruling and listed in section 15. Version 2, after an independent review against the code: the rulings it led to are marked "review" in section 15. The owner's own choices from earlier stand: fewer, better themes; the whole app restyled; the phone reading screen first (done, stage 1).
- **Stage:** 2 of the whole-app restyle. Stage 1 was the phone reading screen (`docs/superpowers/specs/2026-10-08-phone-reading-screen-design.md`). Later stages: the library and start screen, then the remaining panels and sheets, then the two custom-theme editors.
- **Research:** a review of all 50 themes, eight reading apps and the reading-comfort literature. It covered contrast, APCA, the distance between themes, comfort and look, and every place in the code that depends on the theme list. That research chose direction B, "six looks, twelve themes". Six designers then refined each look, and an integrator merged and checked the set. Section 3 gives the final colours.

## 1. Why

- **Too many themes, too few looks.** There are 50 themes, but measured by distance (section 3.3) they make about 18 distinct looks. Eight are poor: Terminal, Laid paper, Amber, Northern lights, Book cloth, Noir, Candle cabin and Rembrandt.
- **Switching is clunky.** To change themes a reader goes through:
  - six tabs (Light, Dark, Colour, Collections, High contrast, Mine);
  - a Recent row and a Previous button;
  - "Make my own from this one";
  - a separate Day theme and Night theme picker, each a list of 50 names.

  Settings › Theme shows the same 50 under nine headings.
- **Weak defaults.**
  - Day is a putty page under a cool ink, with the weakest lamp of all 50 (4.55:1).
  - Dusk's secondary text is the weakest of all (APCA Lc 41, 4.67:1 on cards).
- **Other apps keep it small.** Apple Books, Readwise, Kindle, Kobo, Libby and Play Books ship 3 to 6 looks. Apple Books and Readwise present a theme as one look in a light and a dark version. Comfort comes from brightness and an automatic dark mode, not from more themes. Fewer than 5% of people change any setting, so the default matters most.
- **Readers can lose their theme.** `Prefs.load` maps an unknown theme to Day (app.js:476), so with Auto off a reader on a removed dark theme would wake to bright Day.

## 2. Goals and non-goals

**Goals**

1. Twelve built-in themes that pair into six looks: Day & Dusk, Paper & Ink, Sepia & Cocoa, Sage & Forest, Sea air & Canals, and Contrast.
   - Every pair passes: text 4.5:1, boundaries 3:1.
   - Night text sits at APCA Lc 79–87.
   - No two themes of the same tone are near-duplicates.
2. One tap on a look sets both the day and the night theme.
   - A Day/Night switch at the top of the picker shows the half on screen and changes it, on the desktop too.
   - The whole picker fits on one phone screen down to "Day and night".
3. No reader is stranded.
   - Every retired id moves to the nearest kept theme of the same tone.
   - A pair stays two themes.
   - A one-time notice offers the old colours back as the reader's own themes.
4. New readers follow the phone's dark mode from the first run.
5. Less to maintain. These all go:
   - the six tabs, the eight groups and the four collections;
   - the textures and Plain background;
   - Recent and Previous;
   - the popover's Day theme and Night theme pickers.

**Non-goals**

- The two custom-theme editors: the Maker and the settings sheet's editor. Only their quick swatches change (9.5).
- The library and start screen, and the other panels and sheets (later stages).
- A theme per book.
- New textures. Textures are removed, not redesigned (section 8).
- The phone reading screen. It keeps its behaviour from stage 1. Its colours come from the new table, and the Contrast pair gets the ring and slider fixes (9.3).

## 3. The twelve themes

### 3.1 The table

These are the final colours, exactly as in the design file. Ids are unchanged: every one already exists today.

| Theme | id | family | bg | panel | raise | ink | muted | line | accent | lamp | ink on bg |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Day | `day` | warm | #F5EFE3 | #FBF8F0 | #FEFCF8 | #2D2924 | #645F58 | #DED8CB | #2C5D45 | #875C0C | 12.6 |
| Dusk | `dusk` | warm | #0D121C | #141A26 | #1C2330 | #DAD7CF | #A6A39B | #2A313E | #D8A24A | #D8A24A | 13.0 |
| Paper | `paper` | neutral | #FAFAF7 | #FFFFFF | #FFFFFF | #141414 | #5C5C58 | #DCDCD5 | #A8261F | #A8261F | 17.6 |
| Ink | `ink` | neutral | #000000 | #151413 | #1F1E1C | #D6D2C5 | #A3A097 | #302F2C | #E87A69 | #E87A69 | 13.9 |
| Sepia | `sepia` | warm | #F0E4CB | #F7EDD8 | #FAF4E6 | #2E1E11 | #695544 | #DFCDAE | #7C2623 | #855510 | 12.7 |
| Cocoa | `cocoa` | warm | #261914 | #30201A | #3A2920 | #EEDFCB | #AEA394 | #49372C | #D8A067 | #D8A067 | 13.0 |
| Sage | `sage` | cool | #DFE7D8 | #EAF0E5 | #F4F7F0 | #1A261F | #4E5C51 | #C7D2BE | #9C4925 | #124830 | 12.3 |
| Forest | `forest` | cool | #0E1A13 | #14221A | #1A2B21 | #D4DACC | #9DA595 | #283B2E | #7AB785 | #7AB785 | 12.5 |
| Sea air | `seaair` | cool | #DCEDF0 | #E9F5F6 | #F4FAFA | #112126 | #41545A | #C2DCE0 | #0B5A74 | #984121 | 13.7 |
| Canals | `canals` | cool | #0E1F22 | #13292D | #193337 | #D0DCD8 | #9DB1B0 | #24403F | #E58E6C | #F2C66B | 12.0 |
| Contrast | `hicon` | neutral | #FFFFFF | #FFFFFF | #FFFFFF | #000000 | #3A3A3A | #000000 | #0033CC | #0033CC | 21.0 |
| Contrast dark | `hidark` | neutral | #000000 | #000000 | #000000 | #F2F2F2 | #D0D0D0 | #F2F2F2 | #FFC72C | #FFC72C | 18.8 |

**What changed against today's colours:**

- **Contrast:** unchanged.
- **Canals:** only its text and secondary text.
- **Paper:** its line, accent and lamp.
- **Dusk and Cocoa:** page, surfaces and text; their amber and caramel stay.
- **Contrast dark:** its white softens to #F2F2F2, and its yellow becomes #FFC72C.
- **All the rest:** recoloured throughout.
- **Character of the changes:**
  - Day moves to a warm cream with green and brass.
  - Ink becomes pure black with a coral signal.
  - Sepia becomes oxblood and brass on cream.
  - Sage's lamp becomes a deep green.
- **Families:** `family` stays as metadata; nothing at runtime reads it. Ink moves from warm to neutral.
- **No `texture` field** on any theme.

**Order.** The table lists the themes in the order above. Each look's day theme comes before its night theme, and the looks run in the order of 3.2.

### 3.2 The looks

| Look (name on the tile) | Day half | Night half |
|---|---|---|
| Day & Dusk | Day | Dusk |
| Paper & Ink | Paper | Ink |
| Sepia & Cocoa | Sepia | Cocoa |
| Sage & Forest | Sage | Forest |
| Sea air & Canals | Sea air | Canals |
| Contrast | Contrast | Contrast dark |

- **Names.** A look's name is its two theme names joined, "{day} & {night}" (Dutch "Dag & Schemer", "Papier & Inkt"…).
- **Contrast** is named "Contrast" alone.
- **Default.** Day & Dusk is the default pair (`autoDay` "day", `autoNight` "dusk", as today).

### 3.3 Checks the set already passes

- **The audit's 18 pairs** (tests/themes.js) pass for all 12 themes, 216 of 216.
- **No two themes of one tone are near-duplicates.**
  - The distance between two themes is D_w = 100 × (0.45 ΔE(page) + 0.30 ΔE(text) + 0.15 ΔE(accent) + 0.10 ΔE(lamp)), where ΔE is the straight-line distance in OKLab.
  - About 2 is just visible, and under 4.5 counts as a near-duplicate.
  - A theme's tone here is its page's relative luminance: under 0.18 is dark, as in tests/themes.js.

  | Tone | Closest pairs |
  |---|---|
  | Light | Day–Sea air 5.40, Day–Sepia 5.70 |
  | Dark | Dusk–Cocoa 4.72, Dusk–Canals 4.83 |

- **Body text APCA.** Night themes read at Lc 79–87. The light themes' text is between 12.3:1 (Sage) and 21:1 (Contrast).
- **Pairs the audit does not check yet** (section 13 adds them). All pass with the CSS of 9.3. The lowest values are:
  - **Sage:** the page colour on an accent fill (search hit, current find, selection), 4.88:1.
  - **Canals:** text on the yellow highlight, 4.73:1 at 38%.
  - **Sepia:** the lamp on its soft tint (empty-state icons), 4.52:1. Day is 4.58:1 and Cocoa 4.60:1.
  - **Forest:** text on a found word, 7.24:1; on the dark-tone search hit, 6.16:1.
  - **Canals:** text on the sentence read aloud, 7.97:1.

## 4. The theme picker

### 4.1 Where it appears

There is one picker, drawn by one function, in three places:

- **The lamp's popover** (`#themePop`) on desktop and in wide windows.
- **A bottom sheet on phones.** This is the same pane, opened from the dock's Theme tool or from the lamp on the library screen.
- **Settings › Theme** (`#themeGroup`).

### 4.2 Layout

**The popover and the phone sheet, top to bottom**

1. **Head:** the title "Theme". On its right is the **Day/Night switch**: a segmented control with two options, a sun with "Day" and a moon with "Night" (`#qDN`).
2. **Looks** (`#qLooks`):
   - the six look tiles, two to a row, in the order of 3.2;
   - when the reader's pair is not one of the looks, a seventh **pair tile** for it comes first (5.2);
   - the group is labelled by the head's title.
3. **Mine:**
   - the label "Mine";
   - the reader's own themes, then a **New theme** tile, two to a row (`#qMine`);
   - each own theme keeps its ⋯ button and long press for Edit, Rename, Duplicate and Delete;
   - the actions row (`#qActs`) shows under the grid, as today.
4. **Day and night,** as today:
   - the label;
   - Off, Follow phone and On a schedule;
   - "Night from … until" when On a schedule;
   - the "Now: …" line.
5. **Unchanged:** Warmth, Warm at night, Extra dim with its two rows, and E-ink mode.
6. **The link at the foot** reads "More theme settings…". It was "All themes and the editor…". It opens Settings › Theme, as today.

**Settings › Theme, top to bottom**

1. The label "Theme", with the same Day/Night switch on its right (`#sDN`).
2. The looks and Mine, drawn by the same function into `#themeChips`. The settings sheet has no ⋯ buttons, as today: its own editor row (`#customRow`) handles a custom theme on screen.
3. "Day and night":
   - Switch: Off, Follow phone, On a schedule;
   - **Day theme** and **Night theme** lists (5.5);
   - the hours;
   - the now line.
4. Unchanged: Warmth and everything after it.

**On a 390 × 844 phone**, the sheet shows the head, the six looks, Mine with New theme, and "Day and night" before it scrolls. This is the design mockup's layout.

### 4.3 Tiles

**A look tile** (`button.chip.tile.look`, `data-look` = the look's day id: `day`, `paper`, `sepia`, `sage`, `seaair`, `hicon`; the pair tile is `data-look="pair"`) shows the look as one drawing split down the middle. The day theme is the left half and the night theme the right half.

Each half is a small page in that theme's colours:

- **Text marks:**
  - "Aa" in its text colour and the title face, 20px (21px on phones);
  - two short secondary-text lines beside the "Aa";
  - two more under it.
- **The panel** is a strip along the bottom, 16px (17px on phones).
- **The lamp** is a lit dot on the strip: 10px, with a soft glow in its own colour.
- **The edge** is 1px of the half's text colour faded 22% into its page (OKLab), so a light page still has an edge on a light sheet.
- **The drawing** is 68px tall (76px on phones). It has 12px outer corners and no edge where the halves meet.

The name sits under the drawing at the body size, cut with an ellipsis if it is too long.

**A tile of the reader's own** (`button.chip.tile[data-theme="c:…"]`) is the same size, with one page across the whole drawing.

**New theme** is the same size. Its drawing is a dashed outline with a plus.

The single-page drawing changes in the same way everywhere it is used. The lamp, today a pill, becomes the lit dot.

**The grid** has two equal columns, 14px between rows and 12px between columns (16px and 12px on phones).

**States:**

- **Chosen** (4.4):
  - a 2px gap in the sheet colour, then a 3px ring in the accent;
  - a 20px accent disc with a check, 7px over the top-right corner, set off by a 2px ring of the sheet colour;
  - the name in bold.
- **Hover** (mouse): a 2px gap and a 2px ring in the control line colour.
- **Focus:** an accent outline 4px off the drawing, as today.
- **Pressed:** scaled to 97%, as today.

**Modes:**

- **Contrast tone:** each half's edge is 2px in `--ink`.
- **E-ink:** the chosen ring and check are black, as today.
- **Forced colours:**
  - each drawing gets a 1px ButtonText outline;
  - the chosen one gets a 3px Highlight outline, as today.

**Names:**

- The tile's accessible name is its visible name.
- The chosen tile's name is "{name}, current theme" (existing string).
- The drawings are `aria-hidden`.

### 4.4 What is marked

| Thing | Pressed when |
|---|---|
| A look tile | the reader's pair is exactly that look, **and** the theme on screen is one of its two halves |
| The pair tile | it is shown (the pair is no look) and the theme on screen is one of its halves |
| An own theme's tile | it is the theme on screen (as today) |
| Day / Night in a switch | `dnOf(state.theme)` is that half |

- **At most one look or pair tile is pressed.**
- **The theme on screen is always one of the pair's halves** (5.0), so a look or the pair tile is always pressed, and so is one half of the switch. The extra conditions above only matter after the raw test hook `llThemes.select` (5.8).
- **The same rules** apply in the popover, the sheet, Settings and the dock.
- **E-ink mode** hides both switches in the picker, as it already hides the dock's: its colours are not shown.

### 4.5 What goes

- **From the popover:**
  - Previous ("Back to {name}", `#qPrev`) and Recent (`#qRecentSec`);
  - the group tabs (`#qGroups`) and their panes (`#qLight`, `#qDark`, `#qColour`, `#qColl`, `#qHi`; `#qMine` stays as the Mine grid);
  - "Make my own from this one" (`#qMake`). The New theme tile does the same: it opens the Maker from the theme on screen.
  - the Day theme and Night theme pickers with their swatches (`#qDayNight`, `#qDaySel`, `#qNightSel`).
- **From Settings › Theme:** the nine headed groups, and Plain background with its hint.
- **Stored state:** the `ll_theme_recent` key. Boot removes it, as it already removes `ll_apikey`.

## 5. What each control does

### 5.0 One rule for every choice

Whatever the reader chooses in the picker or in the Day theme and Night theme lists replaces **the half on screen**: a look replaces the whole pair and keeps the same half on screen; any single theme takes the place of the theme on screen, in its half.

- **The half on screen** is `dnOf(state.theme)`. When the theme on screen is outside the pair (only after the raw test hook), its page colour decides: dark is night.
- **A hold carries over.** With Auto on and a Day/Night hold in force, the hold moves to the theme that now stands in the held half: `dnHold.theme` becomes it, with its period and end unchanged.
- **Only the Day/Night switches, `t` and the lamp's hold change the half.** Only a change of Auto's mode or of its hours ends a hold early, as today.

So, after any choice:

- the theme on screen is one of the pair's two themes;
- the pair's two themes are never the same theme;
- one half of the Day/Night switch is always marked.

This changes two rules of stage 1: a choice no longer ends a hold (stage 1 §6.5), and a theme picked with Auto off no longer sits outside the pair (stage 1 §6.7). Section 15 records both.

### 5.1 A look

A tap on a look tile does this:

1. It makes the look the reader's pair: `autoDay` becomes its day theme, `autoNight` its night theme.
2. It shows the look's theme for the half on screen (5.0).
3. A hold in force carries over (5.0).
4. It cross-fades, as for any theme change, and saves.
5. It shows no toast. The one exception is in 5.2. The first-pick toast ("Day and night is on: … is now your day theme") is not shown for looks: a look covers both halves.

**Examples:**

- Day on screen with Auto off; tap Paper & Ink: Paper shows, and the pair becomes Paper/Ink.
- Dusk on screen; tap Sepia & Cocoa: Cocoa shows.
- Auto on in the daytime, Night held (Dusk on screen); tap Sage & Forest: Forest shows and stays held until the next automatic switch.

A tap on the look that is already the pair changes nothing.

### 5.2 The pair tile

When the pair is no look, its tile comes first in the grid, drawn like a look:

- the left half is the day theme and the right half the night theme;
- it is named "{day} & {night}", for example "Day & Cocoa" or "My theme & Dusk".

This happens when the pair:

- was mixed by an earlier version and moved to the new set (section 7);
- holds one of the reader's own themes (5.4);
- was mixed in the Day theme and Night theme lists (5.5).

A tap on it changes nothing.

When a tap on a look replaces such a pair, a toast says "{name} for day and night" (the look's name) with **Undo**. Undo restores the previous pair, the theme on screen and the hold, directly. This is the only toast a look tap shows.

### 5.3 The Day/Night switches

- **A tap on Day or Night,** in the popover's head (`#qDN`), Settings › Theme (`#sDN`) or the dock, calls `setDayNight` with that half. It is the same setter as `t` and the lamp's hold (stage 1, §6.2):
  - the pair is never rewritten;
  - no toast, since the change is on screen;
  - with Auto on, it holds until the next automatic switch.
- **Keys:** the switch's buttons are ordinary buttons in the tab order.
- **E-ink:** the switch is hidden.

### 5.4 A theme of your own

A tap on an own theme's tile, a theme the Maker saves, and New… in Settings follow 5.0:

- **The theme replaces the theme on screen, in its half.** This holds with Auto on or off.
  - Example: Day on screen with the pair Day/Dusk; tap My theme: My theme shows, the pair becomes My theme/Dusk, and the pair tile "My theme & Dusk" appears, pressed.
  - A dark own theme picked while the day half is on screen becomes the day theme, as Candle did at noon in stage 1.
- **An own theme that is already the other half** is shown the way the Day/Night switch would show it, and the pair does not change. This is how the two halves stay different.
- **The first-pick toast:** with Auto on, the first time an own theme is picked, the toast says which half it went into and offers "Turn off", as today ("Day and night is on: {name} is now your night theme.").
- **A hold carries over** (5.0).

### 5.5 The Day theme and Night theme lists (Settings › Theme)

**What they offer.** Every built-in and every one of the reader's own themes, in three groups:

- **Light:** Day, Paper, Sepia, Sage, Sea air, Contrast;
- **Dark:** Dusk, Ink, Cocoa, Forest, Canals, Contrast dark;
- **Mine.**

**The other half's theme is disabled** in each list, so the pair's two themes cannot become the same.

**Mixing.** A reader can mix any day theme with any night theme here, for example Paper by day and Dusk at night. A dark theme can still be a day theme, as today.

**A change follows 5.0:**

- **A change to the half on screen** shows the new theme at once, with Auto on or off. A hold carries over.

  Today, with Auto off, the old theme stays on screen outside the pair; with Auto on, a change clears the hold, so the screen flips to the other half.
- **A change to the other half** changes only the pair. The screen and a hold stay as they are.

### 5.6 Deleting a theme of your own

- **The halves.** As today, a half that pointed at the deleted theme falls back: day to Day, night to Dusk. If that would make the two halves the same theme, the pair becomes Day/Dusk.
- **The screen.** When the deleted theme was on screen, the screen shows the theme now in its half, and a hold carries over.
- **Previous.** Deletion no longer uses Previous, which goes.
- **Undo** restores, directly:
  - the theme in the list;
  - the pair;
  - the theme on screen;
  - the hold.

### 5.7 Unchanged, and changed from stage 1

**Unchanged:**

- `t`, the lamp's hold and the dock's Day/Night, with their toasts.
- The Auto modes and the hours, and that changing either ends a hold.
- The 30 s check.
- Warmth, Extra dim and e-ink mode.

**Changed from stage 1 (§6.5, §6.7):**

- A choice in the picker or the lists carries a hold over instead of ending it (5.0).
- An own theme picked with Auto off goes into the half on screen instead of sitting outside the pair (5.4).
- `pickTheme` for a built-in can set a hold, as the Day/Night switch does (5.8).

**Collapsed pairs and themes outside the pair.** `dnOf` and `setDayNight` keep their rules for a pair left collapsed and for Contrast outside the pair, but neither state can arise any more: section 5 never creates one, and loading repairs those left by earlier versions (7.2).

### 5.8 Picking by id, and the raw test hook

Only code and the tests pick a built-in by id; the picker has no single built-in tiles.

**`pickTheme(id)` for a built-in** does two things in one step:

1. It picks that theme's look, as 5.1.
2. It shows that theme's half. With Auto on, this sets a hold when the period wants the other half, as a Day/Night switch would.

Example: `llThemes.pick("ink")` gives the pair Paper/Ink and shows Ink.

It no longer returns early when the id is already on screen. So `pick("day")` with the pair Day/Cocoa gives Day & Dusk.

**`pickTheme` for an own theme** follows 5.4.

**`selectTheme`** (exported as `llThemes.select`) becomes the raw setter:

- it shows a theme without touching the pair or the hold;
- it ignores an id that `resolveTheme` does not know.

Only the tests use it to make a state directly. A theme it leaves outside the pair is folded into the pair on the next load (7.2 step 7).

## 6. First run

A first run means there is no `ll_prefs`. That includes the first run after "Clear everything".

- **Auto starts on Follow phone** (`state.auto = "system"`). The theme is the half the phone asks for: Day, or Dusk when the phone is dark. It is set before `applyTheme` first runs, so the app does not switch from Day to Dusk after start-up.
- **Only the first-run block changes.** The state literal keeps `auto: "off"`. A saved profile without an `auto` field, such as a test's `{theme: "dusk"}` seed, therefore stays off.
- **With `prefers-contrast: more`,** the pair is Contrast / Contrast dark, and the theme is the half the phone asks for. Today the pair stayed Day/Dusk, and only the theme on screen was set.
- **Existing readers keep their own Auto setting.** Their saved prefs win.

## 7. Readers of a retired theme

### 7.1 Where each retired theme goes

| New theme | Retired themes |
|---|---|
| Day | Linen, Peach, Handmade paper, Tulip field, Book cloth, Laid paper, Polder, Vellum, Cherry blossom, Rose, Newsprint |
| Sepia | Parchment, Coffee house |
| Sage | Mint |
| Sea air | Winter morning, Sky, Mist, Lavender, Delft blue |
| Dusk | Rainy evening, Vermeer, Northern lights, Ocean, Midnight, Plum |
| Ink | Noir, Terminal |
| Cocoa | Autumn wood, Candle, Ember, Rembrandt, Candle cabin, Night train, Amber |
| Forest | Moss, Graphite |
| Canals | Old library, Slate |

How the map was chosen:

- Every move stays in its tone, light or dark.
- Contrast and Contrast dark are never targets.
- The rule: follow the research's merge targets until one survives (Amber → Candle → Cocoa). Otherwise take the nearest surviving page of the same tone, with distance deciding close calls.
- The median move is a distance of 5.4.
- Six moves are longer than 8: Terminal 20.4, Amber 13.1, Delft blue 8.8, Plum 8.3, Noir 8.3 and Midnight 8.05. Their hues are gone from the set.
- **The second choice.** Each retired theme also has a second choice: the next-nearest kept theme of the same tone. It is used only when a pair's two halves would land on one theme (7.2 step 5). Each id's second choice is listed in 7.5.

### 7.2 When and over what

The move runs inside `Prefs.load`, on **every load**. It changes nothing once the stored state is current, so it is idempotent. It ships in the same build that removes the ids.

It covers:

- `theme`;
- `autoDay` and `autoNight`;
- `dnHold.theme`.

`ll_theme_recent` is deleted rather than moved (4.5).

The steps, in order. `retireMove()` does steps 3, 4 and 5 (a). `foldPair()` does steps 5 (b), 7 and 8, after the validation that sits between them (app.js:476-484); Keep the old colours calls it too (7.4).

1. Read the fields, as today.
2. `migrateCustom`, as today.
3. **Note the originals.** If any of `theme`, `autoDay` or `autoNight` is a retired id, keep the three original values in `state.themeWas` (a new field, 7.6). Do this only if no earlier load left a `themeWas` that has not yet been shown.
4. **Map** each of the four fields through the retired table's `to`.
5. **A pair that is one theme twice.**
   - **(a) The move made it so:** the two halves were different before step 4.
     - The half whose original was retired takes that id's second choice. If both were retired, the night half does.
     - Examples: Linen/Peach becomes Day/Sea air; Candle/Ember becomes Cocoa/Dusk. Both keep their tones.
   - **(b) It was so before the move:** a pair left collapsed by the old bug that stage 1 fixed.
     - A built-in becomes its look: Day/Day becomes Day & Dusk, and Ember/Ember (Cocoa/Cocoa) becomes Sepia & Cocoa.
     - An own theme keeps the half its page colour says, and the other half takes its default, Day or Dusk.
6. **Validate,** as today. An id still unknown becomes Day, Day or Dusk, and a bad hold becomes `null`. If that makes the two halves the same, step 5 (b) repairs it, since `foldPair()` runs after this.
7. **A theme on screen outside the pair.** Earlier versions left this state: a tile picked with Auto off changed only the screen.
   - Contrast or Contrast dark: the pair becomes Contrast / Contrast dark, so a high-contrast reader stays in high contrast.
   - Any other theme, built-in or the reader's own: it becomes the half its page colour says. For example, Paper on screen with the pair Day/Dusk gives Paper/Dusk, so the reader keeps what they see.

   Section 5 never creates this state; only the raw test hook does (5.8).
8. **A hold on a theme that is not a half of the pair is dropped.** A hold only ever holds a half.

### 7.3 What does not move

- **The reader's own themes.** They are stored as colours, never as built-in ids.
- **Warmth.** It is a percentage of each theme's ceiling. The ceilings are worked out again from the new colours, as they are for any theme.
- **Nothing per book.** No theme is stored per book.

### 7.4 The notice: "Keep the old colours"

**What it lists.** A change is listed for each distinct retired id among the three originals, as long as the reader can still see where it went.

- The field it was in (`theme`, `autoDay` or `autoNight`) must still hold the theme the move gave it, its `to` or its second choice.
- A change is not listed when steps 5 (b) or 7 replaced that theme. Example: Contrast on screen with the pair Linen/Plum becomes the Contrast pair, and Linen and Plum are no longer part of what the reader uses.
- When nothing is listed, there is no notice, and `themeWas` is cleared.

**When.** At boot, when `state.themeWas` lists a change, about 800 ms after the first screen.

- It never shows together with the e-ink offer. Whichever comes first shows; the other waits for the next boot.
- The e-ink offer, which comes at 600 ms, does not mark itself as asked while it waits.

**What it says.** One line:

> Themes have changed: Candle is now Cocoa.

- Each change reads "{old} is now {new}", where `{new}` is the theme the field holds after the move.
- Two or three changes are joined as a list in the interface's language: "Linen is now Day and Peach is now Sea air". Use `Intl.ListFormat` where the browser has it, or ", " where it does not.

**Its two buttons:**

- **Keep the old colours** (`#themeKeep`).
- **A close button** (`#themeNo`), labelled "No thanks", which keeps the new themes.

**How it looks and where it sits.**

- **Its look:** that of the e-ink offer (`#einkToast`):
  - every rule that names `#einkToast` also names `#themeToast`;
  - `#themeKeep` and `#themeNo` take `#einkYes`'s and `#einkNo`'s rules;
  - the e-ink hover exemption (app.css:2460) names `#themeKeep` next to `#einkYes`.
- **Its place:** the update offer's place.
  - It keeps the bottom row and reports its height as `--noticeH`.
  - The toast and the translation pill step over it, like they step over `--updateH`. So an Undo toast is never hidden behind it.
  - It sits above the update offer if both show.
- **How long:** it stays until it is answered or the app is closed.

**Once only.** When the notice appears, `state.themeWas` is cleared and saved, so it is never shown twice. The listed changes are kept in memory for its button.

**Keep the old colours:**

1. **New own themes.** For each listed retired id, it makes one theme of the reader's own:
   - the retired theme's background, text, accent, panel and secondary text, from the retired table (`autoInk` false);
   - named with the retired theme's name in the interface's language ("Candle", "Kaars");
   - numbered if that name is taken ("Candle 2").
2. **Each listed field** takes its new own theme.
3. **`foldPair()` runs** (7.2 steps 5 (b), 7 and 8), so the theme on screen is a half of the pair and the halves differ.
4. **It clears the hold,** applies, saves and redraws.
5. **It toasts** "Your old colours are back, under Mine."

**What these themes lose.** A texture, and a lamp different from the accent: a reader's own theme derives its lamp, raise and line.

### 7.5 The retired table

`RETIRED` in app.js holds the 38 retired ids. It is a separate literal after `THEMES`, because tests/themes.js parses `THEMES` on its own. For each id it keeps:

- `to`, the new theme;
- `alt`, its second choice (7.1);
- `name`, the English name. Its Dutch stays in i18n.js;
- `bg`, `panel`, `ink`, `muted` and `accent`, copied exactly from today's table.

`resolveTheme`, `isBuiltIn` and the pickers never see it.

The second choices, by retired id:

| Retired | Second choice |
|---|---|
| blossom | sepia |
| bookcloth | seaair |
| handmade | seaair |
| laid | sepia |
| linen | sepia |
| newsprint | sage |
| peach | seaair |
| polder | seaair |
| rose | sepia |
| tulips | seaair |
| vellum | seaair |
| coffee | sage |
| parchment | sage |
| mint | day |
| delft | day |
| lavender | day |
| mist | day |
| sky | day |
| winter | day |
| aurora | forest |
| midnight | forest |
| ocean | forest |
| plum | canals |
| rain | canals |
| vermeer | canals |
| noir | dusk |
| terminal | dusk |
| amber | dusk |
| autumn | canals |
| cabin | canals |
| candle | canals |
| ember | dusk |
| nighttrain | dusk |
| rembrandt | canals |
| graphite | canals |
| moss | dusk |
| library | cocoa |
| slate | cocoa |


### 7.6 Stored fields

| Field | Change |
|---|---|
| `themeWas` | new in `FIELDS`: `{theme, autoDay, autoNight}` (the original strings) or `null`; anything else loads as `null` |
| `plainBg` | removed from `state` and `FIELDS`; an old saved value is simply not read |
| `ll_theme_recent` | removed at boot |

## 8. Textures and Plain background

**They go:**

- the four textures and their CSS (app.css:2707-2736);
- the `data-texture` attribute and its code in `applyTheme`;
- the Plain background switch, its hint and its handler;
- the boot line that sets the switch;
- the strings: "Plain background", its hint and "Textured";
- the texture rules in tests/themes.js.

**Why.** No mainstream reading app ships a texture. The research found a texture slows reading (r = −.78 with reading speed). All four textured themes move to Day, at distances of 3.7 (Handmade paper) to 5.1 (Vellum).

## 9. Colours outside the table

### 9.1 First paint

- **The `:root` defaults in app.css** become the new Day:
  ```css
  --bg:#F5EFE3; --ink:#2D2924; --muted:#645F58; --panel:#FBF8F0; --line:#DED8CB; --accent:#2C5D45; --lamp:#875C0C; --raise:#FEFCF8;
  ```
  The first paint and the Lighthouse run use these.
- **Dusk's page colour.** The meta `theme-color` in index.html and the manifest's `background_color` and `theme_color` change from #14161B (the old Dusk) to #0D121C (the new Dusk).
- **The favicon** keeps Dusk's amber, #D8A24A, which is unchanged.

### 9.2 The interface's own picks

These show built-in colours and are updated to the new set:

- **`BG_SWATCHES`** keeps its light row of six and dark row of six:
  - the light row: Day, Paper, Sepia, Sage and Sea air's pages, plus #EDE7F3, a lavender the set lacks;
  - the dark row: Dusk, Ink, Cocoa, Forest and Canals' pages, plus #171021, a violet the set lacks.
- **`ACC_SWATCHES`** keeps its eight. #C96A4A becomes Canals' coral #E58E6C, and #7FB069 becomes Forest's green #7AB785. The others stay, including #C25B78, which the tests click.
- **The Maker's text swatches** become:
  - Paper's #141414;
  - Day's #2D2924;
  - Sepia's #2E1E11;
  - Sea air's #112126;
  - Ink's #D6D2C5;
  - Cocoa's #EEDFCB;
  - Canals' #D0DCD8;
  - #FFFFFF.

### 9.3 CSS added with the set

These come from the design file and are reproduced in Appendix A:

1. **The Contrast pair: the lamp's progress ring.**
   - The ring sits 3px outside the button's edge, at 4px. The arc app.js measures still holds.
   - Before, it was drawn on the edge and showed only as a change of hue: 2.35:1 and 1.43:1.
2. **The Contrast pair: every slider.**
   - Every slider is a hollow capsule: a 2px rule in the edge colour around a 2px gap, with a 6px fill.
   - The dock's handle gets a ring in the panel colour, and a focus ring in the accent outside that.
3. **The Contrast pair: the dock's Day and Night.** These become two outlined buttons. Before, they were the accent's edge drawn inside the well's own rule.
4. **The dark tone: the yellow highlight.** In the dark tone it is drawn at 38%, not 42%, so text on it reads at 4.73:1 or more on every night theme. The light tone and the contrast tone keep 42%, Contrast dark included.
5. **The dark tone: the dock's position slider.** Its unfilled track is 35% of the edge colour mixed into the line, as on every other slider. Before, it was the line alone, at 1.33–1.39:1, so the part of the book still to read did not show at night.

**Wrapped tool names.** In the design renders, the dock's "Read aloud" wraps onto two lines in the contrast tone. That is stage 1's rule and stays: nothing under 15px in the contrast tone, and the tool names may wrap without being clipped (stage 1 §9.5; phonedock.js:594).

### 9.4 Comments that name themes

- **app.js:** the comments at 222-232, 283-299, 987-988, 1665-1669, 1689 and 11158-11174.
- **app.css:** the comments at 4-5, 17-26, 72, 106-107, 414, 762 and 2693-2710.
- **index.html:** the comments at 119-141 and 209.

All of these are rewritten for the new set, or removed with the code they describe.

The warmth comment no longer names "tight" themes; the ceilings are computed.

### 9.5 Unchanged

- The tones: light, dark, and contrast for `hicon`/`hidark`.
- The dark test in `isDarkColor`.
- `--lamp-mark`, `--on-accent` and the soften rule.
- E-ink's colours.
- The custom-theme tokens.

## 10. Architecture

### 10.1 Data (app.js, near the top)

| Name | Change |
|---|---|
| `THEMES` | the 12 of 3.1. A pure literal closing with `\n  };`, which tests/themes.js parses |
| `LOOKS` | new: `[{ id:"day", day:"day", night:"dusk" }, …, { id:"hicon", day:"hicon", night:"hidark", name:"Contrast" }]`, in the order of 3.2 |
| `RETIRED` | new (7.5) |
| `HICON` | kept: `["hicon", "hidark"]` |
| `THEME_GROUPS`, `COLLECTIONS`, `CYCLE`, `themeGroups()`, `pickerGroups()` | removed |

### 10.2 Functions

**New:**

| Function | What it does |
|---|---|
| `lookOf(id)` | the look a built-in belongs to |
| `pairLook()` | the look equal to the pair, or `null` |
| `lookName(l)` | a look's name: "{day} & {night}" from `themeName`, or `_tc("theme", "Contrast")` |
| `lookTileHtml(id, day, night)` | a look or pair tile's markup. Each small page carries `data-t` = its theme id |
| `looksHtml()`, `mineHtml(withActions)` | the looks (with the pair tile first when needed), and Mine with New theme |
| `halfOnScreen()` | `dnOf(state.theme)`, or the page colour's half when the theme is outside the pair |
| `selectLook(day, night, half?)` | the tap of 5.1, the Undo toast of 5.2, and `pickTheme`'s built-ins (5.8) |
| `pickOwn(id)` | an own theme into the half on screen (5.4). Used by `pickTheme`, `createCustom` and the Maker's save |
| `pairChanged()` | redraws both grids (`#qLooks` and `#qMine` when the popover is open, `#themeChips` always), refills the lists and keeps focus on the tile that was focused, or on the pressed one. Every path that changes the pair or the list of own themes calls it: `selectLook` and its Undo, `AutoTheme.setPair`, `pickOwn`, `deleteCustom` and its Undo, Keep the old colours, and `customsChanged` |
| `retireMove()`, `foldPair()` | inside `Prefs.load`: steps 3, 4 and 5 (a), and steps 5 (b), 7 and 8, of 7.2. `ThemeNotice` calls `foldPair()` for Keep |
| `ThemeNotice` | the notice and Keep the old colours (7.4) |

**Changed:**

| Function | Change |
|---|---|
| `renderTheme` | draws the looks, the pair tile, Mine and New theme |
| `syncTheme` | marks the tiles (4.4). No Recent, Previous, Day/Night names or swatches |
| `buildThemeChips` | draws the same looks and Mine into `#themeChips`, then marks them |
| `themeOptions` | the Light, Dark and Mine groups of 5.5. `AutoTheme.syncUI` disables, in each list, the other half's theme |
| `AutoTheme.syncUI` | fills only `#autoDay` and `#autoNight`. `#qDaySel` and `#qNightSel` are gone, and so are their listeners in Pop |
| `AutoTheme.setPair` | 5.5: refuses the other half's theme; the screen follows a change to the half on screen; a hold carries over; it no longer clears the hold |
| `AutoTheme.userPicked` | removed; `pickOwn` replaces it |
| `applyTheme` | marks every Day/Night switch (`#qDN`, `#sDN`, the dock's), hides the two picker switches in e-ink, and drops the texture code |
| `tileMark` | marks by the rules of 4.4. It recolours every small page (`data-t`) of the own theme being edited, in the look and pair tiles too |
| `pickTheme` | built-ins as 5.8; own themes through `pickOwn` |
| `selectTheme` | the raw setter of 5.8. It no longer calls `userPicked` or clears the hold, and it ignores unknown ids |
| `createCustom` | goes through `pickOwn` |
| `deleteCustom` | as 5.6 |
| `Pop.open`, `openSheetAt` | first focus on the pressed tile of the looks grid, or its first tile. They look for `.tiles .chip.on` today (app.js:1523, 1807) |
| `Eink.offer` | waits while the notice is up, without marking itself as asked (7.4) |
| first-run block | as section 6 |

**Removed:**

- `recentThemes`, `noteTheme` and `prevTheme`;
- `paneOf`, `groupOf`, `showGroup` and the tab keys;
- `GROUP_PANES`, `dnSwatch` and `tileSwatch`;
- `userPicked`;
- the Plain background handler.

### 10.3 Test API (`window.llThemes`, not public)

- **Exports:** `THEMES`, `LOOKS`, `RETIRED`, `contrast`, `resolve`, `current`, `customs`, `select` (raw, 5.8), `pick`, `look` (`selectLook`), `create`, `fix`, `remove`, `maker`, `dnOf`, `setDayNight` and `hold`.
- **Kept:** `contrast` stays, because phonedock.js and type2.js call it.
- **Removed:** `CYCLE`, `groups`, `pickerGroups` and `previous`.

### 10.4 Markup and CSS

- **index.html:** markup per 4.2.
  - The popover loses the parts of 4.5 and gains `#qDN`, `#qLooks` and the Mine section. Settings › Theme gains `#sDN`.
  - The meta colour changes (9.1).
- **app.css:**
  - The tile rules (app.css:774-827) are reworked for 4.3.
  - These are removed:
    - `.q-groups`, `.q-colls`, `.q-coll`, `.q-prev`, `#qRecentSec`, `.q-make`;
    - `.dn-pair`, `.dn`, `.dn-t`, `.dn-n`, `.dn-cur`, `.dn-sw` and `.dn-sel` (app.css:2761). The `.dn-cur` and `.dn.same` rules were already dead;
    - `#themePop .strip …` (app.css:2689), which stops matching;
    - `.dn` in the e-ink chosen-control list (app.css:2461);
    - the texture block.
  - The notice's rules (7.4): `#themeToast` joins `#einkToast`'s rules, and `--noticeH` joins `--updateH`'s sums.
  - The `.dn-b` dock buttons stay.
  - The new switch uses the existing `.seg` and `.chip`.
  - Appendix A is added.
- **manifest.webmanifest:** the colours (9.1).

## 11. Copy

**New strings, with their Dutch:**

| English | Dutch |
|---|---|
| {day} & {night} | {day} & {night} |
| {name} for day and night | {name} voor dag en nacht |
| More theme settings… | Meer thema-instellingen… |
| Themes have changed: {changes}. | De thema’s zijn veranderd: {changes}. |
| {old} is now {new} | {old} is nu {new} |
| Keep the old colours | Oude kleuren houden |
| Your old colours are back, under Mine. | Je oude kleuren zijn terug, onder Mijn thema’s. |

**Reused:**

- Day, Night, Day or night, Theme;
- Light, Dark, Mine;
- Day theme, Night theme;
- New theme, Make my own from this one (the New theme tile's title);
- "{name}, current theme";
- No thanks, Undo;
- all twelve theme names.

**Fixed:** Mine's Dutch "Mijn thema's" becomes "Mijn thema’s", with the curly apostrophe the glossary asks for.

**Removed** where nothing else uses them:

- Recent, Previous theme, Back to {name};
- Collections, theme group|Dutch, Nature and seasons, Cozy, Textured;
- Plain background and its hint;
- Colour, High contrast, Theme groups;
- Day and night themes;
- All themes and the editor….

Each is checked with a search before removal.

**Kept:** the names of the 38 retired themes. The notice and Keep the old colours use them.

**The glossary** in i18n.js (lines 117-119) is updated, and the comment at 400 about "the four collections" goes.

## 12. Docs and release

**README.md:**

- **The "Fifty themes" bullet** becomes a short one:
  - twelve themes in six looks, every one checked;
  - one tap sets day and night;
  - the Day/Night switch;
  - Follow phone by default;
  - a reader's own themes.
- **Remove** the collections, textures and "a grid of round swatches".
- **Also fix** lines 10, 12, 20, 53, 58, 183 and 187 (alt texts, warmth, test descriptions). The test list names the new `looks.js`.

**docs/screenshots/:** the pictures are made again with tests/screenshots.js. Its retired ids change to the new set:

| Picture | Theme |
|---|---|
| themes.png | the new picker |
| notes.png | Day |
| simplify.png, translate.png | Sepia |
| storage.png | Forest |
| stats.png | Canals |

Each picture is looked at before it is committed.

**sw.js:** `VERSION` is bumped. Installed copies must not keep the old table next to the new prefs.

**Spec and plan:** this file, plus the plan `docs/superpowers/plans/2026-10-09-themes.md` with its baseline.

## 13. Testing

### 13.1 Baseline before any change

Run every suite on the current head and save the per-file results to `docs/superpowers/plans/2026-10-09-themes-baseline.txt`.

Known failures there include:

- `themes-browser.js` stops at its line 82.
- `type2.js` fails 2 checks: it wants 30 themes, and a light theme with a ceiling under 0.2.
- `fonts.js` fails 2 checks, because of its oklab parser.
- `ui-a.js` fails 2 checks: one custom-theme check, and one known smooth-scroll timing check.
- `i18n.js` fails 1 check, on unrelated keys.

### 13.2 First: parsers that cannot read `oklab()`

Several checks read colours that come from an oklab mix, so the computed style is `oklab(L a b / α)`:

| Test | Lines | What it gets wrong |
|---|---|---|
| tests/fonts.js | 132 | returns `null` |
| tests/ui-b.js | 379-386 | reads the numbers as RGB and drops the minus signs |
| tests/ui-c.js | 72-80, 271-277 | the same |

**The fix.** They convert OKLab to sRGB, and lay a colour with alpha over its backdrop. This is fixed first, on today's code. Then those files run again, and their new results become the baseline.

### 13.3 New and rewritten tests

**tests/themes.js (node), rewritten:**

- **The set:** exactly the 12 ids, in the order of 3.1.
- **Every theme:**
  - a name;
  - a family;
  - the eight hex tokens;
  - no `texture`;
  - the contrast pair's raise equal to its panel.
- **The pairs:** the 18 existing pairs, plus:
  - the page colour on an accent fill: search hit, current find, selection;
  - text on 28% accent over the page (a found word);
  - text on 35% accent in the dark tone (a search hit);
  - text on the sentence read aloud: 24% lamp, or 18% dark;
  - text on the yellow highlight: 42%, or 38% in the dark tone;
  - the lamp on `--lamp-soft`.

  The mixes copy the colour space app.css uses: sRGB for `color-mix(in srgb …)`, and OKLab for `in oklab`. A mix with `transparent` is laid over the page.

  Each theme in the light or contrast tone has 23 pairs; each in the dark tone has 24, because the 35% search hit is the dark tone's own. That is 281 in all.
- **`LOOKS`,** parsed from app.js like `THEMES`:
  - six looks;
  - every built-in in exactly one look;
  - each day half light and each night half dark (relative luminance, as today).
- **`RETIRED`:**
  - 38 ids, none of them in `THEMES`;
  - every `to` and `alt` is a built-in of the same tone, never `hicon` or `hidark`, and `alt` differs from `to`;
  - every colour a hex value, and a name.
- **No near-duplicates:** the weighted OKLab distance of 3.3 between any two themes of one tone is at least 4.5.

**tests/looks.js (browser, new):**

- **The picker** (desktop popover, phone sheet, Settings):
  - the parts and their order;
  - the six names;
  - Day & Dusk pressed on a fresh profile;
  - the Mine section and New theme;
  - none of the parts in 4.5;
  - two columns;
  - tiles at least 44px tall.
- **On 390 × 844, on a fresh profile** (a look as the pair, no own themes), the sheet shows "Day and night" without scrolling.
- **Looks (5.1):**
  - with Auto off, the half on screen is kept (Day → Paper, Dusk → Cocoa);
  - with Auto on and no hold, the period's half shows;
  - with a hold, the hold carries over and survives a reload;
  - no toast.
- **The pair tile (5.2):**
  - a seeded Day/Cocoa pair shows "Day & Cocoa" first, pressed;
  - a look tap replaces it with a toast;
  - Undo restores the pair, the screen and the hold.
- **The switches (5.3):**
  - Night shows Dusk, and the switch's state follows;
  - hidden in e-ink;
  - in sync between the popover, Settings and the dock, also after `t`.
- **Own themes (5.4):**
  - with Auto off, Day on screen: it shows, the pair becomes it/Dusk, the pair tile appears pressed, and no toast;
  - with Auto on and Night held: it takes the night half and the hold, and the first-pick toast names the night;
  - an own theme that is already the other half: the pair stays, and the screen shows it as the switch would.
- **The lists (5.5):**
  - their three groups and twelve built-ins;
  - the other half's theme disabled in each list;
  - with Auto off and Day on screen, choosing Paper shows Paper, and the pair tile becomes Paper & Dusk;
  - with Dusk on screen, choosing Paper for the day half changes only the pair;
  - with Auto on and Night held, changing the night theme keeps the hold on the new theme.
- **Deleting (5.6):** deleting the own theme on screen shows its half's fallback with the hold carried over; Undo restores the theme, the pair, the screen and the hold.
- **Picking by id (5.8):**
  - `pick("ink")` gives Paper/Ink with Ink on screen, held when Auto wants Day;
  - `pick("day")` on a Day/Cocoa pair gives Day & Dusk;
  - `select("gone7")` changes nothing.
- **The invariant (5.0):** after a mixed sequence of looks, own themes, list changes, switches and deletions, with Auto off and on, the theme on screen is a half of the pair and the halves differ.
- **Redraws (10.2):**
  - the pair tile appears and goes in the popover and in Settings without a reopen;
  - after Enter on a look, focus is on the pressed tile.
- **First run (6):**
  - a light phone gets Day and Follow phone;
  - a dark phone gets Dusk;
  - `prefers-contrast: more` gets the Contrast pair;
  - an existing profile with Auto off stays off.
- **Moving readers (7):**
  - **every retired id** seeded as `theme` (Auto off) loads as its target and is saved;
  - **pairs:**
    - a mapped pair;
    - pairs the move makes one theme twice: Linen/Peach becomes Day/Sea air, Candle/Ember becomes Cocoa/Dusk;
    - legacy collapsed pairs: Day/Day becomes Day/Dusk, Ember/Ember becomes Sepia/Cocoa, an own theme twice keeps its half;
  - **the fold:**
    - Paper outside Day/Dusk becomes Paper/Dusk;
    - an own theme outside the pair takes its half;
    - Contrast outside becomes the Contrast pair;
  - **holds:** a mapped hold; a hold outside the pair dropped;
  - **ids:** an unknown id becomes Day;
  - **stored state:** `ll_theme_recent` removed;
  - **idempotent:** a second load changes nothing.
- **The notice (7.4):**
  - its text for one change and for two, worded from the resulting pair ("Peach is now Sea air");
  - no notice when the contrast fold replaced the retired halves;
  - Keep makes the own themes with the old colours, puts them in the listed fields, keeps the theme on screen a half of the pair, and toasts;
  - the close button keeps the new themes;
  - it is never shown twice, also after a reload;
  - it waits while the e-ink offer is up, and the e-ink offer waits for it;
  - a toast shown while the notice is up sits above it, not under it;
  - a numbered name when "Candle" is taken.
- **Colours:**
  - every built-in sets its tokens exactly;
  - no `data-texture` and no `#plainBg`;
  - the meta colour in the markup, and the manifest;
  - the `:root` defaults.
- **Appendix A:**
  - in the contrast tone, the ring is 68px and 6px outside, and the sliders' track has a 2px edge;
  - in the dark tone, the yellow highlight is 38% and the dock's track is the mix;
  - in the light tone and in Contrast dark, 42%.

### 13.4 Existing tests to change

Every change keeps the check's intent with the new set.

- **Picker selectors:**
  - tests/themes-browser.js is rewritten for the new picker. Its broken "New…" step now opens the Maker, and the rest of the file runs again.
  - ui-a.js 179-226, qol.js 185-196, look.js 41-46 and daynight.js 100-112 (the popover's pair becomes `#qDN`).
  - tests/lib.js gets helpers for showing the day or night half through the switch.
- **Suites that click `#themeChips [data-theme=…]`** use the Settings switch or a look instead:
  - about, explain2, simplify, speak, translate, zen, print and ui-c.
- **Retired ids in seeds and picks:**
  - ui-a (terminal; newsprint at 429);
  - ui-b and ui-c (candle, terminal, newsprint, slate);
  - daynight (ember, candle);
  - themes-browser (newsprint, midnight);
  - screenshots.js (12.3).

  Each moves to a kept theme with the same role: a dark theme outside the pair, a light page, and so on.
- **Counts and lists:**
  - type2.js 286-288: the count comes from the table. The "light ceiling under 0.2" check cannot hold any more: every new theme reaches the full film (35%, or 12% on a dark page). It becomes two checks:
    - every built-in wears the full film;
    - a custom theme with text at 4.54:1 wears almost none.

    Every ceiling still clears 4.5:1 through the film.
  - fonts.js 159: 12 themes.
  - themes.js: rewritten (13.3).
- **Fresh profiles now start with Follow phone (section 6).** Playwright's default scheme is light, so Day still shows, and seeded profiles stay as they are. The suites are run once with the change, and every check that assumed Auto off on a fresh profile is listed and fixed by seeding Auto off.
- **Recent and Previous:** daynight.js's checks that Day/Night adds no Recent entry become a check that `ll_theme_recent` is never written.
- **The stage-1 rules this spec changes (5.7),** in daynight.js:
  - §6, collapsed pairs: the lists now refuse them, and loading repairs them. These checks become "the lists keep the pair two themes"; the load repairs are tested in looks.js.
  - §9, the first-pick toast: it uses an own theme, not a retired built-in.
  - The hold checks:
    - "a tile pick during a hold clears it" becomes "an own theme picked during a hold takes the held half and keeps the hold";
    - "setPair during a hold clears it" becomes "changing the held half in the lists keeps the hold on the new theme; changing the other half leaves it".
  - The checks on Auto's mode and hours ending a hold stay.
- **`llThemes.select`** stays raw (5.8), so the suites that use it to show a theme keep working with Auto on.

### 13.5 Acceptance

- tests/themes.js passes for 12 themes. That is 281 pairs (13.3), plus the looks, retired and distance rules.
- tests/looks.js passes.
- **Every other suite:**
  - every check that passed in the baseline passes;
  - a deliberately changed check is listed in the plan with its reason;
  - the known failures of 13.1 now pass, except ui-a's smooth-scroll timing and i18n's unrelated keys.
- **The screenshots** are remade and looked at.
- **The README and the version** are updated.

### 13.6 Order of work

1. **Baseline and the parser fixes** (13.1, 13.2).
2. **The picker,** on today's colours. All twelve ids already exist, so this needs:
   - `LOOKS`, the tiles, the switches, the pair tile, the rule of 5.0 for every choice, and the redraws;
   - Settings › Theme;
   - removing tabs, Recent and Previous;
   - tests/looks.js's picker parts;
   - the picker tests of 13.4.

   The 38 other themes stay in the table and the lists until step 3.
3. **The set:**
   - the new `THEMES`, `RETIRED` and the move of 7.2;
   - the notice;
   - textures out;
   - Appendix A, the first paint, the meta colour and the manifest;
   - the swatches and i18n;
   - tests/themes.js and the moving-readers and notice tests;
   - the retired-id sweep of 13.4.
4. **First run:** Follow phone and the contrast pair, with their tests.
5. **Docs, the screenshots and the version,** then a full run and a whole-branch review.

## 14. Risks

- **Test churn.** About 25 suites name themes or picker parts. The order of 13.6 keeps each step runnable. Every changed check is listed in the plan.
- **Readers lose a hue.** Rose, Plum, Delft, Ocean and Midnight have no counterpart. The notice gives each reader the old colours back in one tap.
- **The first run changes.** On a dark phone a new reader opens in Dusk. This is intended (section 6). Lighthouse runs light, so it still measures Day.
- **Stale installs.** Without the version bump, an installed copy would keep the old table while new prefs arrive.
- **Previous and Recent go.** The whole set fits on one screen, and the Day/Night switch covers the common way back. For a pair that was no look, a look tap offers Undo (5.2).
- **The notice and other toasts.** It never shows with the e-ink offer. Toasts step over it, as they step over the update offer (7.4).
- **Changed stage-1 rules.** Holds now carry over a choice, and an own theme picked with Auto off joins the pair (5.7). daynight.js's checks of the old rules are rewritten to the new ones, not deleted.

## 15. Rulings

The owner said "Don't ask me questions", so the open choices were settled as below.

| Decision | Choice | From |
|---|---|---|
| How many themes | Fewer, better themes | owner |
| Which set | B: twelve themes in six looks, the ids kept, no new ids | research recommendation, ruling |
| A third colour pair | No; readers of Rose, Plum and the blues get "Keep the old colours" | research recommendation, ruling |
| Day's page | Warm cream near Linen's; Paper is the near-white | research recommendation, ruling |
| Ink | Pure black #000000 | research recommendation, ruling |
| Picker | Six split look tiles ("Looks"), not two rows of day and night tiles | ruling, after mockups of both |
| A look tap | Sets the whole pair and keeps the half on screen; a hold carries over | research recommendation, ruling |
| Every other choice | One rule (5.0): it replaces the theme on screen in its half, and a hold carries over. So the theme on screen is always in the pair, and the pair is never one theme twice | review |
| An own theme's tap | Follows 5.0, with Auto on or off. It changes stage 1 §6.7, where an Auto-off pick changed only the screen | review (was "as today") |
| Holds | A choice carries a hold over instead of ending it; only Auto's mode and hours end one early. It changes stage 1 §6.5 | review |
| The lists | The other half's theme is disabled; a change to the half on screen shows at once | review |
| Mixing | Still possible, in Settings › Theme's Day theme and Night theme lists; the picker shows a mixed pair as its own tile | ruling |
| Desktop Day/Night | A switch in the picker's head, on every screen size | research recommendation, ruling |
| Recent, Previous, "Make my own from this one" | Removed | ruling |
| Retired themes | Moved by the map of 7.1, on every load; one notice offering "Keep the old colours" | research recommendation, ruling |
| Pairs the move makes one theme twice | The retired half takes its second choice of the same tone | review (was "the look of the shared theme") |
| Legacy collapsed pairs, and a theme outside the pair | A built-in twice becomes its look; an own theme twice keeps its half; a theme outside the pair takes its half, and Contrast takes the Contrast pair | ruling, review |
| The notice's list and place | Only retired themes the reader can still see; worded from the resulting pair; toasts step over it | review |
| Dock tool names in the contrast tone | Stage 1's rule stays: 15px, wrapping without clipping | review |
| `llThemes.select` | A raw setter for tests; the pick paths carry the rules | review |
| Textures and Plain background | Removed | ruling |
| First run | Follow phone; Contrast pair with `prefers-contrast: more` | research recommendation, ruling |
| Dusk's page as the brand colour | Meta theme-color and manifest #0D121C | ruling |
| The custom-theme editors | A later stage of their own; only their swatches change | research recommendation, ruling |

## Appendix A: CSS added with the set

Appended to app.css as the design file gives it (comments shortened):

```css
/* the Contrast pair: the lamp's progress ring 4px, about 3px clear of the button's 2px edge; the SVG
   grows from 56px to 68px about the same centre, so the arc app.js measures still holds */
:root[data-tone="contrast"] #dockBtn > .ring{left:calc(-6px - var(--bw)); top:calc(-6px - var(--bw)); width:68px; height:68px; stroke-width:3.3; overflow:visible;}
/* every slider: a hollow capsule (a 2px rule in the edge colour round a 2px gap of the panel, a 6px fill) */
:root[data-tone="contrast"] input[type=range], :root[data-tone="contrast"] #dockPos{--track:transparent;}
:root[data-tone="contrast"] input[type=range]::-webkit-slider-runnable-track,
:root[data-tone="contrast"] #dockPos::-webkit-slider-runnable-track{height:14px; padding:2px; border:2px solid var(--edge); border-radius:999px; background-clip:content-box;}
:root[data-tone="contrast"] input[type=range]::-moz-range-track,
:root[data-tone="contrast"] #dockPos::-moz-range-track{box-sizing:border-box; height:14px; border:2px solid var(--edge); border-radius:999px; background:var(--panel);}
:root[data-tone="contrast"] input[type=range]::-moz-range-progress,
:root[data-tone="contrast"] #dockPos::-moz-range-progress{height:6px; border-radius:999px;}
/* the dock's handle: 24px with a 2px ring of the panel, and the accent's focus ring outside that */
:root[data-tone="contrast"] #dockPos::-webkit-slider-thumb{width:24px; height:24px; margin-top:-9px; box-shadow:0 0 0 2px var(--panel);}
:root[data-tone="contrast"] #dockPos:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 2px var(--panel), 0 0 0 4px var(--accent);}
:root[data-tone="contrast"] #dockPos::-moz-range-thumb{width:24px; height:24px; box-shadow:0 0 0 2px var(--panel);}
:root[data-tone="contrast"] #dockPos:focus-visible::-moz-range-thumb{box-shadow:0 0 0 2px var(--panel), 0 0 0 4px var(--accent);}
/* Day and Night in the dock: two outlined buttons, the half on screen in the accent's edge */
:root[data-tone="contrast"] .pd-dn{padding:0; gap:var(--sp-2); border:0;}
:root[data-tone="contrast"] .dn-b{border-color:var(--line); border-radius:var(--r-md);}
:root[data-tone="contrast"] .dn-b[aria-pressed="true"]{border-color:var(--accent);}
/* night pages: the yellow highlight at 38% (text on it 4.73:1 or more on every night theme) */
:root[data-tone="dark"] #doc mark.ll-mark[data-color="sun"]{background:color-mix(in srgb, #E8C547 38%, transparent);}
/* night pages: the dock's unfilled track, 35% of the edge into the line, like every other slider */
:root[data-tone="dark"] #dockPos{--track:color-mix(in srgb, var(--edge) 35%, var(--line));}
```
