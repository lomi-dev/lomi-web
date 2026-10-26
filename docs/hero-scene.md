# Cloud hero with laptop

The homepage keeps the chosen light cloud composition, with its original
headline, description, and actions. The agent dock is removed. The flat
workspace screenshot is replaced by the earlier black laptop on a concrete
plinth. There is one hero at `/`; old `?id=` links show the same composition.

- Composition: `src/components/Hero.astro`.
- Device: `src/components/WorkspaceDeck.astro` and the restored transparent
  `src/assets/hero/laptop-concrete.png` artwork.
- Screen: the local dark `src/assets/product/workbench.png` capture or an
  uploaded CMS hero poster.
- Screen projection: `src/lib/laptop-screen.ts` builds overlapping affine SVG
  triangles so the screenshot follows the display perspective in Chromium and
  WebKit without browser-side code.
- Background: `src/assets/clouds.png`, muted and covered by a pale overlay.
- Actions: `src/components/hero/Actions.astro`, using the CMS destinations.

On desktop, the device is grounded at the bottom-right of the hero so the
concrete base ends at the section edge. The transparent artwork can extend
behind empty layout space, while its visible screen stays clear of the copy
and actions. Below 1200px it follows the text in normal flow, at up to 900px
wide. The phone layout preserves the headline and action spacing and shows
the complete laptop above the next section.

The complete scene is server-rendered with a single shared screen image.
It requires no hero JavaScript, Canvas, WebGL, or animation loop. The device
artwork is decorative; the figure gets its accessible name from the CMS
`hero.previewAlt` field. Cloud images load eagerly at low priority, while the
laptop image has high priority. Astro creates responsive local WebP files.

The hero's base surface is `#f6f8f4`, matching the initial document canvas and
theme color. The header retains its light theme. Page scrolling, feature
videos, newsletter, footer, and consent behavior are unchanged.

The CMS controls the headline, description, actions, and optional screenshot
inside the laptop. Legacy media-mode/video fields stay available for older
layouts; this hero renders a static scene.

## Validation

Run `bun run build` and `bun run verify:hero-scene` with
`VERIFY_URL=http://127.0.0.1:48740`. Use `VERIFY_BROWSER=webkit` for WebKit.
Checks cover the actual device and screen assets, projection visibility,
responsive copy and screen bounds, absence of the dock and gallery,
keyboard/native anchors, no-JS and reduced-motion rendering, and accessibility.
