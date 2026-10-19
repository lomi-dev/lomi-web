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

With JavaScript, selecting a preview opens a native dialog with the media and
description. Previous/next controls, dots, and arrow keys select another
feature. The description scrolls independently while navigation and the close
button stay visible. Escape or a backdrop click closes the dialog and restores
focus to the original preview. Resizing keeps that preview reachable.

The opening motion connects the selected thumbnail to the enlarged media.
Reduced motion uses short fades, including when the preference changes while
the dialog is open. Rapid navigation and close/reopen cancel stale animations.

Without JavaScript or native dialog support, every description stays visible
below its preview and the links jump to the matching text.

Run the focused browser checks against a built preview:

```sh
VERIFY_URL=http://localhost:4322 node scripts/verify-features.mjs
```
