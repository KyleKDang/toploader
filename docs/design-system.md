# Toploader design system

The design language every screen is built in.
Decided in ticket [#39](https://github.com/KyleKDang/toploader/issues/39) before the first screen existed, so that the build tickets after the foundation copy something deliberate instead of copying whatever the scaffold happened to look like.

The token names in this file are the names the code uses.
When a screen needs a color, a size, or a radius, it names a token; it does not write a hex code or a pixel value of its own.

## How it was decided

Two partner gates, both recorded on #39.
Gate 1 fixed the direction: closest to TCGplayer, compact rows, cards ahead of people, mostly grey and white with one accent, app feel, "very easy and accessible".
Gate 2 picked between three prototypes and chose **Large Print** - the direction that reads "very easy and accessible" as the governing constraint - with the green accent carried over from the Shelf prototype.

The governing tension is worth keeping in mind when a later ticket has to make a call this file does not cover.
The partner asked for a dense, price-first tool *and* for something very easy and accessible, and those pull against each other.
Large Print resolves the tension toward legibility: about five Matches on a screen rather than ten, large type, large targets, every control labeled in words.
A later screen that is tempted to shrink something to fit more in is resolving it the other way, and should not.

## The chosen mockups

All four screens, at 375px, light and dark: **https://claude.ai/artifact/TqxHCqnRJBCCN7wxEMHFvQ**

1. **Matches** - the landing view: Listings that satisfy a Want and Wants that a Listing satisfies, inside the City, with both Traders' Reputation on the row.
2. **Card page** - the Catalog search picker open above a Card: Variant, Condition, Market Price, and who in the City holds one.
3. **Trade proposal** - two-sided item selection with the optional cash component on one side.
4. **Trader profile** - Verified badge, completed Trades, member-since, cancellations, no-shows, Trade Feedback, and the Verified Trading mechanics.

The two directions that were not chosen stay up as the record of the alternatives: [Ledger](https://claude.ai/artifact/JscR5P9sMyQLWHjJABSbQ8) (denser, closest to TCGplayer) and [Shelf](https://claude.ai/artifact/GSLauzAoedh29RLLYoRr8G) (the middle option, and the source of the green).

The mockups are the reference for anything this file leaves unstated.
Where a mockup and this file disagree, this file wins, because the mockup is a drawing and this file is the contract.

## Tokens

### Color

Two palettes, both required.
Dark mode is not a later enhancement: a Trader standing in a card shop at night is the case the whole direction was chosen for.

Semantic names only.
Nothing in the codebase refers to "green" or "grey"; it refers to `accent` or `muted`.

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | `#0B0B0C` | The page, and anything sitting flat on it |
| `--color-surface` | `#F4F4F5` | `#1A1A1D` | Fields, panels, chips at rest, the stat strip |
| `--color-surface-2` | `#EAEAEC` | `#242428` | Row hover, pressed states, the balance strip |
| `--color-ink` | `#111111` | `#FFFFFF` | Body text, headings, prices |
| `--color-muted` | `#4A4F57` | `#B8BCC4` | Secondary lines, captions, inactive tabs |
| `--color-line` | `#C8CCD2` | `#3C3F46` | Row dividers, panel borders, control borders |
| `--color-accent` | `#1B7A4A` | `#4CC38A` | The one accent: primary buttons, selected state, active tab, focus ring |
| `--color-accent-ink` | `#FFFFFF` | `#08170F` | Text and icons on an accent fill |
| `--color-alert` | `#D4552B` | `#FF8A5E` | Unread and attention markers only, never a decorative color |
| `--color-ok-ink` | `#0B5D33` | `#7FE0A8` | Verified badge text |
| `--color-ok-bg` | `#DDF2E5` | `#123A25` | Verified badge fill |

Three notes on why these values and not others.

The accent is one shade, and it is the *only* chromatic color in the interface apart from the alert marker and the Verified badge.
That is gate 1's answer: Listing photos are photographs of Pokemon cards, which are already loud, and a fuller palette would compete with them.

`--color-alert` is an orange-red rather than a crimson because it appears directly beside the green accent on the tab bar, and a green/crimson pair is the one a red-green colorblind Trader cannot separate.
It clears 3:1 on white, the floor for a non-text indicator.

`--color-ok-*` sits in the same hue family as the accent on purpose: "verified" and "go" being the same color is a help, not a collision.
The Verified badge is always the shield icon plus the word, never the color alone.

There is no success, warning, or info palette beyond this.
If a screen needs one, that is a decision for the ticket that needs it, and it goes in this file before it goes in the code.

### Type

**Atkinson Hyperlegible**, weights 400 and 700, with `"Helvetica Neue", Arial, sans-serif` behind it.
It is a typeface drawn for low vision, and it is why the chosen direction is called Large Print: characters that are commonly confused with each other (1/l/I, 0/O, rn/m) are drawn so they are not.
It is SIL Open Font License, so it is self-hosted with the app rather than loaded from Google Fonts.
A PWA that a Trader opens in a shop with bad signal must not block its first paint on a third-party font host.

Numbers use the same family with `font-variant-numeric: tabular-nums`, so that a column of prices lines up.

| Token | Size | Where |
|---|---|---|
| `--text-xs` | 13px | Tab labels, Reputation pills, fine print, stat labels |
| `--text-sm` | 15px | Second and third lines of a row, captions, chips |
| `--text-base` | 17px | Body, row titles, prices, buttons |
| `--text-lg` | 21px | Screen titles, Card names, profile names, stat numbers |
| `--text-xl` | 34px | The one big number: Market Price on the Card page |

Body line height is 1.35.
Prose that runs longer than two lines uses 1.5.

13px is the floor.
Nothing in the app is smaller than that, including legal text and the non-affiliation disclaimer.

### Spacing

A 4px grid.
Tailwind's `--spacing` is set to `4px`, and half steps are allowed where the mockups use them (`p-1.5` is 6px, `p-2.5` is 10px, `p-3.5` is 14px).

The values actually in use are 2, 4, 6, 8, 10, 12, 14, 16, 22, 28, and 40px.
Screen-edge padding is 16px.
The gap between a thumbnail and the text beside it is 14px.

### Radius

| Token | Value | Where |
|---|---|---|
| `--radius-sm` | 6px | Card thumbnails, checkboxes |
| `--radius` | 10px | Buttons, fields, panels, sheets, the stat strip |
| `--radius-full` | 999px | Avatars, chips, Reputation pills, icon buttons |

### Elevation

Elevation is used sparingly, and only to say "this floats above the thing under it".

| Token | Value | Where |
|---|---|---|
| `--shadow-popover` | `0 12px 28px -12px rgb(0 0 0 / .30)` | The Catalog search results under the field |
| `--shadow-sheet` | `0 -8px 32px -12px rgb(0 0 0 / .35)` | Bottom sheets |

In dark mode a shadow is nearly invisible, so anything that floats also carries a `--color-line` border.
Nothing else in the app has a shadow.

### Control sizes

These are tokens too, because the whole direction rests on them.

| Token | Value | What |
|---|---|---|
| `--size-tap` | 56px | The minimum square for anything tappable |
| `--size-btn` | 56px | Button and text field height |
| `--size-chip` | 40px | Filter chip and segmented control height |
| `--size-row` | 72px | Minimum list row height |
| `--size-thumb` | 54px | Card thumbnail width; avatars are this square |

`--size-btn` was 52px when this file was written, which contradicted the touch-target rule below, since a button is the most tappable thing in the app.
Raised to 56px in [#40](https://github.com/KyleKDang/toploader/issues/40), the ticket that first had to build a button and could not satisfy both lines.
The mockups draw 52px, and this file wins over a mockup by its own rule; 4px is invisible to the eye and the direction resolves tensions toward accessibility, which is the whole reason it is called Large Print.
`--size-chip` stays at 40px because a chip is meant to read small: it gets its 56px by sitting inside a 56px box, per the touch-target rule.

### Tokens this file states in prose

Five values above are named in a sentence rather than a table, and the code needs a token name for each of them, because a component may not inline a value.
They were added to the theme in [#40](https://github.com/KyleKDang/toploader/issues/40) and carry the values this file already gives them; none of them is a new decision.

| Token | Value | Stated in |
|---|---|---|
| `--leading-body` | 1.35 | Type, "Body line height is 1.35" |
| `--leading-prose` | 1.5 | Type, "Prose that runs longer than two lines uses 1.5" |
| `--text-tab-icon` | 26px | Bottom tab bar, "a 26px icon over a 13px label" |
| `--shadow-focus` | 3px accent glow at 18% | Text input, the focused state |
| `--container-content` | 480px | Mobile first, "the content column is capped at 480px" |

One token is renamed rather than added.
Tailwind derives `rounded-*` from the suffix of a `--radius-*` name, so this file's `--radius` is `--radius-md` in the theme, and `--radius` remains as an alias.

## Primitives

The components every screen composes from.
A ticket that needs one of these builds it once, in the shared component layer, and every later ticket imports it.

**Button.**
`--size-btn` tall, `--radius`, 17px semibold, label in words with an optional leading icon.
Primary is an `--color-accent` fill with `--color-accent-ink` text.
Secondary is a `--color-surface` fill with a 2px `--color-line` border.
Buttons in a row are equal width; a stack is full width.
There is no ghost or text-only button: everything tappable has a visible edge.

**Text input.**
`--size-btn` tall, `--radius`, `--color-surface` fill, 2px border.
Focused, the border is `--color-accent` with a 3px accent glow at 18% opacity.
Every input has a visible label or, where the placeholder is unambiguous as in the Catalog search, an `aria-label`.

**Search picker.**
A text input with a results panel below it: `--shadow-popover`, `--radius`, `--color-surface` fill, rows at 90% of `--size-row`.
Each result is a small thumbnail, the Card name with its Market Price on the right, and Set, collector number, and Variant underneath.
This is the only typeahead pattern in the app; the Catalog search and any later Card picker use it.

**List row.**
The workhorse.
`--size-row` minimum height, 16px side padding, a `--color-line` divider under it, `--color-surface-2` on hover and press.
Left: a thumbnail or an avatar.
Right: up to three lines - line 1 is the name with a price pushed to the right edge, line 2 is `--text-sm` muted detail, line 3 carries relationship text and a Reputation pill.
Rows never wrap; they truncate with an ellipsis.
An unread row carries a 7px `--color-accent` dot before its title.

**Card tile.**
A 5:7 rectangle at `--size-thumb` wide, `--radius-sm`, with an inset hairline and an inset white highlight so a pale card still reads as an object against a white background.
Sizes are `.75x` in the search picker, `1x` in lists, and `2x` on the Card page.

**Badge and Reputation pill.**
`--radius-full`, `--text-xs` bold, 3px by 9px padding.
Verified is `--color-ok-ink` on `--color-ok-bg` with a shield icon and the word "Verified".
Unverified is `--color-muted` on `--color-surface-2` and reads "Not verified".
A badge never appears without its word.

**Sheet and modal.**
Bottom sheets, not center modals - that is gate 1's app feel.
`--radius` on the top two corners, `--shadow-sheet`, a drag handle, a title row, and content that scrolls inside the sheet.
Dismiss is always available as a labeled control, never only by swipe.
Destructive confirmations put the destructive action second.

**Bottom tab bar.**
Four tabs: Matches, Search, Trades, Profile.
Each is a 26px icon over a 13px label, `--size-tap` minimum, `--color-muted` at rest and `--color-accent` when active, with 22px of bottom padding for the home indicator.
An `--color-alert` dot rides the icon when that tab has something new.
The bar is present on every top-level screen and hidden on nothing; a screen reached by drilling in keeps it and gains a back button in the top bar.
The one exception is before a Trader is inside the app at all: sign up and setting up the profile have no sections to move between, so they have no bar ([#13](https://github.com/KyleKDang/toploader/issues/13)).
A tab whose screen is not built yet stays on the bar, visibly inactive and disabled, rather than being left off.

**Empty state.**
Centered in the content area: one line saying what would be here in `--text-base`, one line in `--color-muted` saying how to get there, and one primary button that does it.
No illustration.
The empty Matches view in #13 is the first one and sets the pattern.
Where the action's destination is not built yet, the button is still shown, disabled, so the empty state names the way in without inventing a screen; the ticket that builds the destination enables it.

**Photo treatment.**
Listing photos are photographs of the actual Copy, so they are never cropped in a way that hides the card.
Thumbnails center-crop to 5:7 at 400px, which is the thumbnail size the spec's upload pipeline already produces.
Full views show the whole photo uncropped on `--color-surface`, at the 1600px long-edge WebP the pipeline stores.
Photos always carry alt text naming the Card and Condition.

## Rules later tickets must follow

**Mobile first.**
Every screen is designed and built at 375px and must be correct there before any wider layout is considered.
The app is single-column at every width.
Above 640px the content column is capped at 480px and centered, and that is the whole responsive story for v1; the breakpoints are Tailwind's defaults.

**Touch targets.**
Nothing tappable is smaller than `--size-tap`, 56px, in either dimension.
That is above the 44px platform minimum on purpose, and it has no exceptions: a control that is tappable is 56px, including the ones the table above sizes for their looks.
Where a control should *look* smaller - a chip, a checkbox - the visual sits inside a 56px box rather than the box shrinking to the visual.
Two adjacent targets are at least 8px apart.

The hit area cannot be padded out with an overflowing pseudo-element; that was tried in [#40](https://github.com/KyleKDang/toploader/issues/40) and does not extend hit-testing, with or without a stacking context.
A 56px box around a smaller visual is the pattern that works.

**Contrast.**
WCAG AA is the floor, not the goal: 4.5:1 for text, 3:1 for large text and for non-text indicators like the alert dot and control borders.
Every token pair in this file was checked against it.
A new color pair is checked before it ships, and if it does not clear the floor it does not ship.

**Focus is always visible.**
A 2px `--color-accent` outline at 2px offset on every focusable element.
Focus styles are never removed.

**Tokens, not values.**
No hex code, no `px` font size, and no hardcoded radius appears in a component.
If a screen needs a value this file does not name, the fix is to add it here, not to inline it.

**Both palettes, every screen.**
A screen is not done until it has been looked at in dark mode.

**The locked constraints are design constraints too.**
No Pokemon name, logo, or trade dress in app chrome, icons, or marketing lead; Card names appear only as Catalog content.
The non-affiliation disclaimer is visible, at `--text-xs`, at the foot of the Trader profile and the About screen.
Safety Program surfaces name mechanics and what each one does, never a promise: the Verified Trading panel on the profile carries the line "None of it is a guarantee", and no screen anywhere says safe, guaranteed, protected, or secure as a claim about an outcome.

**Vocabulary.**
User-visible strings name the concepts in [CONTEXT.md](../CONTEXT.md), but in ordinary words and ordinary case, per its Glossary and UI copy rule.
A running sentence lowercases them ("other traders see this", "your matches and listings"); titles, tabs and chips keep title case ("Matches", "3 Trades").
Where the on-screen word differs from the glossary term, the term's entry in CONTEXT.md says so: City is "Area" on screen.
