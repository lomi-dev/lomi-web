# Asset provenance

## Brand identity

Official assets copied from the user-supplied `../brandbook/assets/logos` package:

- `lomi-wordmark-transparent-tight.svg` → `src/assets/lomi-wordmark.svg`.
- `lomi-favicon.svg` → `public/favicon.svg`.
- `favicon.ico` → `public/favicon.ico`.
- `lomi-favicon-180.png` → `public/apple-touch-icon.png`.

The document references versioned favicon copies in `public/icons/` (`lomi-v1.3.svg`, `lomi-v1.3.ico`, and `lomi-v1.3-32.png`) so previously cached site icons do not reuse the old URLs. The PNG is the package's original `lomi-favicon-32.png`; root favicon files remain available for browser fallback.

The original SVG geometry is unchanged. Its paths inherit `currentColor`: near-black
in the light homepage and Devlog headers, white on dark surfaces, and near-black
on the lime footer.
The header wordmark is 82 px wide on desktop and 79 px on mobile.
The social preview is a browser capture of the page with this logo.

## Cloud background

Final workspace source: `src/assets/clouds.png` (1536 × 1024).

The original image and CloudBackdrop component are retained as unused assets.
The current hero uses a white composition with the real app capture rather
than the previous photographic panorama. The source image remains unchanged.

Created using the built-in `image_gen` tool. The two user-supplied landing-page images were visual direction references, not copied into the website. Astro exports responsive AVIF and WebP versions with PNG fallbacks at build time.

Exact generation prompt:

> Generate a photorealistic natural sky photograph to use as the background of a minimalist, premium developer tool landing page. Wide landscape composition, 3:2 aspect ratio, high resolution. Clear pale powder-blue sky, airy luminous white cumulus clouds sweeping into the frame from the left and right edges and gathering along the bottom third. Keep the upper center and central 60 percent mostly uninterrupted blue negative space for dark navy headline text. Realistic finely detailed cloud vapor and soft blue-grey shadows, bright gentle daylight, atmospheric depth, optimistic tranquil feeling. The top edge should be soft sky blue, not saturated cobalt. Cloud edges naturally wispy, no artificial round blobs. No land, no mountains, no ocean, no buildings, no birds, no sun disc, no rainbow, no text, no logos, no interface, no grain. This is a standalone sky photograph, not a website mockup.

## Application screenshots

When the hero has no uploaded CMS poster, it shows
`src/assets/product/hero-workbench.png`: a 2880 × 1800 capture of the current
Lomi React/Vite interface with the Explorer, editor, and terminal visible in a
single workspace. The capture was rendered from the app in Chromium at a 1440 ×
900 CSS viewport and 2× pixel density. It uses the app's real interface and
editor source; the native bridge and terminal output are test fixtures. Astro
generates responsive AVIF/WebP variants, including a native-video poster.
Uploaded CMS media takes precedence.

When Download has no uploaded screenshot, it uses the same genuine app capture
inside its existing showcase box. The contextual image alt text describes the
Explorer, editor, and terminal visible in the workspace. Other missing product
media uses a pale background, thin border, and 16px corners. Feature cards and
dialogs use six animated GIF captures of the real Lomi workspace with static
WebP posters; see [feature previews](feature-gallery.md). Devlog and Remote
use a centered faint Lomi wordmark; an uploaded site logo supplies their
placeholder branding. Wordmark fallbacks are decorative, while app captures
have descriptive alt text for their workspace interfaces.
SVG assets remain sharp without responsive raster exports.

`public/placeholders/lomi-mark.svg` contains the existing Lomi logo geometry.
`public/placeholders/lomi-poster.svg` supplies the default design for generic
native video posters. The old `hero-workspace.svg` remains in the public asset
directory for compatibility but the hero now uses the real app capture instead.
The generic poster remains a local, code-native SVG with no external requests.
Old numbered PNGs remain archived in `src/assets/placeholders/` but are no
longer imported by rendered pages.

