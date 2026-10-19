# Asset provenance

## Brand identity

Official assets copied from the user-supplied `../brandbook/assets/logos` package:

- `lomi-wordmark-transparent-tight.svg` → `src/assets/lomi-wordmark.svg`.
- `lomi-favicon.svg` → `public/favicon.svg`.
- `favicon.ico` → `public/favicon.ico`.
- `lomi-favicon-180.png` → `public/apple-touch-icon.png`.

The document references versioned favicon copies in `public/icons/` (`lomi-v1.3.svg`, `lomi-v1.3.ico`, and `lomi-v1.3-32.png`) so previously cached site icons do not reuse the old URLs. The PNG is the package's original `lomi-favicon-32.png`; root favicon files remain available for browser fallback.

The original SVG geometry is unchanged. Its paths inherit `currentColor`: near-black
in the white homepage header, white on Devlog, and near-black on the Lime footer. The header wordmark is
82 px wide on desktop and 79 px on mobile.
The social preview is a browser capture of the page with this logo.

## Cloud background

Final workspace source: `src/assets/clouds.png` (1536 × 1024).

The original image and CloudBackdrop component are retained as unused assets.
The current hero uses a white composition with layered product captures rather than the
previous photographic panorama. The source image remains unchanged.

Created using the built-in `image_gen` tool. The two user-supplied landing-page images were visual direction references, not copied into the website. Astro exports responsive AVIF and WebP versions with PNG fallbacks at build time.

Exact generation prompt:

> Generate a photorealistic natural sky photograph to use as the background of a minimalist, premium developer tool landing page. Wide landscape composition, 3:2 aspect ratio, high resolution. Clear pale powder-blue sky, airy luminous white cumulus clouds sweeping into the frame from the left and right edges and gathering along the bottom third. Keep the upper center and central 60 percent mostly uninterrupted blue negative space for dark navy headline text. Realistic finely detailed cloud vapor and soft blue-grey shadows, bright gentle daylight, atmospheric depth, optimistic tranquil feeling. The top edge should be soft sky blue, not saturated cobalt. Cloud edges naturally wispy, no artificial round blobs. No land, no mountains, no ocean, no buildings, no birds, no sun disc, no rainbow, no text, no logos, no interface, no grain. This is a standalone sky photograph, not a website mockup.

## Application screenshots

The hero uses two unchanged, real native captures from the desktop README,
copied from `../lomi/docs/images/` into `src/assets/product/`:

- `workbench.png`: project explorer, TypeScript editor, and native terminal.
- `source-control.png`: Git history and a code diff, cropped in the foreground.

Both captures are 2880 × 1800. Astro generates responsive AVIF and WebP variants.
The main caption and alt text use the CMS fields. The captures are shown directly,
without an additional window header or view selector. It does not execute code
or run the application. The play control opens the user-selected YouTube video
`dQw4w9WgXcQ`; its iframe is created on activation and removed on close.
The same workbench capture acts as the loading poster inside the dialog. The
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

The older root-level `workbench.png`, `workbench-light.png`, and
`source-control.png` assets remain unused. No interface was reconstructed or
generated. Review the captures against the final launch release.

`public/social-card.png` is a 1200 × 630 browser capture of the current hero
with centered copy, terminal-character waves, and glass navigation,
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

## Typography

Geist Variable is served locally from its Fontsource package, with its license
at `node_modules/@fontsource-variable/geist/LICENSE`. JetBrains Mono Regular was
copied from the desktop application's `public/fonts/jetbrains-mono/` directory.
The font and its SIL Open Font License are included together at
`public/fonts/jetbrains-mono/`. Instrument Serif is no longer used or installed.
