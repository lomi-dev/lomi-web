# Laptop hero scene

The homepage uses an original space-black laptop render on a charcoal
concrete plinth, inspired by the composition in Payload's previous homepage.
No Payload artwork or source code is included.

- Render: `src/assets/hero/laptop-concrete.png` (1536 × 1024 RGBA).
- Device screen: `src/assets/product/workbench.png`, the existing dark Lomi
  capture, or the hero poster uploaded in the CMS.
- Composition: `src/components/WorkspaceDeck.astro` and `Hero.astro`.

The laptop render was created with the built-in ImageGen tool. Astro produces
responsive WebP versions from the source. The screen stays separate from the
render so that a CMS poster update does not require regenerating the scene.
The static preview behavior remains in place; this component does not load
external video services.

The display is projected at build time by `src/lib/laptop-screen.ts`.
A 12 × 8 grid splits the product capture into small affine triangles. Each
triangle uses an ordinary SVG 2D transform and clip, referencing the same
source image. This keeps perspective consistent in Chromium and WebKit,
including after resize, without browser-side scripts or WebGL. Slightly
overlapping tile clips avoid antialiasing seams; an outer clip follows the
bezel. The source image is fetched once. An SVG viewBox scales the complete
projection with the device artwork. It maps a 900 × 562 source plane to these
four display corners in the 1536 × 1024 render:

| Corner | X | Y |
| --- | ---: | ---: |
| Top left | 550 | 166 |
| Top right | 1395 | 91 |
| Bottom right | 1377 | 673 |
| Bottom left | 485 | 648 |

If the device render changes, update this mapping together with the artwork.
Keep replacement posters near the 16:10 screen ratio; other ratios fill the
display with a centered crop. The whole composition has one accessible image
name from the existing CMS `hero.previewAlt` field.

At widths below 1200px the scene follows the copy in normal document flow.
On wider screens it sits to the right of the copy, with the concrete cropped
at the hero edge. The hero uses `overflow: clip` so that workspace fragment
links cannot scroll the cropped artwork or shift the text sideways.
Neither the scene nor its screen needs client JavaScript.
The homepage header uses the light theme and the page canvas stays white
when the hero is the first enabled section. The elastic scroll effect is
removed entirely: there are no wheel/touch gesture handlers, spring timers,
or page/header translation wrappers. Native vertical bounce is also disabled
on the homepage while it contains a hero, using `overscroll-behavior-y: none`.

Validation: `bun run build` and `bun run verify:hero-scene` with a local server.
Use the supported Node 22 runtime. The scene check accepts `VERIFY_URL` and
`VERIFY_BROWSER` (`chromium`, `webkit`, or `firefox`). It checks real rendered
screen pixels as well as layout, loading, navigation, and accessibility.
Legacy hero video/wave verification scripts describe the previous layout;
they are not the acceptance checks for this static scene.

Verified on 2026-10-24 against the production preview: build and scene checks
passed in Chromium and WebKit at nine widths from 320 to 1920px, including
rendered source-corner pixels, accessibility, keyboard navigation, no-JS,
reduced motion, and stationary upward scrolling. Firefox could not launch in the
local test environment, so its rendering remains unverified.

## Image generation prompt

Tool: built-in ImageGen, `transparent_background: true`.

```text
Use case: product-mockup. Asset type: transparent foreground render for a premium developer desktop app landing page. Create a photorealistic high-end studio 3D product render of an open dark space-black aluminum laptop inspired by a 16-inch MacBook Pro, resting dramatically on a large raw dark charcoal concrete architectural plinth. Wide landscape image 1536x1024 or larger, genuine transparent background. Composition: low front camera looking at the laptop at a subtle three-quarter angle, laptop screen upright, open about 105 degrees, fully visible large BLANK uniform near-black screen for later UI compositing. Screen left edge slightly further away and lower than right edge, top edge slopes slightly upward to right. Display and whole laptop occupy center and right, with base projecting toward bottom left. Full device visible, thin metallic black bevels, precise realistic clean geometry, slight highlight on edges. Screen should be almost front facing with a small perspective tilt (screen plane approximately quadrilateral with top-left at 28% 18%, top-right at 90% 8%, bottom-right at 90% 70%, bottom-left at 28% 77% of entire image). Concrete plinth starts beneath laptop at bottom quarter, filling bottom right and continuing cropped beyond right and bottom image edges, rough fine porous concrete texture and sharp architectural edge. Lighting: moody dark premium studio, soft white edge lighting with very subtle muted olive reflection, realistic contact shadows. Product must be legible on near-black website background. Avoid: text, logos, UI, code, floating panels, neon lights, colored backgrounds, checkerboard, extra objects. Keep the SCREEN completely BLANK flat near-black with no reflections or decoration. Real transparent alpha everywhere except laptop and concrete.
```
