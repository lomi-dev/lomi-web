# Hero backdrop

The hero keeps its white base and existing Geist typography. A frosted glass
ribbon introduces material depth behind the black laptop and rough concrete.
The left side stays quiet for the headline and calls to action. The glass
moves gently and responds to the pointer without moving the page content.

- Base: white `#ffffff`.
- Text: existing ink `#0b0d0c` and muted `#535c56` tokens.
- Brand accent: lime `#c8ff3d`; the glass uses a much paler tint.
- Source artwork: `src/assets/hero/glass-ribbon.png` (1536 × 1024).
- Component: `src/components/HeroBackdrop.astro`.
- Motion lifecycle: `src/components/hero-backdrop.ts`.
- Asset creation: built-in ImageGen, opaque white background.

On desktop, the artwork is enlarged from its right edge so the glass fold
frames the laptop rather than disappearing behind it. At 1200–1399px it
keeps its original scale to protect the copy's contrast. Below 1200px, the
backdrop is confined to the lower half and fades in softly from white.
Astro produces responsive WebP sources. The decorative image is hidden from
assistive technology, cannot intercept pointer input, and uses low fetch
priority so the device render and font load first.

## Motion

The ribbon drifts by up to 10px over a 24-second loop, with a slight rotation.
A broad, soft reflection travels across its surface over 18 seconds. Both
effects animate only transforms and opacity. On devices with a fine mouse
pointer, the background also follows the pointer by up to 12px horizontally
and 8px vertically; horizontal travel is capped at 6px below 1400px. The
response uses time-based damping and returns gently to rest on pointer exit.
Touch input does not drive parallax.

An IntersectionObserver pauses the loops outside the viewport. Hidden tabs
and page suspension also stop motion. The pointer animation frame loop ends
as soon as it settles. Reduced-motion preferences disable ambient movement
and pointer response, including when changed while the page is open. Without
JavaScript, the original static composition remains visible. The custom
element cleans up listeners and observers when disconnected.

Only background layers move. There are no scroll handlers, and the headline,
laptop, header, and main element retain their original positions.

The hero retains `overflow: clip` to prevent fragment links from shifting
its contents. Its background surface remains white for the navigation and
page canvas. Validation uses the production build, hero browser checks, and
desktop/mobile screenshot review.

Verified on 2026-10-25: production build and Chromium/WebKit hero checks
passed at nine widths from 320 to 1920px, including links, keyboard access,
no-JS rendering, reduced motion, and the absence of the old scroll effect.
Visual review also checked 1280, 1360, and 1400px; the compact-desktop copy
stays on white. The responsive WebP files range from approximately 6–25KB.
Motion checks cover ambient movement, bounded cursor response, stable page
content, pointer exit, offscreen suspension, and live reduced-motion changes.

## Generation prompt

```text
Use case: stylized-concept. Asset type: high-key architectural background artwork for the hero of Lomi, a premium developer desktop application. Create a sophisticated photoreal 3D studio backdrop, wide landscape 1536x1024 or larger. Pure white seamless environment (#ffffff), luminous and calm. One large sculptural flowing ribbon made from softly frosted translucent glass with a restrained pale lime-green tint, subtly echoing brand accent #c8ff3d. The ribbon curves diagonally through the RIGHT HALF of the frame, rising near the upper right edge, bending elegantly down behind the central-right area and continuing beyond the bottom right edge. It should feel like a broad folded sheet of thick optical glass, with convincing material thickness, a narrow luminous lime edge, pale milky inner surfaces, softly refracted light, and beautifully controlled soft shadows. The shape must have a distinctive asymmetrical sweeping curve, not a circular ring, torus, tube, ball, or generic blob. Left 45% stays almost entirely pure white as clean negative space for a black headline; no objects or shadows crossing the headline region. Important compositing context: an existing large black laptop on a rough charcoal concrete plinth will be placed over the right half of this background later, covering most of the central-right and lower-right area. Place the interesting ribbon sweep above and behind that device, particularly across the upper right and along far right edge, so a graceful part remains visible around the laptop. Do not render any laptop, device, concrete plinth, platform, text, labels, logos, grid, guide lines, dots, borders, UI, watermarks or extra objects. Mood: bright, tactile, precise, premium product photography; subtle soft daylight and fine matte studio-surface texture. Keep edges of the overall canvas white so the image blends seamlessly into a white webpage. One accent color only, very pale lime green, with soft neutral gray material shadows. No blue, purple, rainbow, black background or neon glow. The overall image should remain mostly white with a beautifully crafted glass sweep, not a busy saturated wallpaper.
```
