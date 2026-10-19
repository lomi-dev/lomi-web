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
Canvas 2D keeps this version independent of WebGPU support.

Import the Astro component and render `<ShapeWavesBackground />` inside the
hero atmosphere. It fills its positioned parent and is decorative, with no
accessibility-tree content. The background retains `pointer-events: none`;
passive listeners on the hero observe pointer movement without intercepting
links, focus, scrolling, or clicks. The inherited CSS custom
properties set the opaque background (`--shape-waves-background`, default
`#0b0e0b`), shape color (`--shape-waves-color`, default `#4f633a`), and pointer
color (`--shape-waves-interaction-color`, default `#ffffff`). The white hero
uses `#ffffff`, `#cad6bf`, and `#6b922c` respectively. Text contrast masks and
compositing belong to the hero, outside this component.

Three compound SVG paths provide the server-rendered, no-JavaScript fallback.
Canvas crossfades in only after a successful first draw; unsupported or failed
Canvas 2D rendering retains the SVG. Both use the same initial field, a 16px
grid, and 3.2–4px radii. Rendering is capped at 7,000 cells, 1.5 device pixel
ratio, and 30 frames per second. The grid coordinates are cached on resize.
Both renderers quantize the field into 18 size levels across three shape bands.
Each animation frame samples the field and repaints only cells whose level
changed, batching their clearing rectangles and shape/tint paths. A complete
repaint occurs only on initial sizing or backing-canvas resize.

The plain field has no text or terminal cutout. Its pointer response follows
the reference's localized energy splash: each delivered fine-pointer move
adds a Gaussian bump with a 20px sigma, truncated to a 50px square reach.
Strength is `0.4 * min(1, 0.22 + speed * 0.0006)`, where speed is CSS pixels
per second. The first move uses zero speed. There is no click trigger,
segment interpolation, persistent cursor ring, cell displacement, or growth.
Touch input and devices without a fine pointer do not inject energy.

Three preallocated Float32 grids store signed height, velocity, and scratch
height. A fixed 60Hz four-neighbor simulation uses propagation 0.42, friction
0.94, and height decay 0.972, with at most four steps per rendered frame.
Negative heights persist in the simulation; only positive visible charge is
clamped. Charge cycles each cell's base triangle/circle/square at one-third
and two-thirds, while a smoothstep from 0.15 to 0.85 blends toward the pointer color in
10 tint bins. Those bins and shape steps are included in the dirty-cell key.
A cached 14px glow sprite supplies a small halo in the pointer color, confined to its cell;
14px clearing tiles remove its complete footprint without touching neighbors.
The sprite is regenerated only when the capped device pixel ratio changes.
Moving outside the hero or stopping the pointer ends injection while ripples
spread and decay. When the maximum positive height drops below 0.01, all
ripple grids clear and the field returns to its ambient appearance.

The custom element reads its nearest `.hero` ancestor's `data-motion` state
and listens for `lomi:hero-motion` on `document`. Manual pause, reduced motion,
document hiding, and leaving the viewport cancel the animation frame loop
completely, ignore pointer input, and preserve field time and ripple state.
Resizing clears ripple grids and pointer history, then draws once even when
paused. Reconnection reinstalls observers and listeners; disconnection removes
them, releases the cached grids and glow sprite, and cancels pending frames.

For verification, the host exposes `data-renderer="canvas|fallback"` and
`data-state="running|paused|reduced|offscreen|hidden|fallback"`.
The canvas has `data-background-canvas`. Actual canvas pixel comparisons
should confirm motion and frozen states, rather than relying on attributes.
For pointer verification, compare an untouched control at the same ambient
time with a fast pointer sweep: changes should stay local initially, include
more saturated glyphs and cell-local halos, then spread and disappear. Paused and
reduced-motion sweeps must leave the actual canvas pixels unchanged. No-JS
and Canvas-unavailable states retain the plain SVG without interaction.