`HeroVideo.astro` embeds the selected YouTube video `dQw4w9WgXcQ` directly in
this frame after external-media permission, including remembered permission.
The app capture or uploaded poster remains until the first playback signal.
Custom controls sit inside the frame; see [player behavior](hero-player.md).
The [official YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
mutes before automatic playback, which begins only when half the player is in
view and reduced motion is off. Leaving view or hiding the tab pauses playback.
Permission revocation removes the iframe and invalidates old callbacks. The
local image links to YouTube without JavaScript. There is no action bar under
the preview; media permission uses the existing Cookie settings.
The previous mobile placeholder and unused dialog component remain archived.
The native `browser.png` capture remains a local asset for future sections.

Unchanged desktop captures copied from `../lomi/docs/images/` remain archived
in `src/assets/product/`: `workbench.png` (project explorer, TypeScript editor
and terminal), `source-control.png` (Git history and diff), and `browser.png`.
They remain available for future approved sections.

`public/placeholders/download-workspace.svg` remains archived for compatibility.
Remote uses the shared brand placeholder until its screenshot is uploaded in
Payload.
The archived desktop captures are available for a future
approved upload and are no longer used as automatic page fallbacks.

The download system picker uses local Iconify Simple Icons SVGs, with their
original path geometry and the fill changed to Lomi ink:

| Asset | Iconify source |
| --- | --- |
| `public/icons/download-macos.svg` | [`simple-icons:apple`](https://api.iconify.design/simple-icons/apple.svg) |
| `public/icons/download-windows.svg` | [`simple-icons:windows`](https://api.iconify.design/simple-icons/windows.svg) |
| `public/icons/download-linux.svg` | [`simple-icons:linux`](https://api.iconify.design/simple-icons/linux.svg) |

The [Simple Icons collection](https://github.com/iconify/icon-sets/blob/master/json/simple-icons.json)
declares [CC0-1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md).
The icons are served with the site; no browser request to Iconify is needed.

The older root-level `workbench.png`, `workbench-light.png`, and
`source-control.png` assets remain unused. No interface was reconstructed for
the hero; its fallback is a browser capture of the current app UI.

`public/social-card.png` is a 1200 × 630 browser capture of the current hero
with centered copy, terminal-character waves, and fixed navigation,
scaled from a wider browser view so the headline, controls, and product composition fit.

## Archived agent marks

The unused agent marks are local Iconify SVGs from the desktop
application's existing assets. The dark and white Codex variants are retained
alongside the other marks; none are rendered in the current hero.
They represent Codex, Claude Code, OpenCode, Cursor CLI, Grok Build,
and Antigravity CLI. Monochrome marks use CSS masks; colored marks retain their
original colors. No brand geometry was recreated or generated. The unused
Hermes mark and its original license remain archived; it is absent from the hero.

[docs/react-bits.md](react-bits.md) records each exact source and license.
The Hermes MIT notice is distributed in `public/agents/LICENSE-thesvg-MIT.txt`.
The upstream React Bits TiltedCard source and its MIT + Commons Clause notice
are versioned together in `src/components/react-bits/`.

The geometric background is drawn with code, with a three-path static SVG
fallback generated during the Astro build. It is inspired by React Bits
Shape Waves; no upstream shader or generated image is used. Its implementation
and reference are recorded in [docs/shape-waves.md](shape-waves.md).

## Remote installation page

`src/components/RemotePage.astro` reuses the download page's locally served
Iconify Simple Icons for macOS, Linux and Windows, with unchanged geometry.
The command bar, separators and copy symbol are HTML/CSS/inline SVG. The shared
`Icon` component supplies the copied-state check and diagonal link arrow.
The two choices combine macOS/Linux and keep Windows separate. Beneath the
installer, the page shows an uploaded screenshot or the shared branded
placeholder. Images retain intrinsic dimensions and lazy loading; the local
placeholder does not require an external service. No icon package is added. Native radio
inputs and CSS `:has()` select the command even without JavaScript. See
[Remote command behavior and provenance](remote.md).

## Footer social icons

The YouTube, X, LinkedIn and TikTok marks in `src/components/Icon.tsx` use
unchanged geometry from [Tabler Icons on Iconify](https://icon-sets.iconify.design/tabler/):
`tabler:brand-youtube`, `tabler:brand-x`, `tabler:brand-linkedin` and
`tabler:brand-tiktok`. They render as inline SVGs with the collection's 24 × 24
view box and 2 px stroke, inheriting the footer's color. No browser request to
Iconify is needed. The upstream MIT notice is included in
`public/icons/LICENSE-tabler-MIT.txt`.

## Typography

Geist Variable is served locally from its Fontsource package, with its license
at `node_modules/@fontsource-variable/geist/LICENSE`. JetBrains Mono Regular was
copied from the desktop application's `public/fonts/jetbrains-mono/` directory.
The font and its SIL Open Font License are included together at
`public/fonts/jetbrains-mono/`. Instrument Serif is no longer used or installed.
