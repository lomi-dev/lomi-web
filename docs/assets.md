# Asset provenance

## Brand identity

Official assets copied from the user-supplied `../brandbook/assets/logos` package:

- `lomi-wordmark-transparent-tight.svg` → `src/assets/lomi-wordmark.svg`.
- `lomi-favicon.svg` → `public/favicon.svg`.
- `favicon.ico` → `public/favicon.ico`.
- `lomi-favicon-180.png` → `public/apple-touch-icon.png`.

The document references versioned favicon copies in `public/icons/` (`lomi-v1.3.svg`, `lomi-v1.3.ico`, and `lomi-v1.3-32.png`) so previously cached site icons do not reuse the old URLs. The PNG is the package's original `lomi-favicon-32.png`; root favicon files remain available for browser fallback.

The original SVG geometry is unchanged. Its paths inherit `currentColor`: near-black
in the white homepage header, white on Devlog, and near-black on the lime footer.
The header wordmark is 82 px wide on desktop and 79 px on mobile.
The social preview is a browser capture of the page with this logo.

## Cloud background

Final workspace source: `src/assets/clouds.png` (1536 × 1024).

The original image and CloudBackdrop component are retained as unused assets.
The current hero uses a white composition with desktop and mobile placeholders rather than the
previous photographic panorama. The source image remains unchanged.

Created using the built-in `image_gen` tool. The two user-supplied landing-page images were visual direction references, not copied into the website. Astro exports responsive AVIF and WebP versions with PNG fallbacks at build time.

Exact generation prompt:

> Generate a photorealistic natural sky photograph to use as the background of a minimalist, premium developer tool landing page. Wide landscape composition, 3:2 aspect ratio, high resolution. Clear pale powder-blue sky, airy luminous white cumulus clouds sweeping into the frame from the left and right edges and gathering along the bottom third. Keep the upper center and central 60 percent mostly uninterrupted blue negative space for dark navy headline text. Realistic finely detailed cloud vapor and soft blue-grey shadows, bright gentle daylight, atmospheric depth, optimistic tranquil feeling. The top edge should be soft sky blue, not saturated cobalt. Cloud edges naturally wispy, no artificial round blobs. No land, no mountains, no ocean, no buildings, no birds, no sun disc, no rainbow, no text, no logos, no interface, no grain. This is a standalone sky photograph, not a website mockup.

## Application screenshots

The hero uses two local [Placehold](https://placehold.co/) images, optimized by
Astro, while the final product captures are being prepared:

- `src/assets/placeholders/workspace.png`: 1600 × 1000 desktop view.
- `src/assets/placeholders/mobile.png`: 430 × 932 portrait mobile view.

The landscape desktop image has no added window header or view selector. A slim,
generic phone frame holds the portrait image at its original aspect ratio.
The phone overlaps the desktop's lower-right edge and remains clear of the play
control, including on narrow screens. Both image slots explicitly identify
themselves as placeholders in their alt text; the desktop also uses the CMS alt.
They do not imply that the mobile client is publicly available. The composition
is static, works without JavaScript and adds no device animation runtime.
Astro generates responsive AVIF and WebP variants. The play control opens the user-selected YouTube video
`dQw4w9WgXcQ`; its iframe is created on activation and removed on close.
The same desktop placeholder acts as the loading poster inside the dialog. The
[official YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
starts playback after muting, retains the native controls, and signals when the
poster can be replaced by the player. No custom controls cover the playing video.
The native dialog's motion is inspired by [Magic UI's Hero Video Dialog](https://magicui.design/docs/components/hero-video-dialog),
using the `from-center` scale and its stiffness-300, damping-30 spring response.
It is implemented with the Web Animations API and the browser's native dialog;
no additional React island or animation dependency is loaded.
The dimmed backdrop remains available when a browser does not render backdrop
blur.
The native `browser.png` capture remains a local asset for future sections.

Unchanged desktop captures copied from `../lomi/docs/images/` remain in
`src/assets/product/`: `workbench.png` (project explorer, TypeScript editor and
terminal), `source-control.png` (Git history and diff), and `browser.png`.
They are 2880 × 1800 and remain available for future approved replacements.

The download page reuses the unchanged `src/assets/product/workbench.png`
capture at its original aspect ratio, without additional window chrome. Its
alt text identifies the shown platform as macOS. Astro exports
responsive AVIF and WebP sources with a PNG fallback; the screenshot is static.

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
`source-control.png` assets remain unused. No interface was reconstructed or
generated. Review the captures against the final launch release.

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
installer, the page reuses `src/assets/product/workbench.png` unchanged: the
authentic macOS desktop capture already shown on Download. Its alt text identifies
the desktop workspace, without presenting it as a Remote dashboard. Astro serves
responsive AVIF/WebP sources with a PNG fallback, intrinsic image dimensions and
lazy loading. No external image request or icon package is added. Native radio
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
