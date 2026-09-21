# Asset provenance

## Brand identity

Official assets copied from the user-supplied `lomi-system-v1.3/assets/logos` package:

- `lomi-wordmark-transparent-tight.svg` → `src/assets/lomi-wordmark.svg`.
- `lomi-favicon.svg` → `public/favicon.svg`.
- `favicon.ico` → `public/favicon.ico`.
- `lomi-favicon-180.png` → `public/apple-touch-icon.png`.

The document references versioned favicon copies in `public/icons/` (`lomi-v1.3.svg`, `lomi-v1.3.ico`, and `lomi-v1.3-32.png`) so previously cached site icons do not reuse the old URLs. The PNG is the package's original `lomi-favicon-32.png`; root favicon files remain available for browser fallback.

The original SVG geometry is unchanged. The transparent wordmark uses the brand's Ink color (`#0B0D0C`) for both the letters and the capsule above the i. It is displayed at 112 px on desktop and the specified minimum of 96 px on mobile. Padding preserves the required clear space. The social preview is a browser capture of the page with this logo.

## Cloud background

Final workspace source: `src/assets/clouds.png` (1536 × 1024).

The work-in-progress page displays the original photograph with a static CSS grayscale filter and Soft Chalk (`#F7F8F3`) overlay to match the lomi v1.3 light palette. The source image remains unchanged.

Created using the built-in `image_gen` tool. The two user-supplied landing-page images were visual direction references, not copied into the website. Astro exports responsive AVIF and WebP versions with PNG fallbacks at build time.

Exact generation prompt:

> Generate a photorealistic natural sky photograph to use as the background of a minimalist, premium developer tool landing page. Wide landscape composition, 3:2 aspect ratio, high resolution. Clear pale powder-blue sky, airy luminous white cumulus clouds sweeping into the frame from the left and right edges and gathering along the bottom third. Keep the upper center and central 60 percent mostly uninterrupted blue negative space for dark navy headline text. Realistic finely detailed cloud vapor and soft blue-grey shadows, bright gentle daylight, atmospheric depth, optimistic tranquil feeling. The top edge should be soft sky blue, not saturated cobalt. Cloud edges naturally wispy, no artificial round blobs. No land, no mountains, no ocean, no buildings, no birds, no sun disc, no rainbow, no text, no logos, no interface, no grain. This is a standalone sky photograph, not a website mockup.

## Application screenshots

Both screenshots come from the supplied local `lomi` repository. They are real native application captures, not reconstructed interfaces. Their capture procedure is documented in that repository's `docs/screenshots.md`.

The screenshots still show the former SimpleBench name. The website intentionally preserves their original content and explains the transition to visitors.

## Typography

Geist Variable and Instrument Serif are served locally from their Fontsource packages. Their respective license files remain available in `node_modules/@fontsource-variable/geist/LICENSE` and `node_modules/@fontsource/instrument-serif/LICENSE`.
