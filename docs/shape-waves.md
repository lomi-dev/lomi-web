# Hero shape waves

`src/components/ShapeWavesBackground.astro` is an authored Canvas 2D
interpretation of the visual concept in [React Bits Shape Waves](https://reactbits.dev/backgrounds/shape-waves).
The reference shows a dense, uniform grid of triangles, circles, and squares
whose types change together in broad, slow bands. The implementation uses a
deterministic mix of sine fields, with no copied upstream shader, noise math,
runtime, or new dependencies. React Bits' existing attribution and license
remain in `src/components/react-bits/LICENSE.txt` for the site's existing use.

The reference assets are `artifacts/references/shape-waves-og.jpg`,
`artifacts/ShapeWaves-upstream.tsx.txt`, and `artifacts/shape-waves-registry.json`.
The upstream WebGPU/vgpu version did not render in the reference browser;
Canvas 2D supplies a reliable equivalent without requiring WebGPU support.

Import the Astro component and render `<ShapeWavesBackground />` inside the
hero atmosphere. It fills its positioned parent and is decorative, with no
pointer interactions or accessibility-tree content. The inherited CSS custom
property `--shape-waves-color` sets the shape color (default `#4f633a`). Text
contrast masks and compositing belong to the hero, outside this component.

Three compound SVG paths provide the server-rendered, no-JavaScript fallback.
Canvas crossfades in only after a successful first draw; unsupported or failed
Canvas 2D rendering retains the SVG. Both use the same initial field, a 16px
grid, and 3.2–4px radii. Rendering is capped at 7,000 cells, 1.5 device pixel
ratio, and 30 frames per second. The grid coordinates are cached on resize.
Both renderers quantize the field into 18 size levels across three shape bands.
Each animation frame samples the field and repaints only cells whose level
changed, batching their clearing rectangles and three glyph paths. A complete
repaint occurs only on initial sizing or backing-canvas resize.

The custom element reads its nearest `.hero` ancestor's `data-motion` state
and listens for `lomi:hero-motion` on `document`. Manual pause, reduced motion,
document hiding, and leaving the viewport cancel the animation frame loop
completely and preserve the current field time. Resizing draws once even when
paused. Reconnection reinstalls observers and listeners; disconnection removes
them and cancels pending animation frames.

For verification, the host exposes `data-renderer="canvas|fallback"` and
`data-state="running|paused|reduced|offscreen|hidden|fallback"`.
The canvas has `data-background-canvas`. Actual canvas pixel comparisons
should confirm motion and frozen states, rather than relying on attributes.
