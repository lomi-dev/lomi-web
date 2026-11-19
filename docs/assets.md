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

## Application screenshots

The homepage hero uses a real Lomi workspace capture. By default,
`src/assets/product/workbench.png` (2880 × 1800) supplies the dark-theme
Explorer, editor and terminal view. The hero is static and does not render a
video, YouTube embed or player.

`src/assets/product/hero-workbench.png` remains the fallback used by Download
and the legacy `HeroVideo.astro` component; it is not the selected homepage
hero image. When Download has no uploaded screenshot, this capture appears in
its existing showcase box. Its contextual image alt text describes the
Explorer, editor and terminal. Other missing product media uses a pale
background, thin border and 16px corners. Feature cards and dialogs use six
Retina captures of the real Lomi workspace, composed as windowed desktop
renders on the supplied Tahoe wallpaper with magnified details; see
[feature previews](feature-gallery.md). Devlog and Remote use a centered faint
Lomi wordmark; an uploaded site logo supplies their placeholder branding.
Wordmark fallbacks are decorative, while app captures have descriptive alt
text for their workspace interfaces.
SVG assets remain sharp without responsive raster exports.

`public/placeholders/lomi-mark.svg` is the Brand Guidelines 4.0 wordmark.
`public/placeholders/lomi-poster.svg` supplies the default design for generic
native video posters on Night. The homepage hero and the download page use the
real dark workspace capture (`src/assets/product/workbench.png`). The generic poster remains
a local, code-native SVG with no external requests. Old numbered PNGs remain
archived in `src/assets/placeholders/` but are no longer imported by rendered
pages.

The archived `HeroVideo.astro` component supports YouTube playback after
external-media permission or an uploaded-video player, with remembered
permission and custom controls; see [player behavior](hero-player.md). It is
not used by the selected homepage hero. In that legacy component, the poster
links to its selected video, or to YouTube, without JavaScript. Playback starts
only when half the player is in view and reduced motion is off; leaving view or
hiding the tab pauses playback. Permission revocation removes the iframe and
invalidates old callbacks. The previous mobile placeholder and unused dialog
component remain archived.
The native `browser.png` capture remains a local asset for future sections.

The desktop captures copied from `../lomi/docs/images/` include
`src/assets/product/workbench.png` (project explorer, TypeScript editor and
terminal), now used as the selected hero's default screen; `source-control.png`
(Git history and diff) and `browser.png` remain archived for future approved
sections.

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

The root-level `src/assets/workbench.png`, `src/assets/workbench-light.png` and
`src/assets/source-control.png` remain archived and unused by rendered pages.
No interface was reconstructed for the hero; it uses the real local
workspace capture.

`public/social-card.png` is the site's 1200 × 630 social preview image.

## CLI compatibility marks

The compatibility list uses local Iconify SVGs in `public/cli/`. All fifteen
brand marks and the final plus icon were downloaded from Iconify on October
26, 2026. The source SVG geometry is unchanged. Single-color marks use CSS
masks to follow the site's ink color; multicolor marks retain their colors.
There are no runtime requests to Iconify.

The [asset manifest](../public/cli/README.md) records every Iconify identifier,
source URL and license. The SVG Logos and Simple Icons collections are CC0;
theSVG and Tabler MIT notices are included beside the files.

## Homepage update artwork

The four temporary update cards reuse local assets: the original Lomi
wordmark, `src/assets/product/workbench.png`, the native Git preview at
`src/assets/product/demos/git-poster.webp`, and the versioned Lomi favicon.
They are explicitly marked “Coming soon.” Published Devlogs replace them
with uploaded thumbnails or the shared neutral media placeholder.

## Archived agent marks

The selected desktop hero has no agent dock. Local SVG marks remain archived
in `public/agents/`, with no runtime Iconify request. Their sources and
licenses are recorded beside each file.

The Hermes MIT notice is distributed in `public/agents/LICENSE-thesvg-MIT.txt`.

The geometric background is drawn with code, with a three-path static SVG
fallback generated during the Astro build. It is inspired by React Bits
Shape Waves; no upstream shader or generated image is used. Its implementation
and reference are recorded in [docs/shape-waves.md](shape-waves.md).

## Remote launch page

`src/components/RemotePage.astro` reuses the download page's locally served
Iconify Simple Icons for macOS, Linux and Windows, with unchanged geometry.
The three platform buttons are disabled. The hero shows the real `src/assets/product/browser.png` capture (never a drawing of the app), served as
responsive AVIF/WebP. No external image service or icon
package is needed. An explicitly uploaded CMS image overrides that preview and
retains intrinsic dimensions and lazy loading. See
[Remote launch behavior and provenance](remote.md).

## Footer social icons

The YouTube, X, LinkedIn and TikTok marks in `src/components/Icon.tsx` use
unchanged geometry from [Tabler Icons on Iconify](https://icon-sets.iconify.design/tabler/):
`tabler:brand-youtube`, `tabler:brand-x`, `tabler:brand-linkedin` and
`tabler:brand-tiktok`. They render as inline SVGs with the collection's 24 × 24
view box and 2 px stroke, inheriting the footer's color. No browser request to
Iconify is needed. The upstream MIT notice is included in
`public/icons/LICENSE-tabler-MIT.txt`.

## Typography

Mona Sans and Geist Mono are served locally from `public/fonts/`. Instrument
Serif is no longer used or installed.
