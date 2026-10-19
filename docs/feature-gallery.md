# Feature gallery

The gallery uses the existing `features` group in Payload: heading, accent,
description, and 1–12 feature items. Titles, descriptions, and short detail
labels are rendered at build time. No schema or database migration is needed.

The first preview occupies two rows beside two smaller previews; the remaining
features fill the lower grid. Tablet and phone layouts reduce the columns.
One or two published features use a simpler layout without empty lead cells.

All previews currently use the same local Placehold images as the hero,
optimized by Astro. There are no feature videos, product screenshots, or
external media requests. Replace the placeholder selection in
`src/components/FeatureGallery.astro` when the final renders are available.

With JavaScript, selecting a preview opens a white native dialog. Desktop
places the media beside a panel containing the title, description, and
navigation; narrow windows stack the media above the text. Previous/next
controls, dots, and arrow keys select another feature. The description scrolls
independently while navigation and the close button stay visible. Escape or a
backdrop click closes the dialog and restores focus to the original preview.
Resizing keeps that preview reachable.

The opening motion connects the selected thumbnail to the enlarged media.
Navigation slides the media horizontally in the chosen direction while the
description moves a shorter distance and crossfades. Repeated input completes
the current slide and proceeds directly to the latest requested feature,
without restarting the motion or building a queue of intermediate slides.
Outgoing visual layers are inert, excluded from accessibility, and removed
when the transition finishes.

Reduced motion uses short fades. Changing the motion preference or resizing
during a transition settles on the latest requested feature. Closing the
dialog removes temporary layers and prevents stale transitions after reopening.

Without JavaScript or native dialog support, every description stays visible
below its preview and the links jump to the matching text.

Run the focused browser checks against a built preview:

```sh
VERIFY_URL=http://localhost:4322 node scripts/verify-features.mjs
```
