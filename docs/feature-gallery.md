# Feature gallery

The gallery uses the existing `features` group in Payload: heading, accent,
and 1–12 feature items. Titles, item descriptions, and short detail labels
are rendered at build time; the old section description is no longer shown.
The website-editor migration adds image, video and alternative-text fields to
each feature, plus editable dialog labels.

The first preview occupies two rows beside two smaller previews; the remaining
features fill the lower grid. Tablet and phone layouts reduce the columns.
One or two published features use a simpler layout without empty lead cells.

When a feature has no uploaded media, its card and dialog show a composed
desktop render built from a Retina capture of the real Lomi React/Vite UI.
The six captures match the **Preview scene** choices: terminals, workspaces,
file editing, browser previews, Git, and AI tools. The supplied Tahoe wallpaper
fills the scene, with a light application window at 80% of its width. A
separate magnified crop brings the feature's relevant UI forward. Window
chrome, shadows, rounded edges, and crop placement are native HTML/CSS, so
the composition stays sharp and adapts to cards and dialogs. Short, wide
dialog panes reduce the window width to keep the complete window visible.

Source screenshots in `src/assets/product/renders/` use a 1440 × 900 CSS
viewport at 2× density. `scripts/capture-feature-renders.ts` reproduces them
from the neighboring desktop checkout using its existing deterministic
desktop and chat fixtures. Terminal scenes use the app's supported DOM
renderer for reliable headless capture. No live shell, provider, or agent is
invoked. The
browser scene stages a local page inside the real browser panel because the
test browser cannot paint a Tauri child WebView. See the script for fixture
details. The wallpaper is the user's supplied `tahoe-light.jpg`, copied
without modification; Astro generates the delivered WebP version.

These still renders replace the older GIF loops. All images load locally,
reserve their dimensions, and remain available without JavaScript and with
reduced motion. Only the primary app image has alternative text; the wallpaper,
window controls, and repeated detail crop are decorative. Uploading a feature
image or video replaces its render; with both selected, the image is the
video poster. Feature alternative text overrides the media-library description;
an empty override falls back to the file's description or the feature title.
See [the editing guide](cms-editing.md).

With JavaScript, selecting a preview opens a white native dialog. Desktop
places the media beside a panel containing the title, description, and
navigation; narrow windows stack the media above the text. Previous/next
controls, dots, and arrow keys select another feature. Native video controls
keep their own keyboard shortcuts. Hidden videos pause when navigating or
closing. The description scrolls independently while navigation and the close
button stay visible.
Escape or a backdrop click closes the dialog and restores focus to the original
preview. Resizing keeps that preview reachable.

The opening motion connects the selected thumbnail to the enlarged media.
Navigation moves the entire feature slide, including its media, description,
counter, arrows, dots, and divider, as one unit in the chosen direction. The
dialog frame and close button stay fixed. One live navigation is moved into
the selected slide, preserving its controls and keyboard focus; the outgoing
slide carries an inert static render snapshot. Repeated input completes the
current slide and proceeds directly to the latest requested feature, without
restarting the motion or building a queue of intermediate slides. Outgoing
slide copies are inert, excluded from accessibility, and removed when the
transition finishes.

Reduced motion uses short fades. Changing the motion preference or resizing
during a transition settles on the latest requested feature. Closing the
dialog removes temporary layers and prevents stale transitions after
reopening.

Without JavaScript or native dialog support, every description stays visible
below its preview and the links jump to the matching text.

Run the render checks against the built site. The script starts and
closes its own temporary static server when no verification URL is supplied:

```sh
bun run build
bun run verify:feature-previews
```

To export the six complete scenes as 1920 × 1200 PNGs, together with desktop
and mobile gallery previews, run `node scripts/export-feature-renders.mjs`
after building. Files are saved to `artifacts/feature-renders/`. The export
uses the site's actual composition, waits for all lazy images to decode,
and removes page chrome from the resulting images.
