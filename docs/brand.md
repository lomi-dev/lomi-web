# Website brand system

The website follows Lomi Brand Guidelines 4.0 (`../brandbook`). This page is
the short version for building pages. When in doubt, the brand book wins.

## Ground rules

- **Dark is the default.** Pages sit on Terminal Night. There is no light page.
- **Night holds the page, colour does the talking.** Roughly 50% Night and
  neutrals, 25% Violet, 20% Signal, 5% Paper, across a whole page.
- **The Signal is the only live element.** Signal Lime marks what is running,
  the primary action and the active state. One Signal button per view.
- **Real product UI is the image.** No robots, brains, sparkles, purple-blue
  gradients or hacker green. The pane system (tiles side by side, one Violet
  pane holding focus) is the illustration style.
- **Motion only when work happens.** Signal pulse 1600 ms; pane slide 8 px at
  180 ms `cubic-bezier(.2,.8,.2,1)`; state change 120 ms ease-out; nothing
  bounces. Respect `prefers-reduced-motion`.
- **Write Lomi with a capital L** in sentences and titles. The lowercase
  wordmark is artwork, not a spelling. URLs, package names (`lomi-bin`) and
  commands stay lowercase.

## Tokens (`src/styles/global.css`)

| Role | Token | Value |
|---|---|---|
| Page ground | `--color-chalk` | `#0E0E11` (Night 950) |
| Surface / card | `--color-paper` | `#18181C` (Night) |
| Raised surface | `--color-night-850` / `--color-night-800` | `#1F1F24` / `#27272D` |
| Line | `--line` / `--line-strong` | `#27272D` / `#34343C` |
| Text | `--color-ink` | `#F7F7F9` (Paper) |
| Muted text | `--color-text-secondary` | `#9696A2` |
| Primary action | `--color-lime` (+ `-hover`, `-pressed`) | `#B9F500` |
| Text on Signal | `--on-accent` | `#0E0E11` |
| Accent, focus ring | `--color-violet-300` / `--color-focus` | `#AE8DFF` |
| Violet surface | `--color-violet` | `#723BFA` (white text only) |
| Semantic | `--color-success` / `-warning` / `-danger` | `#3DD68C` / `#FFB224` / `#FF5C5C` |

Never put Signal text on Violet. Never set Signal as text on Paper or white.
Body text keeps 4.5:1 or more.

Radii: `--radius-sm` 6, `--radius-md` 10 (buttons, inputs), `--radius-lg` 16
(cards, panels), `--radius-xl` 24. Spacing snaps to 8 (4 for fine detail).

## Type

- **Mona Sans** (`--font-sans`) for words. Headlines use the expanded width:
  `font-stretch: 125%`, weight 700 to 800, slight negative tracking. `h1` and
  `h2` get this from `global.css`. Body is normal width, 400, 16 to 18 px,
  line-height 1.5 to 1.6, 45 to 75 characters a line.
- **Geist Mono** (`--font-mono`) for what the machine says: labels, metadata,
  commands, versions. Labels are 12 px, 500, uppercase, `letter-spacing: .04em`
  (the `.eyebrow` class). Never paragraphs in mono.
- Sentence case for headlines and buttons. Tabular figures for numbers.

## Components (global classes)

- `.button` + `.button-primary` (Signal, Night text) or `.button-secondary`
  (outlined, Paper text). `.button-compact` is 44 px tall. Buttons lift 1 px on
  hover and press to `scale(.98)`.
- `.eyebrow` with an optional `<i class="sig"></i>` Signal dot in front.
- `.sig` the squircle Signal; `.sig-live` makes it pulse.
- `.aurora` an absolutely positioned Aurora Night layer for hero and launch
  moments only (at most one or two per page).
- `.text-link` an inline link whose underline draws on hover.
- `.shell` the content width; `.section` the vertical rhythm (128 px, 88 px on
  phones).

Cards: `background: var(--color-paper)`, `border: 1px solid var(--line)`,
`border-radius: var(--radius-lg)`. A linked card lifts 2 px on hover and its
border steps to `--line-strong`; a picture inside zooms to 1.02.

## Logo

`src/assets/lomi-wordmark.svg` and `src/assets/lomi-symbol.svg` are the
brand-book outlines: letters in `currentColor`, the Signal in lime. Do not
redraw, recolour the Signal, outline, add effects, or retype the logo in a
font. Keep clear space of one Signal around it; the wordmark is at least 72 px
wide, below that use the symbol. The Aurora app icon (`public/icons/lomi-app-icon.svg`)
is used where it shows large. The favicon is the Violet variant cropped tight for tab
sizes: `public/favicon.svg`, plus `favicon.ico` (16/32/48), `favicon-32.png` and a
full-bleed `apple-touch-icon.png` (180 px).
