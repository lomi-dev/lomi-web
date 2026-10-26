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

The hero has a viewport-height minimum (`100dvh`, with `100vh` fallback),
including the fixed header. With the default copy it fills one complete
screen: Features begins immediately below the viewport. Width and height
both determine the type scale, spacing and available device area.

A wide layout is used from 900px when the viewport is at least 4:3. Short
landscape windows from 560px wide and up to 600px high also use that layout.
The copy stays left, and the laptop is grounded at the bottom-right. Device
width is limited by available height below the header and the screen's
horizontal clearance from the copy, with a 1920px maximum. The transparent
artwork can extend into empty space while its visible screen stays clear.

Portrait and square windows use two grid rows. The text keeps its natural
minimum height; the device receives the remaining space and stays grounded
at the hero's lower edge. Size containment prevents the source image's
intrinsic dimensions from forcing a taller section. The photo uses bottom
alignment with `object-fit: contain`; the projected SVG uses the corresponding
`xMidYMax meet` alignment so its screen remains attached at every ratio.

Height remains a minimum rather than a fixed clipping boundary. Very short
windows, enlarged text or long CMS copy can grow the scene naturally, keeping
all text and actions readable through normal page scrolling. No inner hero
scroll region or JavaScript resize handler is needed.

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
two-dimensional viewport coverage including 16:9, portrait and short landscape,
viewport-height section boundaries, responsive copy/screen bounds and device
grounding, readable overflow with long text, absence of the dock and gallery,
keyboard/native anchors, no-JS and reduced-motion rendering, and accessibility.
