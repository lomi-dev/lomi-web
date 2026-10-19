# Asset provenance

## Brand identity

Official assets copied from the user-supplied `../brandbook/assets/logos` package:

- `lomi-wordmark-transparent-tight.svg` → `src/assets/lomi-wordmark.svg`.
- `lomi-favicon.svg` → `public/favicon.svg`.
- `favicon.ico` → `public/favicon.ico`.
- `lomi-favicon-180.png` → `public/apple-touch-icon.png`.

The document references versioned favicon copies in `public/icons/` (`lomi-v1.3.svg`, `lomi-v1.3.ico`, and `lomi-v1.3-32.png`) so previously cached site icons do not reuse the old URLs. The PNG is the package's original `lomi-favicon-32.png`; root favicon files remain available for browser fallback.

The original SVG geometry is unchanged. Its paths inherit `currentColor`: Ink
in the header and near-black on the Lime footer. The header wordmark is 96 px wide.
The social preview is a browser capture of the page with this logo.

## Cloud background

Final workspace source: `src/assets/clouds.png` (1536 × 1024).

The landing page displays the original image across the full hero, with a static
grayscale treatment and a dark overlay strongest behind the text. The panorama
also fills the hero on narrow screens. There is no animation or parallax. The
source asset remains unchanged.

Created using the built-in `image_gen` tool. The two user-supplied landing-page images were visual direction references, not copied into the website. Astro exports responsive AVIF and WebP versions with PNG fallbacks at build time.

Exact generation prompt:

> Generate a photorealistic natural sky photograph to use as the background of a minimalist, premium developer tool landing page. Wide landscape composition, 3:2 aspect ratio, high resolution. Clear pale powder-blue sky, airy luminous white cumulus clouds sweeping into the frame from the left and right edges and gathering along the bottom third. Keep the upper center and central 60 percent mostly uninterrupted blue negative space for dark navy headline text. Realistic finely detailed cloud vapor and soft blue-grey shadows, bright gentle daylight, atmospheric depth, optimistic tranquil feeling. The top edge should be soft sky blue, not saturated cobalt. Cloud edges naturally wispy, no artificial round blobs. No land, no mountains, no ocean, no buildings, no birds, no sun disc, no rainbow, no text, no logos, no interface, no grain. This is a standalone sky photograph, not a website mockup.

## Application screenshots

The workspace selector uses three unchanged, real native captures from the
desktop README, copied from `../lomi/docs/images/` into `src/assets/product/`:

- `workbench.png`: project explorer, TypeScript editor, and native terminal.
- `browser.png`: development server beside its embedded browser preview.
- `source-control.png`: repository history, changed files, and a code diff.

All are 2880 × 1800. Astro generates responsive AVIF and WebP variants. The first
view's caption and alt text use the CMS fields; the other two have functional
descriptions in the component. The selector is explicitly labeled as product
screenshots. It does not claim to execute code or run the application.

The older root-level `workbench.png`, `workbench-light.png`, and
`source-control.png` assets remain unused. No interface was reconstructed or
generated. Review the captures against the final launch release.

`public/social-card.png` is a 1200 × 630 browser capture of the current panoramic
hero. The release note and bottom metadata are hidden for this crop, keeping
partial text out of social previews.

## Typography

Geist Variable is served locally from its Fontsource package, with its license
at `node_modules/@fontsource-variable/geist/LICENSE`. JetBrains Mono Regular was
copied from the desktop application's `public/fonts/jetbrains-mono/` directory.
The font and its SIL Open Font License are included together at
`public/fonts/jetbrains-mono/`. Instrument Serif is no longer used or installed.
